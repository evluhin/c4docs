// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { describe, expect, it } from 'vitest'
import { type TransformToBundleOptions, transformToBundle } from './transform'

function opts(overrides: Partial<TransformToBundleOptions> = {}): TransformToBundleOptions {
  return {
    manifest: { 'shop': 'shop.abcd1234.svg', 'flow#sequence': 'flow.sequence.ef567890.svg' },
    docRoute: '',
    ...overrides,
  }
}

describe('transformToBundle', () => {
  it('rewrites a likec4-view embed to a relative image reference', () => {
    const raw = 'Intro\n\n```likec4-view\nview: shop\n```\n\nOutro\n'
    const out = transformToBundle(raw, opts())
    expect(out).toContain('![shop](images/shop.abcd1234.svg)')
    expect(out).not.toContain('```likec4-view')
  })

  it('omits the interactive link when siteBaseUrl is absent', () => {
    const raw = '```likec4-view\nview: shop\n```\n'
    const out = transformToBundle(raw, opts())
    expect(out).toContain('![shop](images/shop.abcd1234.svg)')
    expect(out).not.toContain('View interactive version')
  })

  it('adds the interactive link only when siteBaseUrl is given', () => {
    const raw = '```likec4-view\nview: shop\n```\n'
    const out = transformToBundle(raw, opts({ siteBaseUrl: 'https://c4.acme.dev/' }))
    expect(out).toContain('![shop](images/shop.abcd1234.svg)')
    expect(out).toContain('[View interactive version →](https://c4.acme.dev/view/shop)')
  })

  it('resolves the sequence variant of a view embed', () => {
    const raw = '```likec4-view\nview: flow\ndynamic: sequence\n```\n'
    const out = transformToBundle(raw, opts())
    expect(out).toContain('![flow](images/flow.sequence.ef567890.svg)')
  })

  it('references the image by a relative path from a nested doc', () => {
    const raw = '```likec4-view\nview: shop\n```\n'
    const out = transformToBundle(raw, opts({ docRoute: 'adr/0001' }))
    expect(out).toContain('![shop](../images/shop.abcd1234.svg)')
  })

  it('leaves a mermaid block as a mermaid fenced block', () => {
    const raw = '```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n'
    const out = transformToBundle(raw, opts())
    expect(out).toBe(raw)
    expect(out).toContain('```mermaid')
  })

  it('leaves an unresolved embed (no manifest entry) as its original block', () => {
    const raw = '```likec4-view\nview: missing\n```\n'
    const out = transformToBundle(raw, opts())
    expect(out).toContain('```likec4-view')
    expect(out).toContain('view: missing')
  })
})
