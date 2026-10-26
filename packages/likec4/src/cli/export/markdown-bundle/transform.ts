// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { parseLikeC4ViewBlock } from '@likec4/core/utils'
import { manifestKey } from '../image/manifest'

/**
 * A fenced code block opened with ``` and a single-token info-string, capturing
 * the leading newline (or start), the info-string, and the block body. Only
 * fences at the start of a line are matched, so indented/nested code is left
 * alone. Mirrors the shape of `FENCED_BLOCK_RE` in the language server's
 * `model-doc.ts`, reused here for the portable Markdown bundle rewriter.
 */
const FENCED_BLOCK_RE = /(^|\n)```([^\s`\n]+)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?=\n|$)/g

/** Options controlling the portable Markdown bundle transform. */
export interface TransformToBundleOptions {
  /**
   * The image manifest produced by the image pipeline (view key → image path
   * relative to the images directory). Looked up via {@link manifestKey}.
   */
  manifest: Record<string, string>
  /**
   * Optional base URL of an interactive LikeC4 site. When provided, each view
   * embed also gets a `View interactive version →` link. When absent, only the
   * static image is emitted (the bundle stays platform-neutral). Trailing
   * slashes are trimmed.
   */
  siteBaseUrl?: string
  /**
   * Route path of the document being transformed (no extension), e.g.
   * `adr/0001`. Used to compute the relative path from the document to the
   * images directory. Defaults to the root route.
   */
  docRoute?: string
  /**
   * Path of the images directory relative to the bundle output root, e.g.
   * `images`. Combined with {@link docRoute} to build the relative image
   * reference written into the Markdown. Defaults to `images`.
   */
  imagesDir?: string
}

/**
 * Trims trailing slashes from a base URL so a path can be appended with a single
 * separator.
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Builds the path of an image, relative to a document at `docRoute`, given the
 * image's path relative to `imagesDir` and the images directory's path relative
 * to the bundle output root. Forward-slashed, so it is portable Markdown.
 */
function relativeImagePath(docRoute: string, imagesDir: string, imagePath: string): string {
  const docDir = docRoute.includes('/') ? docRoute.slice(0, docRoute.lastIndexOf('/')) : ''
  const depth = docDir === '' ? 0 : docDir.split('/').length
  const prefix = depth === 0 ? '' : '../'.repeat(depth)
  const target = imagesDir === '' ? imagePath : `${imagesDir}/${imagePath}`
  return `${prefix}${target}`
}

/**
 * Transforms a doc's raw Markdown into portable, platform-neutral Markdown for
 * an external publisher (Confluence, etc.).
 *
 * - ```likec4-view embeds become a static Markdown image referencing the
 *   exported image by RELATIVE path, optionally followed by a
 *   `View interactive version →` link when `siteBaseUrl` is given.
 * - ```mermaid blocks are left as ```mermaid fenced blocks so the downstream
 *   publisher decides how to render them.
 * - An embed that cannot be resolved (no view id, parse errors, or no manifest
 *   entry) is left as its original fenced block so the failure stays visible.
 *
 * Standard Markdown only; no Confluence-specific markup.
 *
 * Pure: depends only on its arguments, no I/O, never throws.
 */
export function transformToBundle(raw: string, opts: TransformToBundleOptions): string {
  const imagesDir = opts.imagesDir ?? 'images'
  const docRoute = opts.docRoute ?? ''
  const siteBase = opts.siteBaseUrl !== undefined ? trimTrailingSlash(opts.siteBaseUrl) : undefined
  return raw.replace(FENCED_BLOCK_RE, (whole, lead: string, info: string, blockBody: string) => {
    if (info !== 'likec4-view') {
      // ```mermaid and every other fenced block pass through unchanged.
      return whole
    }
    const parsed = parseLikeC4ViewBlock(blockBody)
    if (parsed.errors.length > 0 || parsed.viewId === undefined) {
      return whole
    }
    const viewId = parsed.viewId
    const variant = parsed.state.dynamic === 'sequence' ? 'sequence' : undefined
    const imagePath = opts.manifest[manifestKey(viewId, variant)]
    if (imagePath === undefined) {
      return whole
    }
    const src = relativeImagePath(docRoute, imagesDir, imagePath)
    const image = `![${viewId}](${src})`
    if (siteBase === undefined) {
      return `${lead}${image}`
    }
    const link = `[View interactive version →](${siteBase}/view/${viewId})`
    return `${lead}${image}\n\n${link}`
  })
}
