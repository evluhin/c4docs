// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramRef, DocPage, DocsModel, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { buildDocsByViewId } from './docs-backrefs'

const resolvedRef = (viewId: string): DiagramRef => ({
  viewId: viewId as ViewId,
  state: {},
  sourceLocation: { path: 'x', line: 1, column: 1 },
  resolved: true,
})

const unresolvedRef = (viewId: string): DiagramRef => ({
  viewId: viewId as ViewId,
  state: {},
  sourceLocation: { path: 'x', line: 1, column: 1 },
  resolved: false,
  error: 'Unknown view',
})

const page = (overrides: Partial<DocPage> & Pick<DocPage, 'path' | 'title'>): DocPage => ({
  frontmatter: {},
  html: '',
  raw: '',
  refs: [],
  links: [],
  assets: [],
  ...overrides,
})

const model = (...pages: DocPage[]): DocsModel => ({
  tree: [],
  pages: Object.fromEntries(pages.map(p => [p.path, p])),
  entry: null,
})

describe('buildDocsByViewId', () => {
  it('indexes a view referenced by a resolved embed', () => {
    const docs = model(page({ path: 'architecture', title: 'Architecture', refs: [resolvedRef('shop')] }))
    const index = buildDocsByViewId(docs)
    expect(index.get('shop')).toEqual([{ path: 'architecture', title: 'Architecture' }])
  })

  it('indexes a view referenced by an inter-doc link', () => {
    const docs = model(page({ path: 'index', title: 'Home', links: ['shop' as ViewId] }))
    const index = buildDocsByViewId(docs)
    expect(index.get('shop')).toEqual([{ path: 'index', title: 'Home' }])
  })

  it('unions refs and links across docs and de-duplicates per doc', () => {
    const docs = model(
      page({ path: 'architecture', title: 'Architecture', refs: [resolvedRef('shop'), resolvedRef('index')] }),
      page({ path: 'index', title: 'Home', refs: [resolvedRef('shop')], links: ['shop' as ViewId] }),
    )
    const index = buildDocsByViewId(docs)
    // 'index' doc references 'shop' via both a ref and a link — only one entry.
    expect(index.get('shop')).toEqual([
      { path: 'architecture', title: 'Architecture' },
      { path: 'index', title: 'Home' },
    ])
    expect(index.get('index')).toEqual([{ path: 'architecture', title: 'Architecture' }])
  })

  it('ignores unresolved refs', () => {
    const docs = model(page({ path: 'architecture', title: 'Architecture', refs: [unresolvedRef('does-not-exist')] }))
    const index = buildDocsByViewId(docs)
    expect(index.has('does-not-exist')).toBe(false)
  })

  it('ignores empty view ids', () => {
    const docs = model(page({ path: 'architecture', title: 'Architecture', refs: [resolvedRef('')] }))
    const index = buildDocsByViewId(docs)
    expect(index.has('')).toBe(false)
  })

  it('sorts doc entries by path deterministically', () => {
    const docs = model(
      page({ path: 'zeta', title: 'Zeta', links: ['shop' as ViewId] }),
      page({ path: 'alpha', title: 'Alpha', links: ['shop' as ViewId] }),
      page({ path: 'mid', title: 'Mid', links: ['shop' as ViewId] }),
    )
    const index = buildDocsByViewId(docs)
    expect(index.get('shop')?.map(d => d.path)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('returns an empty map for a docs model with no pages', () => {
    expect(buildDocsByViewId(model()).size).toBe(0)
  })
})
