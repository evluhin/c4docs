// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Pure helpers for the optional `docs/nav.yaml` explicit navigation (mkdocs-style).
 *
 * When `docs/nav.yaml` exists, the docs tree is built ENTIRELY from it (order,
 * nesting, section labels) and the convention ordering is ignored; the two are
 * mutually exclusive and never merged. This module stays pure (no I/O) so it can
 * be unit-tested without touching disk; the service wires it into `buildDocsModel`.
 */

import type { DocPage, DocsModel, DocTreeNode } from '@likec4/core/types'
import { parse as parseYaml } from 'yaml'
import { humanizeTitle } from './model-doc'

/**
 * A single entry of a parsed `nav:` list.
 *
 * - `doc`: a link to a page, with an optional explicit label and the normalized
 *   route path (as produced by the injected `docRoutePath`).
 * - `section`: a labeled group with nested children.
 */
export type NavEntry =
  | { kind: 'doc'; label?: string | undefined; path: string }
  | { kind: 'section'; label: string; children: NavEntry[] }

/** A lenient nav diagnostic: a human message plus the offending target, if any. */
export interface NavDiagnostic {
  message: string
  /** the route path or raw value the diagnostic refers to */
  target?: string
}

export interface ParseNavResult {
  entries: NavEntry[]
  diagnostics: NavDiagnostic[]
  /** `true` when the YAML threw, or `nav:` is missing / not a list */
  malformed: boolean
}

export interface ParseNavOptions {
  /**
   * The set of known doc route paths (as produced by `docRoutePath`), e.g. `''`,
   * `'architecture'`, `'adr/0001-...'`. A listed entry whose route is not in this
   * set produces a diagnostic (the entry is still kept).
   */
  knownPaths: ReadonlySet<string>
  /** Maps a `path.md` (relative to the docs dir) to its route path. */
  docRoutePath: (relativePath: string) => string
}

/**
 * Parses the mkdocs-style `nav:` list from `docs/nav.yaml`.
 *
 * Accepts, under the top-level `nav:` key, a list whose items are:
 * - `Label: path.md` — a labeled doc link
 * - `path.md` — a bare doc link (label derived later)
 * - `Section Label:` with a nested list — a section with children
 *
 * Each `path.md` is normalized via {@link ParseNavOptions.docRoutePath} (so
 * `index.md` → `''` and the `.md` extension is optional). An entry whose route
 * is not in `knownPaths` is recorded as a diagnostic but still kept.
 *
 * Lenient by contract: a YAML parse error, or a missing / non-list `nav:` key,
 * yields `{ entries: [], diagnostics: [warning], malformed: true }` and never throws.
 */
export function parseNavYaml(source: string, options: ParseNavOptions): ParseNavResult {
  const diagnostics: NavDiagnostic[] = []

  let parsed: unknown
  try {
    parsed = parseYaml(source)
  } catch (err) {
    return {
      entries: [],
      diagnostics: [{ message: `Malformed nav.yaml: ${err instanceof Error ? err.message : String(err)}` }],
      malformed: true,
    }
  }

  const nav = isRecord(parsed) ? parsed['nav'] : undefined
  if (!Array.isArray(nav)) {
    return {
      entries: [],
      diagnostics: [{ message: 'Malformed nav.yaml: expected a top-level "nav" list' }],
      malformed: true,
    }
  }

  const entries = parseEntries(nav, options, diagnostics)
  return { entries, diagnostics, malformed: false }
}

function parseEntries(
  items: readonly unknown[],
  options: ParseNavOptions,
  diagnostics: NavDiagnostic[],
): NavEntry[] {
  const entries: NavEntry[] = []
  for (const item of items) {
    const entry = parseEntry(item, options, diagnostics)
    if (entry) {
      entries.push(entry)
    }
  }
  return entries
}

function parseEntry(
  item: unknown,
  options: ParseNavOptions,
  diagnostics: NavDiagnostic[],
): NavEntry | null {
  switch (true) {
    // bare `path.md`
    case typeof item === 'string':
      return toDocEntry(undefined, item, options, diagnostics)
    // `Label: path.md` or `Section Label:` with a nested list
    case isRecord(item): {
      const keys = Object.keys(item)
      if (keys.length !== 1) {
        diagnostics.push({ message: `Ignoring nav entry with ${keys.length} keys (expected exactly one)` })
        return null
      }
      const label = keys[0]!
      const value = item[label]
      if (Array.isArray(value)) {
        return {
          kind: 'section',
          label,
          children: parseEntries(value, options, diagnostics),
        }
      }
      if (typeof value === 'string') {
        return toDocEntry(label, value, options, diagnostics)
      }
      diagnostics.push({
        message: `Ignoring nav entry "${label}": expected a path or a nested list`,
        target: label,
      })
      return null
    }
    default:
      diagnostics.push({ message: `Ignoring unsupported nav entry: ${JSON.stringify(item)}` })
      return null
  }
}

function toDocEntry(
  label: string | undefined,
  rawPath: string,
  options: ParseNavOptions,
  diagnostics: NavDiagnostic[],
): NavEntry {
  const path = options.docRoutePath(rawPath)
  if (!options.knownPaths.has(path)) {
    diagnostics.push({
      message: `nav entry points at a non-existent doc "${rawPath}" (route "${path || '/'}")`,
      target: path,
    })
  }
  return { kind: 'doc', label, path }
}

export interface AssembleNavTreeOptions {
  /** `docs.entry` from config (route path, no extension), if set */
  entryConfig?: string | undefined
}

export interface AssembleNavTreeResult extends DocsModel {
  /** route paths of discovered pages not referenced by nav (hidden from the tree) */
  hidden: string[]
}

/**
 * Maps parsed {@link NavEntry}s to a {@link DocsModel} in list order.
 *
 * - sections become `kind: 'folder'` nodes with children; docs become `kind: 'doc'`.
 * - label precedence for a doc: explicit nav label → the page's derived title
 *   (its `# heading` or humanized filename from modeling) → `humanizeTitle(path)`.
 * - `order` is the implicit list position (increasing integers).
 * - pages not referenced by nav are HIDDEN: kept in `pages`, omitted from `tree`,
 *   and returned in `hidden` so the caller can warn.
 * - `entry`: `entryConfig` override → else the first nav entry's route
 *   (a nav `index.md` maps to `''`) → else the first page → `null`.
 */
export function assembleDocsTreeFromNav(
  pages: readonly DocPage[],
  navEntries: readonly NavEntry[],
  options: AssembleNavTreeOptions = {},
): AssembleNavTreeResult {
  const pagesByPath: Record<string, DocPage> = {}
  for (const page of pages) {
    pagesByPath[page.path] = page
  }

  const referenced = new Set<string>()
  const counter = { next: 0 }
  const tree = buildNavNodes(navEntries, pagesByPath, referenced, counter)

  const hidden = pages
    .map((p) => p.path)
    .filter((path) => !referenced.has(path))
    .sort()

  const entry = resolveNavEntry(pages, pagesByPath, navEntries, options.entryConfig)

  return { tree, pages: pagesByPath, entry, hidden }
}

function buildNavNodes(
  entries: readonly NavEntry[],
  pagesByPath: Record<string, DocPage>,
  referenced: Set<string>,
  counter: { next: number },
): DocTreeNode[] {
  const nodes: DocTreeNode[] = []
  for (const entry of entries) {
    const order = counter.next++
    if (entry.kind === 'section') {
      nodes.push({
        kind: 'folder',
        label: entry.label,
        path: '',
        order,
        children: buildNavNodes(entry.children, pagesByPath, referenced, counter),
      })
      continue
    }
    referenced.add(entry.path)
    const page = pagesByPath[entry.path]
    const label = (typeof entry.label === 'string' && entry.label.trim() !== '')
      ? entry.label.trim()
      : (page?.title ?? humanizeTitle(entry.path))
    nodes.push({
      kind: 'doc',
      label,
      path: entry.path,
      order,
    })
  }
  return nodes
}

/**
 * Finds the first `doc` entry in nav order (depth-first), used as the default entry.
 */
function firstNavDocPath(entries: readonly NavEntry[]): string | null {
  for (const entry of entries) {
    if (entry.kind === 'doc') {
      return entry.path
    }
    const nested = firstNavDocPath(entry.children)
    if (nested != null) {
      return nested
    }
  }
  return null
}

function resolveNavEntry(
  pages: readonly DocPage[],
  pagesByPath: Record<string, DocPage>,
  navEntries: readonly NavEntry[],
  entryConfig: string | undefined,
): string | null {
  if (entryConfig != null) {
    const normalized = entryConfig.replace(/\.md$/i, '').replace(/^\/+/, '')
    const routePath = normalized === 'index' ? '' : normalized
    if (pagesByPath[routePath]) {
      return routePath
    }
  }
  const first = firstNavDocPath(navEntries)
  if (first != null && pagesByPath[first]) {
    return first
  }
  if (pages.length > 0) {
    return pages[0]!.path
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
