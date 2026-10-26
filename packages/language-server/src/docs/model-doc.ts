// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramRef, DocAsset, DocFrontmatter, DocPage, Fqn, ViewId } from '@likec4/core/types'
import { markdownToHtml, parseLikeC4ViewBlock } from '@likec4/core/utils'
import { parse as parseYaml } from 'yaml'
import { docRoutePath, encodeRoutePath } from './discovery'

/**
 * A `---` fenced block at the very start of a document, followed by the body.
 * The first capture is the YAML frontmatter block (without the delimiters), the
 * second is everything after it. The body is kept intact so `raw` stays byte-for-byte.
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*)|$)/

/**
 * Resolved state carried on a `likec4://view/<id>?focus=..&dynamic=..` link,
 * mapped onto the in-app diagram route's search params.
 */
export interface DocViewLinkState {
  /** `?focus=` → the view's `focusOnElement` search param */
  focus?: string
  /** `?dynamic=` → the diagram's `dynamic` search param */
  dynamic?: 'diagram' | 'sequence'
}

/**
 * Options that let modeling rewrite inter-doc and `likec4://` links. All are
 * optional: when the whole bag is absent, {@link modelDocFile} leaves links
 * untouched (Phase 1 behavior) and keeps `links` empty with no diagnostics.
 */
export interface DocLinkResolution {
  /**
   * The set of known doc route paths (as produced by {@link docRoutePath}),
   * e.g. `''`, `'architecture'`, `'adr/0001-...'`. A relative `.md` target that
   * does not resolve into this set is left unchanged and reported as a diagnostic.
   */
  knownPaths: ReadonlySet<string>
  /** Whether a given view id exists in the computed model. */
  viewExists: (viewId: string) => boolean
  /** Builds the in-app diagram route href for a view id and its link state. */
  routeFor: (viewId: string, state: DocViewLinkState) => string
}

/** A lenient modeling diagnostic: a human message plus the offending target. */
export interface DocLinkDiagnostic {
  message: string
  target: string
}

/**
 * Optional context that lets modeling resolve ```likec4-view embeds against the
 * computed model. When omitted, {@link modelDocFile} still extracts embeds into
 * placeholders but marks every ref unresolved (`resolved: false`), so Phase-1-style
 * callers keep working.
 */
export interface DocViewResolution {
  /** Whether a given view id exists in the computed model. */
  viewExists: (viewId: string) => boolean
  /** Whether a given element FQN exists in the computed model (validates `focus`). */
  elementExists: (fqn: string) => boolean
}

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
  /**
   * Optional link-rewriting context. When omitted, inter-doc and `likec4://`
   * links are left untouched (Phase 1 behavior).
   */
  linkResolution?: DocLinkResolution
  /**
   * Optional ```likec4-view resolution context. When omitted, embeds are still
   * extracted into placeholders and collected into `refs`, but every ref stays
   * unresolved (`resolved: false`).
   */
  viewResolution?: DocViewResolution
  /**
   * Receives lenient link diagnostics (unknown doc targets, unknown view ids)
   * collected while modeling. Never throws; the caller decides how to surface them.
   */
  onDiagnostics?: (diagnostics: readonly DocLinkDiagnostic[]) => void
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
 * Markdown inline links `[text](target "title")` that are NOT images
 * (a leading `!` excludes those). Mirrors the asset regex shape so both
 * rewriters stay consistent.
 */
const LINK_RE = /(^|[^!])(\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g

/**
 * Decodes each `/`-separated segment of a relative path with
 * {@link decodeURIComponent}, leaving the separators intact. Malformed escapes
 * are left as-is (lenient). This maps a `%20`-encoded link target back to the
 * human route key that stores a literal space.
 */
function decodePathSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

/**
 * Resolves a relative path against the current doc's folder, returning a
 * normalized forward-slash path with no leading slash or `./`/`../` segments.
 */
function resolveAgainstDoc(docRoute: string, target: string): string {
  const docDir = docRoute.includes('/') ? docRoute.slice(0, docRoute.lastIndexOf('/')) : ''
  const base = docDir === '' ? [] : docDir.split('/')
  const segments = target.replace(/\\/g, '/').split('/')
  const stack = [...base]
  for (const segment of segments) {
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
 * Rewrites inter-doc relative `.md` links to in-app `/docs/<route>` hrefs.
 *
 * - images are skipped (handled by {@link resolveAssets})
 * - external URLs, root-absolute paths, bare anchors, and `likec4://` links are
 *   left untouched ({@link isExternalOrAnchor})
 * - a relative target ending in `.md` (optionally with `#anchor`/`?query`) is
 *   resolved against the current doc's folder, normalized via {@link docRoutePath},
 *   and mapped to `/docs/<route>` (root route → `/docs/`); any `#anchor` is preserved
 * - a relative `.md` target not in `knownPaths` is left unchanged and reported
 *
 * Pure: returns the rewritten body plus any diagnostics.
 */
export function resolveDocLinks(
  body: string,
  opts: { docRoute: string; knownPaths: ReadonlySet<string> },
): { body: string; diagnostics: DocLinkDiagnostic[] } {
  const diagnostics: DocLinkDiagnostic[] = []
  const rewritten = body.replace(
    LINK_RE,
    (whole, prefix: string, open: string, target: string, title = '', close: string) => {
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
      // Decode per segment so a `%20`-encoded relative target resolves to the
      // human route key (which keeps a literal space). The href is re-encoded
      // per segment below via encodeRoutePath, so the whole thing round-trips.
      const decodedPathPart = decodePathSegments(pathPart)
      const resolvedPath = resolveAgainstDoc(opts.docRoute, decodedPathPart)
      const route = docRoutePath(resolvedPath)
      if (!opts.knownPaths.has(route)) {
        diagnostics.push({
          message: `Doc link target not found: "${target}"`,
          target,
        })
        return whole
      }
      const href = `/docs/${encodeRoutePath(route)}${anchor}`
      return `${prefix}${open}${href}${title}${close}`
    },
  )
  return { body: rewritten, diagnostics }
}

/**
 * Parses the `?focus=` and `?dynamic=` query of a `likec4://view/<id>` link.
 */
function parseViewLinkState(query: string): DocViewLinkState {
  const params = new URLSearchParams(query)
  const state: DocViewLinkState = {}
  const focus = params.get('focus')
  if (focus) {
    state.focus = focus
  }
  const dynamic = params.get('dynamic')
  if (dynamic === 'diagram' || dynamic === 'sequence') {
    state.dynamic = dynamic
  }
  return state
}

/**
 * Rewrites `likec4://view/<id>[?focus=..&dynamic=..]` links to the in-app
 * diagram route via `opts.routeFor`, collecting resolved view ids into `links`
 * (deduped, in document order). Unknown view ids are left untouched and reported.
 *
 * Pure: returns the rewritten body, the collected links, and any diagnostics.
 */
export function resolveViewLinks(
  body: string,
  opts: { viewExists: (viewId: string) => boolean; routeFor: (viewId: string, state: DocViewLinkState) => string },
): { body: string; links: ViewId[]; diagnostics: DocLinkDiagnostic[] } {
  const links: ViewId[] = []
  const seen = new Set<string>()
  const diagnostics: DocLinkDiagnostic[] = []
  const rewritten = body.replace(
    LINK_RE,
    (whole, prefix: string, open: string, target: string, title = '', close: string) => {
      const match = /^likec4:\/\/view\/([^?#\s]+)(\?[^#\s]*)?$/.exec(target)
      if (!match) {
        return whole
      }
      const viewId = match[1]!
      if (!opts.viewExists(viewId)) {
        diagnostics.push({
          message: `Doc links to unknown view: "${viewId}"`,
          target,
        })
        return whole
      }
      const state = parseViewLinkState(match[2]?.slice(1) ?? '')
      if (!seen.has(viewId)) {
        seen.add(viewId)
        links.push(viewId as ViewId)
      }
      const href = opts.routeFor(viewId, state)
      return `${prefix}${open}${href}${title}${close}`
    },
  )
  return { body: rewritten, links, diagnostics }
}

/**
 * Matches a fenced code block opened with ``` and a single-token info-string,
 * capturing the info-string and the block body. Only fences that start at the
 * beginning of a line (optionally after the preceding newline) are matched, so
 * indented/nested code is left alone — mirroring {@link resolveAssets}' guard.
 */
const FENCED_BLOCK_RE = /(^|\n)```([^\s`\n]+)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?=\n|$)/g

/** HTML-escapes `&`, `<`, and `>` so rehype-sanitize keeps a plain text child. */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Computes the 1-based line and column of an offset within the source body.
 */
function lineColumnAt(body: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < offset; i++) {
    if (body[i] === '\n') {
      line++
      lastNewline = i
    }
  }
  return { line, column: offset - lastNewline }
}

/**
 * Finds fenced ```likec4-view blocks, replaces each with the sanitizer-safe
 * placeholder `<div data-likec4-view-embed="<index>"></div>` (0-based document
 * order), parses the block via {@link parseLikeC4ViewBlock}, resolves the view id
 * and `focus` element against `opts`, and collects a {@link DiagramRef} per block.
 *
 * Invalid refs are KEPT (`resolved: false` with an `error`) — never dropped.
 *
 * Pure: returns the rewritten body, the refs in document order, and any diagnostics.
 */
export function extractLikeC4ViewEmbeds(
  body: string,
  opts: { path: string; resolution?: DocViewResolution },
): { body: string; refs: DiagramRef[]; diagnostics: DocLinkDiagnostic[] } {
  const refs: DiagramRef[] = []
  const diagnostics: DocLinkDiagnostic[] = []
  let index = 0
  const rewritten = body.replace(
    FENCED_BLOCK_RE,
    (whole, lead: string, info: string, blockBody: string, matchOffset: number) => {
      if (info !== 'likec4-view') {
        return whole
      }
      const current = index++
      // Position of the opening fence (after the leading newline, if any).
      const fenceOffset = matchOffset + lead.length
      const { line, column } = lineColumnAt(body, fenceOffset)

      const parsed = parseLikeC4ViewBlock(blockBody)
      const errorMessages = parsed.errors.map((e) => e.message)

      let resolved = parsed.errors.length === 0 && parsed.viewId !== undefined
      if (resolved && opts.resolution) {
        if (!opts.resolution.viewExists(parsed.viewId!)) {
          resolved = false
          errorMessages.push(`Unknown view: "${parsed.viewId}"`)
        } else if (parsed.state.focus !== undefined && !opts.resolution.elementExists(parsed.state.focus)) {
          resolved = false
          errorMessages.push(`Unknown focus element: "${parsed.state.focus}"`)
        }
      } else if (resolved && !opts.resolution) {
        // No resolution context: keep as unresolved without inventing an error.
        resolved = false
      }

      const state: DiagramRef['state'] = {}
      if (parsed.state.focus !== undefined) {
        state.focus = parsed.state.focus as Fqn
      }
      if (parsed.state.dynamic !== undefined) {
        state.dynamic = parsed.state.dynamic
      }
      if (parsed.state.theme !== undefined) {
        state.theme = parsed.state.theme
      }
      if (parsed.state.padding !== undefined) {
        state.padding = parsed.state.padding
      }

      const ref: DiagramRef = {
        viewId: (parsed.viewId ?? '') as ViewId,
        state,
        sourceLocation: { path: opts.path, line, column },
        resolved,
      }
      if (errorMessages.length > 0) {
        ref.error = errorMessages.join('; ')
        for (const message of errorMessages) {
          diagnostics.push({ message, target: parsed.viewId ?? opts.path })
        }
      }
      refs.push(ref)

      return `${lead}<div data-likec4-view-embed="${current}"></div>`
    },
  )
  return { body: rewritten, refs, diagnostics }
}

/**
 * Finds fenced ```mermaid blocks and replaces each with the sanitizer-safe
 * placeholder `<div data-mermaid>…</div>`, carrying the RAW mermaid source as an
 * HTML-escaped text child (so rehype-sanitize keeps a plain div with safe text).
 *
 * Pure: returns the rewritten body.
 */
export function extractMermaidBlocks(body: string): { body: string } {
  const rewritten = body.replace(
    FENCED_BLOCK_RE,
    (whole, lead: string, info: string, blockBody: string) => {
      if (info !== 'mermaid') {
        return whole
      }
      return `${lead}<div data-mermaid>${escapeHtmlText(blockBody)}</div>`
    },
  )
  return { body: rewritten }
}

/**
 * Models a single doc file into a {@link DocPage}:
 * - `raw` preserved byte-for-byte
 * - frontmatter split and parsed
 * - relative assets resolved and `src` rewritten
 * - body rendered to sanitized HTML via the existing `markdownToHtml`
 * - title derived (frontmatter → first heading → humanized filename)
 *
 * Link rewriting (inter-doc `.md` links and `likec4://view/<id>` links) runs
 * only when `input.linkResolution` is supplied; otherwise links are left
 * untouched and `links` stays empty (Phase 1 behavior). `refs` stays empty
 * (```likec4-view embeds are out of scope here).
 */
export function modelDocFile(input: ModelDocInput): DocPage {
  const { path, raw } = input
  const { frontmatter, body } = splitFrontmatter(raw)
  const { body: bodyWithAssets, assets } = resolveAssets(body, input.resolveAsset)

  const diagnostics: DocLinkDiagnostic[] = []
  let resolvedBody = bodyWithAssets
  let links: ViewId[] = []
  if (input.linkResolution) {
    const docResult = resolveDocLinks(resolvedBody, {
      docRoute: path,
      knownPaths: input.linkResolution.knownPaths,
    })
    resolvedBody = docResult.body
    diagnostics.push(...docResult.diagnostics)

    const viewResult = resolveViewLinks(resolvedBody, {
      viewExists: input.linkResolution.viewExists,
      routeFor: input.linkResolution.routeFor,
    })
    resolvedBody = viewResult.body
    links = viewResult.links
    diagnostics.push(...viewResult.diagnostics)
  }

  const embedResult = extractLikeC4ViewEmbeds(resolvedBody, {
    path,
    ...(input.viewResolution ? { resolution: input.viewResolution } : {}),
  })
  resolvedBody = embedResult.body
  diagnostics.push(...embedResult.diagnostics)

  const mermaidResult = extractMermaidBlocks(resolvedBody)
  resolvedBody = mermaidResult.body

  if (diagnostics.length > 0) {
    input.onDiagnostics?.(diagnostics)
  }

  const html = markdownToHtml(resolvedBody)
  const title = deriveTitle(frontmatter, body, path)
  return {
    path,
    title,
    frontmatter,
    html,
    raw,
    refs: embedResult.refs,
    links,
    assets,
  }
}
