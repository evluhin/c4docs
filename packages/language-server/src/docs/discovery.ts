// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Pure docs-discovery helpers: detecting duplicate route paths among discovered
 * `.md` files.
 *
 * The path→route conversion itself (`docRoutePath`, `encodeRoutePath`) is the
 * canonical implementation in `@c4docs/likec4-core/utils`; it is re-exported here
 * so existing importers keep working while the diagram UI shares the same
 * conversion. The file-system scan lives in the docs service (Node, I/O); this
 * module stays pure so it can be unit-tested without touching the disk.
 */

import { docRoutePath, encodeRoutePath } from '@c4docs/likec4-core/utils'

export { docRoutePath, encodeRoutePath }

export interface DiscoveredDoc {
  /** stable route path (no extension), e.g. 'adr/0001-use-event-bus' or '' for the root index */
  path: string
  /** path of the source file relative to the docs directory, e.g. 'adr/0001-use-event-bus.md' */
  relativePath: string
}

export interface DocsDiscoveryDiagnostic {
  message: string
  /** route path that collided */
  path: string
  /** the relative file paths that resolved to the same route path */
  files: string[]
}

export interface DocsDiscoveryResult {
  docs: DiscoveredDoc[]
  diagnostics: DocsDiscoveryDiagnostic[]
}

/**
 * Normalize a relative file path to forward slashes and strip any leading `./` or `/`.
 */
function normalizeRelative(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

/**
 * Maps discovered `.md` files (relative paths to the docs dir) to route paths,
 * recording a diagnostic for any two files that resolve to the same route path.
 */
export function discoverDocs(relativePaths: readonly string[]): DocsDiscoveryResult {
  const byPath = new Map<string, string[]>()
  for (const relativePath of relativePaths) {
    const normalized = normalizeRelative(relativePath)
    const route = docRoutePath(normalized)
    const files = byPath.get(route)
    if (files) {
      files.push(normalized)
    } else {
      byPath.set(route, [normalized])
    }
  }

  const docs: DiscoveredDoc[] = []
  const diagnostics: DocsDiscoveryDiagnostic[] = []
  for (const [path, files] of byPath) {
    // Keep the first file (sorted), report the collision for the rest.
    files.sort()
    docs.push({ path, relativePath: files[0]! })
    if (files.length > 1) {
      diagnostics.push({
        message: `Multiple docs resolve to the same route path "${path || '/'}": ${files.join(', ')}`,
        path,
        files,
      })
    }
  }

  docs.sort((a, b) => a.path.localeCompare(b.path))
  return { docs, diagnostics }
}

/**
 * The navigation file names recognized at the docs root. The root loader in
 * `buildDocsModel` reads EXACTLY `<docsDir>/nav.yaml`; `nav.yml` is listed here
 * only so a `.yml` placed in a subfolder is still reported as misplaced (a root
 * `nav.yml` is itself ignored by the loader, matching that lenient behavior).
 */
const NAV_FILE_NAMES: ReadonlySet<string> = new Set(['nav.yaml', 'nav.yml'])

/**
 * Whether the basename of the given path is a recognized nav file (`nav.yaml`
 * or `nav.yml`), case-insensitively.
 */
export function isNavFile(path: string): boolean {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  return NAV_FILE_NAMES.has(name.toLowerCase())
}

/**
 * Finds `nav.yaml` / `nav.yml` files located in a docs SUBFOLDER instead of at
 * the docs root.
 *
 * Navigation is read from EXACTLY ONE file at the docs root (`<docsDir>/nav.yaml`);
 * a nav file in any subfolder (at any depth) is silently ignored by the loader,
 * which confuses users whose per-folder ordering has no effect. This pure helper
 * flags those misplaced files so the service can warn.
 *
 * @param relativePaths file paths relative to the docs dir (any slash style)
 * @returns the misplaced files' paths, normalized to forward slashes and sorted
 */
export function findMisplacedNavFiles(relativePaths: readonly string[]): string[] {
  const misplaced: string[] = []
  for (const relativePath of relativePaths) {
    const normalized = normalizeRelative(relativePath)
    // A root nav file has no path separator (e.g. `nav.yaml`); anything with a
    // separator sits in a subfolder and is therefore misplaced.
    if (isNavFile(normalized) && normalized.includes('/')) {
      misplaced.push(normalized)
    }
  }
  misplaced.sort()
  return misplaced
}
