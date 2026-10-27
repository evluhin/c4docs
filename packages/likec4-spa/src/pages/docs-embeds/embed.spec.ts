// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramRef } from '@c4docs/likec4-core'
import type { Fqn, ViewId } from '@c4docs/likec4-core'
import { describe, expect, it } from 'vitest'
import { resolveEmbed } from './embed'

const resolvedRef = (viewId: string, state: DiagramRef['state'] = {}): DiagramRef => ({
  viewId: viewId as ViewId,
  state,
  sourceLocation: { path: 'index', line: 1, column: 1 },
  resolved: true,
})

const invalidRef = (viewId: string, error: string): DiagramRef => ({
  viewId: viewId as ViewId,
  state: {},
  sourceLocation: { path: 'index', line: 1, column: 1 },
  resolved: false,
  error,
})

describe('resolveEmbed', () => {
  it('mounts a resolved ref and maps state onto view props', () => {
    const refs = [
      resolvedRef('shop', {
        focus: 'shop.api' as Fqn,
        dynamic: 'sequence',
        theme: 'dark',
        padding: 24,
      }),
    ]
    const result = resolveEmbed(refs, 0)
    expect(result).toEqual({
      kind: 'mount',
      props: {
        viewId: 'shop',
        focus: 'shop.api',
        dynamicViewVariant: 'sequence',
        colorScheme: 'dark',
        fitViewPadding: 24,
      },
    })
  })

  it('omits colorScheme when theme is auto or absent', () => {
    expect(resolveEmbed([resolvedRef('index', { theme: 'auto' })], 0)).toEqual({
      kind: 'mount',
      props: { viewId: 'index' },
    })
    expect(resolveEmbed([resolvedRef('index')], 0)).toEqual({
      kind: 'mount',
      props: { viewId: 'index' },
    })
  })

  it('renders a notice for an invalid ref using its error', () => {
    const refs = [invalidRef('nope', 'Unknown view: "nope"')]
    const result = resolveEmbed(refs, 0)
    expect(result).toEqual({
      kind: 'notice',
      message: 'Cannot embed view: nope — Unknown view: "nope"',
    })
  })

  it('renders a notice when the index is out of range', () => {
    const result = resolveEmbed([], 0)
    expect(result).toMatchObject({ kind: 'notice' })
  })

  it('selects mount-vs-notice per placeholder across a mixed refs array', () => {
    const refs = [resolvedRef('index'), invalidRef('', 'Missing "view"')]
    expect(resolveEmbed(refs, 0).kind).toBe('mount')
    expect(resolveEmbed(refs, 1).kind).toBe('notice')
  })
})
