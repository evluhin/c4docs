// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel, DocTreeNode } from '@likec4/core'
import { describe, expect, it } from 'vitest'
import { buildMkDocsNav, buildMkDocsNavEntries } from './mkdocs-nav'

function model(tree: DocTreeNode[]): DocsModel {
  return { tree, pages: {}, entry: null }
}

describe('buildMkDocsNav', () => {
  // The language server resolves nav.yaml into the same tree shape as the
  // convention tree, so this fixture mirrors the docs-as-code nav.yaml output:
  // a bare index, a labeled doc, and a labeled section with one child.
  it('emits a nav from a nav.yaml-derived tree (sections, labels, order)', () => {
    const tree: DocTreeNode[] = [
      { kind: 'doc', label: 'Home', path: '', order: 0 },
      { kind: 'doc', label: 'Architecture Guide', path: 'architecture', order: 1 },
      {
        kind: 'folder',
        label: 'Decisions',
        path: '',
        order: 2,
        children: [
          { kind: 'doc', label: 'ADRs', path: 'adr', order: 3 },
        ],
      },
    ]
    expect(buildMkDocsNav(model(tree))).toBe(
      [
        'nav:',
        '  - Home: index.md',
        '  - Architecture Guide: architecture.md',
        '  - Decisions:',
        '      - ADRs: adr.md',
        '',
      ].join('\n'),
    )
  })

  it('emits a nav from the convention tree', () => {
    const tree: DocTreeNode[] = [
      { kind: 'doc', label: 'Index', path: '', order: 0 },
      { kind: 'doc', label: 'Architecture', path: 'architecture', order: 1 },
    ]
    expect(buildMkDocsNav(model(tree))).toBe(
      [
        'nav:',
        '  - Index: index.md',
        '  - Architecture: architecture.md',
        '',
      ].join('\n'),
    )
  })

  it('quotes a label that needs YAML escaping', () => {
    const tree: DocTreeNode[] = [
      { kind: 'doc', label: 'Weird: Title', path: 'weird', order: 0 },
    ]
    expect(buildMkDocsNav(model(tree))).toBe(
      [
        'nav:',
        '  - \'Weird: Title\': weird.md',
        '',
      ].join('\n'),
    )
  })

  it('emits an empty nav list when the tree is empty', () => {
    expect(buildMkDocsNav(model([]))).toBe('nav: []\n')
  })

  it('maps tree nodes to entries', () => {
    const tree: DocTreeNode[] = [
      { kind: 'doc', label: 'Home', path: '', order: 0 },
      {
        kind: 'folder',
        label: 'Section',
        path: '',
        order: 1,
        children: [{ kind: 'doc', label: 'Child', path: 'section/child', order: 2 }],
      },
    ]
    expect(buildMkDocsNavEntries(tree)).toEqual([
      { label: 'Home', file: 'index.md' },
      { label: 'Section', children: [{ label: 'Child', file: 'section/child.md' }] },
    ])
  })
})
