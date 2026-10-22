// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { Fqn, ViewId } from './scalar'

/**
 * A parsed+resolved reference to an existing view, extracted from a ```likec4-view block.
 *
 * Phase 1 keeps this type stable but never populates refs; references are
 * extracted and resolved in Phase 2.
 */
export interface DiagramRef {
  viewId: ViewId
  state: {
    focus?: Fqn
    dynamic?: 'diagram' | 'sequence'
    theme?: 'light' | 'dark' | 'auto'
    padding?: number
  }
  sourceLocation: {
    path: string
    line: number
    column: number
  }
  /** resolution outcome; invalid refs still appear so tooling can see them */
  resolved: boolean
  error?: string
}

/**
 * Parsed frontmatter of a doc. An open bag, like project metadata.
 */
export interface DocFrontmatter {
  title?: string
  /** number = this file's position; string[] on a folder index = child order */
  order?: number | string[]
  /** used by ADRs */
  status?: string
  date?: string
  [k: string]: unknown
}

/**
 * A static asset referenced by a doc through a relative path, resolved during
 * modeling so the build can copy it into the output.
 */
export interface DocAsset {
  /** absolute path of the source file on disk */
  sourceAbsPath: string
  /** path (relative to the build output root) the rewritten `src` points to */
  outputPath: string
}

export interface DocPage {
  /** stable route path, e.g. 'adr/0001-use-event-bus' (no extension) */
  path: string
  title: string
  frontmatter: DocFrontmatter
  /** pre-rendered, sanitized GFM */
  html: string
  /** authoritative Markdown source, byte-for-byte */
  raw: string
  /** resolved ```likec4-view references in document order (Phase 2; empty in Phase 1) */
  refs: DiagramRef[]
  /** view ids this doc links to via likec4:// (Phase 2; empty in Phase 1) */
  links: ViewId[]
  /** relative static assets referenced by the doc, resolved for the build */
  assets: DocAsset[]
}

export interface DocTreeNode {
  kind: 'doc' | 'folder'
  /** humanized name or frontmatter/index title */
  label: string
  /** doc path, or folder path */
  path: string
  /** resolved sort key */
  order: number
  /** folders only */
  children?: DocTreeNode[]
}

export interface DocsModel {
  tree: DocTreeNode[]
  pages: Record<string, /* path */ DocPage>
  /** path of the docs landing doc, if any */
  entry: string | null
}
