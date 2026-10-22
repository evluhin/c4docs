// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Pure docs-discovery helpers: mapping a `.md` file path (relative to the docs
 * directory) to a stable route path, and detecting duplicate route paths.
 *
 * The file-system scan itself lives in the docs service (Node, I/O); this module
 * stays pure so it can be unit-tested without touching the disk.
 */

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
