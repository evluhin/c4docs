// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel, DocTreeNode } from '@likec4/core'
import { docFilePath } from './transform'

/**
 * A single mkdocs `nav:` entry: either a labeled link to a page file, or a
 * labeled section with nested children.
 */
export type MkDocsNavEntry =
  | { label: string; file: string }
  | { label: string; children: MkDocsNavEntry[] }

/**
 * Builds mkdocs-style nav entries from the resolved {@link DocsModel.tree}.
 *
 * The language server already resolves `docs/nav.yaml` (sections, labels,
 * order) versus the convention tree into a single `tree`, so this reads the
 * tree directly:
 * - a `folder` node becomes a section (`label` + nested children),
 * - a `doc` node becomes a link to its {@link docFilePath}.
 *
 * Pure: no I/O.
 */
export function buildMkDocsNavEntries(tree: readonly DocTreeNode[]): MkDocsNavEntry[] {
  const entries: MkDocsNavEntry[] = []
  for (const node of tree) {
    if (node.kind === 'folder') {
      entries.push({ label: node.label, children: buildMkDocsNavEntries(node.children ?? []) })
    } else {
      entries.push({ label: node.label, file: docFilePath(node.path) })
    }
  }
  return entries
}

/** Quotes a YAML scalar when it contains characters that need escaping. */
function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9 _./-]+$/.test(value) && value.trim() === value && value !== '') {
    return value
  }
  return `'${value.replace(/'/g, '\'\'')}'`
}

/**
 * Serializes nav entries into the lines of a mkdocs `nav:` block, indented two
 * spaces per level. Returned as a list of lines (without a trailing newline).
 */
function navEntryLines(entries: readonly MkDocsNavEntry[], indent: string): string[] {
  const lines: string[] = []
  for (const entry of entries) {
    if ('children' in entry) {
      lines.push(`${indent}- ${yamlScalar(entry.label)}:`)
      lines.push(...navEntryLines(entry.children, `${indent}    `))
    } else {
      lines.push(`${indent}- ${yamlScalar(entry.label)}: ${yamlScalar(entry.file)}`)
    }
  }
  return lines
}

/**
 * Emits a valid mkdocs `nav:` YAML block from the docs model tree.
 *
 * The tree already reflects `docs/nav.yaml` when present (order, nesting,
 * section labels) and the convention tree otherwise, so both cases flow through
 * the same code path.
 *
 * Pure: no I/O. Returns the `nav:` block with a trailing newline.
 */
export function buildMkDocsNav(docsModel: DocsModel): string {
  const entries = buildMkDocsNavEntries(docsModel.tree)
  if (entries.length === 0) {
    return 'nav: []\n'
  }
  return `nav:\n${navEntryLines(entries, '  ').join('\n')}\n`
}
