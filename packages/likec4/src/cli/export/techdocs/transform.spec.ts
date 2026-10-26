// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { describe, expect, it } from 'vitest'
import { type TransformToTechDocsOptions, docFilePath, transformToTechDocs } from './transform'

function opts(overrides: Partial<TransformToTechDocsOptions> = {}): TransformToTechDocsOptions {
  return {
    manifest: { 'shop': 'shop.abcd1234.svg', 'flow#sequence': 'flow.sequence.ef567890.svg' },
    siteBaseUrl: 'https://c4.acme.dev/',
    docRoute: '',
    knownPaths: new Set(['', 'architecture', 'adr', 'adr/0001']),
    ...overrides,
  }
}

describe('transformToTechDocs', () => {
  it('rewrites a likec4-view embed to an image plus an interactive link', () => {
    const raw = 'Intro\n\n```likec4-view\nview: shop\n```\n\nOutro\n'
    const out = transformToTechDocs(raw, opts())
    expect(out).toContain('![shop](images/shop.abcd1234.svg)')
    expect(out).toContain('[View interactive version →](https://c4.acme.dev/view/shop)')
    expect(out).not.toContain('```likec4-view')
  })

  it('resolves the sequence variant of a view embed', () => {
    const raw = '```likec4-view\nview: flow\ndynamic: sequence\n```\n'
    const out = transformToTechDocs(raw, opts())
    expect(out).toContain('![flow](images/flow.sequence.ef567890.svg)')
    expect(out).toContain('[View interactive version →](https://c4.acme.dev/view/flow)')
  })

  it('leaves an unresolved embed (no manifest entry) as its original block', () => {
    const raw = '```likec4-view\nview: missing\n```\n'
    const out = transformToTechDocs(raw, opts())
    expect(out).toContain('```likec4-view')
    expect(out).toContain('view: missing')
  })

  it('passes mermaid blocks through unchanged', () => {
    const raw = '```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n'
    const out = transformToTechDocs(raw, opts())
    expect(out).toBe(raw)
  })

  it('rewrites likec4:// view links to the interactive site url', () => {
    const raw = 'Open the [shop diagram](likec4://view/shop) to explore.\n'
    const out = transformToTechDocs(raw, opts())
    expect(out).toContain('[shop diagram](https://c4.acme.dev/view/shop)')
    expect(out).not.toContain('likec4://')
  })

  it('rewrites an inter-doc .md link to a relative TechDocs page route', () => {
    const raw = 'See the [architecture](./architecture.md) page.\n'
    const out = transformToTechDocs(raw, opts({ docRoute: '' }))
    expect(out).toContain('[architecture](architecture.md)')
  })

  it('rewrites an inter-doc .md link from a nested doc with ../', () => {
    const raw = 'Back to [home](../index.md).\n'
    const out = transformToTechDocs(raw, opts({ docRoute: 'adr/0001' }))
    expect(out).toContain('[home](../index.md)')
  })

  it('preserves an anchor on an inter-doc link', () => {
    const raw = 'See [arch](./architecture.md#components).\n'
    const out = transformToTechDocs(raw, opts({ docRoute: '' }))
    expect(out).toContain('[arch](architecture.md#components)')
  })

  it('leaves an unknown inter-doc .md link unchanged', () => {
    const raw = 'See [ghost](./ghost.md).\n'
    const out = transformToTechDocs(raw, opts({ docRoute: '' }))
    expect(out).toContain('[ghost](./ghost.md)')
  })

  it('leaves external links and images alone', () => {
    const raw = '[ext](https://example.com/x.md) ![img](./img/overview.png)\n'
    const out = transformToTechDocs(raw, opts({ docRoute: '' }))
    expect(out).toContain('[ext](https://example.com/x.md)')
    expect(out).toContain('![img](./img/overview.png)')
  })
})

describe('docFilePath', () => {
  it('maps the root route to index.md', () => {
    expect(docFilePath('')).toBe('index.md')
  })

  it('maps a nested route to <route>.md', () => {
    expect(docFilePath('adr/0001')).toBe('adr/0001.md')
  })
})
