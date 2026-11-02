// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Pure docs-route helpers shared across the stack: mapping a `.md` file path to
 * a stable route path, encoding a route path for a URL, and turning an
 * element/view's associated-document `link` into the in-app `/docs/<route>/`
 * href the SPA serves.
 *
 * These live in `@c4docs/likec4-core` so the language server (model building)
 * and the diagram UI (link rendering) share one canonical conversion instead of
 * duplicating it.
 */

/**
 * Normalize a relative file path to forward slashes and strip any leading `./`
 * or `/`.
 */
function normalizeRelative(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

/**
 * Maps a `.md` file path (relative to the docs directory) to its route path.
 *
 * - strips the `.md` extension
 * - `index.md` maps to its folder path (root `index.md` → `''`)
 */
export function docRoutePath(relativePath: string): string {
  const normalized = normalizeRelative(relativePath)
  const withoutExt = normalized.replace(/\.md$/i, '')
  const segments = withoutExt.split('/')
  const last = segments[segments.length - 1]
  if (last === 'index') {
    segments.pop()
  }
  return segments.join('/')
}

/**
 * Encodes a route path for use in a URL, applying {@link encodeURIComponent}
 * **per segment** (not to the whole path) so `/` separators survive while
 * URL-significant characters inside a segment (spaces, `#`, `?`, …) are escaped.
 *
 * The route path itself (the `DocsModel.pages` key) stays in its human form with
 * literal spaces; this encoded form is what hrefs embed. The SPA reverses it by
 * decoding each segment before looking the page up, so a segment with a space
 * round-trips: `unified token` ↔ `unified%20token` ↔ `unified token`.
 */
export function encodeRoutePath(route: string): string {
  if (route === '') {
    return ''
  }
  return route.split('/').map(encodeURIComponent).join('/')
}

/**
 * Strips the configured docs-directory prefix from a project-root-relative path.
 *
 * The docs route key is relative to the docs dir, but an element/view `link`'s
 * `relative` field is relative to the project root and therefore includes the
 * dir (e.g. `docs/architecture/02-edge-service.md`). Removing the dir yields the
 * path {@link docRoutePath} expects. A path outside the docs dir returns `null`.
 */
function stripDocsDir(relativePath: string, docsDir: string): string | null {
  const normalizedPath = normalizeRelative(relativePath)
  const normalizedDir = normalizeRelative(docsDir).replace(/\/+$/, '')
  if (normalizedDir === '') {
    return normalizedPath
  }
  if (normalizedPath === normalizedDir) {
    return ''
  }
  const prefix = normalizedDir + '/'
  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length)
  }
  return null
}

/**
 * Builds the in-app `/docs/<route>/` href for an element/view's associated
 * document, or `null` when the link does not resolve to a known docs page.
 *
 * A link qualifies when its project-root-relative path points to a `.md` file
 * inside the configured docs dir. The resulting href is root-absolute (so the
 * SPA's base-path prefixing applies), has the `.md` extension stripped, is
 * encoded per segment via {@link encodeRoutePath}, and carries a trailing slash
 * to match the SPA's `/docs/$/` route shape.
 *
 * Examples (docsDir = `docs`):
 * - `docs/architecture/02-edge-service.md` → `/docs/architecture/02-edge-service/`
 * - `docs/index.md` → `/docs/`
 * - `docs/adr/0001-use-event-bus.md#decision` → `/docs/adr/0001-use-event-bus/#decision`
 * - `src/notes.md` → `null` (outside the docs dir)
 */
export function docLinkHref(input: { relative: string; docsDir: string }): string | null {
  const { relative } = input
  const hashIndex = relative.indexOf('#')
  const anchor = hashIndex >= 0 ? relative.slice(hashIndex) : ''
  let pathPart = hashIndex >= 0 ? relative.slice(0, hashIndex) : relative
  const queryIndex = pathPart.indexOf('?')
  if (queryIndex >= 0) {
    pathPart = pathPart.slice(0, queryIndex)
  }
  if (!/\.md$/i.test(pathPart)) {
    return null
  }
  const insideDocs = stripDocsDir(pathPart, input.docsDir)
  if (insideDocs === null) {
    return null
  }
  const route = docRoutePath(insideDocs)
  return `/docs/${encodeRoutePath(route)}${route === '' ? '' : '/'}${anchor}`
}
