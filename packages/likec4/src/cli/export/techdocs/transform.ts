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
 * `model-doc.ts`, but this rewriter targets TechDocs Markdown output.
 */
const FENCED_BLOCK_RE = /(^|\n)```([^\s`\n]+)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?=\n|$)/g

/**
 * Markdown inline links `[text](target "title")` that are NOT images (a leading
 * `!` excludes those). Mirrors the shape used in the language server's
 * `model-doc.ts` so both rewriters stay consistent.
 */
const LINK_RE = /(^|[^!])(\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g

/**
 * Maps a doc route path (no extension) to its TechDocs Markdown file path under
 * `docs/`. The root route maps to `index.md`; every other route `r` maps to
 * `r.md`. Used by both the nav builder and the page writer so the two agree.
 */
export function docFilePath(route: string): string {
  return route === '' ? 'index.md' : `${route}.md`
}

/** Options controlling the TechDocs transform. */
export interface TransformToTechDocsOptions {
  /**
   * The image manifest produced by the image pipeline (view key →
   * image path relative to its output dir). Looked up via {@link manifestKey}.
   */
  manifest: Record<string, string>
  /**
   * Base URL of the interactive LikeC4 site, used to build the
   * `View interactive version` link. Trailing slashes are trimmed.
   */
  siteBaseUrl: string
  /** Route path of the document being transformed (no extension), e.g. `adr/0001`. */
  docRoute: string
  /** The set of known doc route paths, used to validate inter-doc `.md` links. */
  knownPaths: ReadonlySet<string>
  /**
   * Path, relative to the images output directory, where images live in the
   * TechDocs tree, e.g. `images`. Prepended to each manifest image path so the
   * rewritten Markdown `![]()` resolves from `docs/`. Defaults to `images`.
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
 * to the `docs/` root. Forward-slashed.
 *
 * MkDocs resolves Markdown image links relative to the source `.md` file's
 * location (and rewrites them to compensate for `use_directory_urls`), so a
 * nested page such as `docs/adr/0001.md` must reach `docs/images/` through the
 * matching number of `../` segments. A root-level page keeps the bare
 * `images/<file>` reference.
 */
function relativeImagePath(docRoute: string, imagesDir: string, imagePath: string): string {
  const docDir = docRoute.includes('/') ? docRoute.slice(0, docRoute.lastIndexOf('/')) : ''
  const depth = docDir === '' ? 0 : docDir.split('/').length
  const prefix = depth === 0 ? '' : '../'.repeat(depth)
  const target = imagesDir === '' ? imagePath : `${imagesDir}/${imagePath}`
  return `${prefix}${target}`
}

/**
 * Builds the TechDocs page path (relative, with `.md`) for a target doc route,
 * resolved from the current doc's folder. The root route maps to `index.md`.
 */
function techdocsPagePath(fromRoute: string, toRoute: string): string {
  const fromDir = fromRoute.includes('/') ? fromRoute.slice(0, fromRoute.lastIndexOf('/')) : ''
  const fromSegments = fromDir === '' ? [] : fromDir.split('/')
  const toSegments = toRoute === '' ? ['index'] : toRoute.split('/')

  // Longest common prefix of the two directories.
  let common = 0
  const toDirSegments = toSegments.slice(0, -1)
  while (
    common < fromSegments.length
    && common < toDirSegments.length
    && fromSegments[common] === toDirSegments[common]
  ) {
    common++
  }

  const up = fromSegments.length - common
  const relative: string[] = []
  for (let i = 0; i < up; i++) {
    relative.push('..')
  }
  relative.push(...toSegments.slice(common))
  const joined = relative.join('/')
  return `${joined}.md`
}

function isExternalOrAnchor(target: string): boolean {
  return (
    target.startsWith('#')
    || target.startsWith('/')
    || target.startsWith('likec4://')
    || /^[a-z][a-z0-9+.-]*:/i.test(target)
  )
}

function resolveAgainstDoc(docRoute: string, target: string): string {
  const docDir = docRoute.includes('/') ? docRoute.slice(0, docRoute.lastIndexOf('/')) : ''
  const base = docDir === '' ? [] : docDir.split('/')
  const stack = [...base]
  for (const segment of target.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') {
      continue
    }
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

/**
 * Rewrites every ```likec4-view embed into a static Markdown image reference to
 * the manifest image plus a `View interactive version →` link to the site.
 *
 * An embed that cannot be resolved (no view id, or no manifest entry) is left as
 * its original fenced block so the failure is visible in the output.
 */
function rewriteViewEmbeds(body: string, opts: TransformToTechDocsOptions): string {
  const imagesDir = opts.imagesDir ?? 'images'
  const siteBase = trimTrailingSlash(opts.siteBaseUrl)
  return body.replace(FENCED_BLOCK_RE, (whole, lead: string, info: string, blockBody: string) => {
    if (info !== 'likec4-view') {
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
    const src = relativeImagePath(opts.docRoute, imagesDir, imagePath)
    const image = `![${viewId}](${src})`
    const link = `[View interactive version →](${siteBase}/view/${viewId})`
    return `${lead}${image}\n\n${link}`
  })
}

/**
 * Rewrites `likec4://view/<id>` links to the interactive-site view URL.
 */
function rewriteViewLinks(body: string, opts: TransformToTechDocsOptions): string {
  const siteBase = trimTrailingSlash(opts.siteBaseUrl)
  return body.replace(LINK_RE, (whole, prefix: string, open: string, target: string, title = '', close: string) => {
    const match = /^likec4:\/\/view\/([^?#\s]+)(?:[?#]\S*)?$/.exec(target)
    if (!match) {
      return whole
    }
    const href = `${siteBase}/view/${match[1]!}`
    return `${prefix}${open}${href}${title}${close}`
  })
}

/**
 * Rewrites inter-doc relative `.md` links to TechDocs page routes (relative
 * `.md` references, not SPA `/docs/` routes). A target that does not resolve
 * into `knownPaths` is left unchanged.
 */
function rewriteDocLinks(body: string, opts: TransformToTechDocsOptions): string {
  return body.replace(LINK_RE, (whole, prefix: string, open: string, target: string, title = '', close: string) => {
    if (isExternalOrAnchor(target)) {
      return whole
    }
    const hashIndex = target.indexOf('#')
    const anchor = hashIndex >= 0 ? target.slice(hashIndex) : ''
    let pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target
    const queryIndex = pathPart.indexOf('?')
    if (queryIndex >= 0) {
      pathPart = pathPart.slice(0, queryIndex)
    }
    if (!/\.md$/i.test(pathPart)) {
      return whole
    }
    const resolved = resolveAgainstDoc(opts.docRoute, pathPart.replace(/\.md$/i, ''))
    if (!opts.knownPaths.has(resolved)) {
      return whole
    }
    const href = `${techdocsPagePath(opts.docRoute, resolved)}${anchor}`
    return `${prefix}${open}${href}${title}${close}`
  })
}

/**
 * Transforms a doc's raw Markdown into TechDocs-compatible Markdown.
 *
 * - ```likec4-view embeds become a static image (from `manifest`) plus a
 *   `View interactive version →` link to the interactive site.
 * - ```mermaid blocks are passed through unchanged (TechDocs renders them).
 * - `likec4://view/<id>` links are rewritten to the interactive-site view URL.
 * - inter-doc relative `.md` links are rewritten to relative TechDocs page routes.
 *
 * Pure: depends only on its arguments, no I/O, never throws.
 */
export function transformToTechDocs(raw: string, opts: TransformToTechDocsOptions): string {
  // Embeds first (they consume fenced blocks); mermaid blocks are untouched by
  // the embed rewriter and therefore pass through verbatim.
  let out = rewriteViewEmbeds(raw, opts)
  out = rewriteViewLinks(out, opts)
  out = rewriteDocLinks(out, opts)
  return out
}
