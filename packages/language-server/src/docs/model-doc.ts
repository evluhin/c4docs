// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocAsset, DocFrontmatter, DocPage } from '@likec4/core/types'
import { markdownToHtml } from '@likec4/core/utils'
import { parse as parseYaml } from 'yaml'

/**
 * A `---` fenced block at the very start of a document, followed by the body.
 * The first capture is the YAML frontmatter block (without the delimiters), the
 * second is everything after it. The body is kept intact so `raw` stays byte-for-byte.
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*)|$)/

export interface ModelDocInput {
  /** route path (no extension) */
  path: string
  /** absolute path of the source file, used to resolve relative assets */
  sourceAbsPath: string
  /** raw file content, preserved byte-for-byte */
  raw: string
  /**
   * Resolve a relative asset reference (as written in the doc) against the doc's
   * folder and return the absolute source path plus the output path the rewritten
   * `src` should point to. Return `null` to leave the reference untouched.
   */
  resolveAsset?: (reference: string) => DocAsset | null
}

/**
 * Splits leading frontmatter from the body.
 * No frontmatter → empty object, body is the full source.
 */
export function splitFrontmatter(raw: string): { frontmatter: DocFrontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) {
    return { frontmatter: {}, body: raw }
  }
  const [, yamlBlock, rest] = match
  let frontmatter: DocFrontmatter = {}
  try {
    const parsed = parseYaml(yamlBlock ?? '')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as DocFrontmatter
    }
  } catch {
    // Malformed frontmatter is lenient: treat as no frontmatter metadata.
    frontmatter = {}
  }
  return { frontmatter, body: rest ?? '' }
}

/**
 * Humanize a route path's last segment into a title, e.g.
 * '0001-use-event-bus' → '0001 Use Event Bus'.
 */
export function humanizeTitle(path: string): string {
  const segment = path.split('/').filter(Boolean).pop() ?? path
  const base = segment || 'index'
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Derives a title: frontmatter `title` → first `#` ATX heading in the body →
 * humanized filename.
 */
export function deriveTitle(frontmatter: DocFrontmatter, body: string, path: string): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim() !== '') {
    return frontmatter.title.trim()
  }
  const heading = /^[ \t]*#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)
  if (heading && heading[1]) {
    return heading[1].trim()
  }
  return humanizeTitle(path)
}

/**
 * Extracts relative asset references (Markdown images with relative paths),
 * resolves them, and returns both the manifest and a body with each reference
 * rewritten to its output path. Absolute URLs and `likec4://` links are left alone.
 */
function resolveAssets(
  body: string,
  resolveAsset: ((reference: string) => DocAsset | null) | undefined,
): { body: string; assets: DocAsset[] } {
  if (!resolveAsset) {
    return { body, assets: [] }
  }
  const assets: DocAsset[] = []
  const seen = new Set<string>()
  // Markdown images: ![alt](target "title")
  const imageRe = /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g
  const rewritten = body.replace(imageRe, (whole, open: string, target: string, title = '', close: string) => {
    if (isExternalOrAnchor(target)) {
      return whole
    }
    const resolved = resolveAsset(target)
    if (!resolved) {
      return whole
    }
    if (!seen.has(resolved.sourceAbsPath)) {
      seen.add(resolved.sourceAbsPath)
      assets.push(resolved)
    }
    return `${open}${resolved.outputPath}${title}${close}`
  })
  return { body: rewritten, assets }
}

function isExternalOrAnchor(target: string): boolean {
  return (
    target.startsWith('#')
    || target.startsWith('/')
    || target.startsWith('likec4://')
    || /^[a-z][a-z0-9+.-]*:/i.test(target)
  )
}

/**
 * Models a single doc file into a {@link DocPage}:
 * - `raw` preserved byte-for-byte
 * - frontmatter split and parsed
 * - relative assets resolved and `src` rewritten
 * - body rendered to sanitized HTML via the existing `markdownToHtml`
 * - title derived (frontmatter → first heading → humanized filename)
 *
 * Phase 1 keeps `refs`/`links` empty (populated in Phase 2).
 */
export function modelDocFile(input: ModelDocInput): DocPage {
  const { path, raw } = input
  const { frontmatter, body } = splitFrontmatter(raw)
  const { body: bodyWithAssets, assets } = resolveAssets(body, input.resolveAsset)
  const html = markdownToHtml(bodyWithAssets)
  const title = deriveTitle(frontmatter, body, path)
  return {
    path,
    title,
    frontmatter,
    html,
    raw,
    refs: [],
    links: [],
    assets,
  }
}
