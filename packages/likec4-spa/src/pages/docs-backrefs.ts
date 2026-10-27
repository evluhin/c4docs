// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel } from '@c4docs/likec4-core/types'

/** A doc that references a given view, for the "Referenced in docs" affordance. */
export interface DocBackref {
  /** route path of the doc, e.g. 'architecture' (no extension) */
  path: string
  /** display title of the doc */
  title: string
}

/**
 * Builds a reverse index from view id to the docs that reference it, so a
 * view's diagram page can surface a "Referenced in docs" affordance.
 *
 * A doc references a view when either:
 * - one of its resolved ```likec4-view embeds (`page.refs`) points at the view, or
 * - one of its inter-doc `likec4://` view links (`page.links`) points at the view.
 *
 * Only resolved refs are included — an unresolved ref does not point at a real
 * view. Links are already resolved view ids. The resulting doc entries are
 * de-duplicated per view and sorted by path for deterministic output.
 *
 * Pure and unit-testable: no I/O, no model access, no React.
 */
export function buildDocsByViewId(docs: DocsModel): Map<string, DocBackref[]> {
  const byViewId = new Map<string, Map<string, DocBackref>>()

  const add = (viewId: string, page: { path: string; title: string }) => {
    if (viewId === '') {
      return
    }
    let docsForView = byViewId.get(viewId)
    if (!docsForView) {
      docsForView = new Map()
      byViewId.set(viewId, docsForView)
    }
    if (!docsForView.has(page.path)) {
      docsForView.set(page.path, { path: page.path, title: page.title })
    }
  }

  for (const page of Object.values(docs.pages)) {
    for (const ref of page.refs) {
      if (ref.resolved) {
        add(ref.viewId, page)
      }
    }
    for (const viewId of page.links) {
      add(viewId, page)
    }
  }

  const result = new Map<string, DocBackref[]>()
  for (const [viewId, docsForView] of byViewId) {
    const entries = [...docsForView.values()].sort((a, b) => a.path.localeCompare(b.path))
    result.set(viewId, entries)
  }
  return result
}
