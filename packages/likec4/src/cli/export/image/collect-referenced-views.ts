// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel } from '@c4docs/likec4-core'

/** A view variant that the image pipeline must render. */
export interface ReferencedView {
  viewId: string
  /** present only when the reference asked for the sequence layout of a dynamic view */
  dynamic?: 'sequence'
}

/**
 * Collects the set of views that documents reference and therefore need rendered
 * images. The set is the union of:
 *
 * - every `DocPage.refs[].viewId`, carrying `ref.state.dynamic === 'sequence'`
 *   as the sequence variant (any other `dynamic` value is the default diagram),
 * - every `DocPage.links` entry (always the default diagram variant).
 *
 * The result is deduplicated by `${viewId}|${dynamic ?? 'diagram'}`, so a view
 * referenced as both a diagram and a sequence yields both variants, while
 * repeated identical references collapse to one. Order follows first appearance
 * for stable, deterministic output.
 *
 * Pure: no model access beyond the passed data, no I/O, never throws.
 */
export function collectReferencedViews(docsModel: DocsModel): ReferencedView[] {
  const seen = new Set<string>()
  const result: ReferencedView[] = []

  const add = (viewId: string, dynamic?: 'sequence') => {
    const key = `${viewId}|${dynamic ?? 'diagram'}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(dynamic ? { viewId, dynamic } : { viewId })
  }

  for (const page of Object.values(docsModel.pages)) {
    for (const ref of page.refs) {
      add(ref.viewId, ref.state.dynamic === 'sequence' ? 'sequence' : undefined)
    }
    for (const viewId of page.links) {
      add(viewId)
    }
  }

  return result
}
