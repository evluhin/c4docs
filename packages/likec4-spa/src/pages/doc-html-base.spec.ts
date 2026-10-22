// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { describe, expect, it } from 'vitest'
import { applyBaseToDocHtml } from './doc-html-base'

describe('applyBaseToDocHtml', () => {
  it('leaves root-absolute doc URLs unchanged when served at root base', () => {
    const html = '<p><img src="/docs/img/overview.png" alt="x"></p>'
    expect(applyBaseToDocHtml(html, '/')).toBe(html)
  })

  it('prefixes root-absolute src with a non-root base', () => {
    const html = '<p><img src="/docs/img/overview.png" alt="x"></p>'
    expect(applyBaseToDocHtml(html, '/app/')).toBe(
      '<p><img src="/app/docs/img/overview.png" alt="x"></p>',
    )
  })

  it('handles a base without a trailing slash', () => {
    const html = '<img src="/docs/a.png">'
    expect(applyBaseToDocHtml(html, '/app')).toBe('<img src="/app/docs/a.png">')
  })

  it('prefixes root-absolute href too', () => {
    const html = '<a href="/docs/architecture/">link</a>'
    expect(applyBaseToDocHtml(html, '/app/')).toBe('<a href="/app/docs/architecture/">link</a>')
  })

  it('leaves external, protocol-relative, anchor, and data URLs untouched', () => {
    const html = [
      '<a href="https://example.com/x">ext</a>',
      '<img src="//cdn.example.com/y.png">',
      '<a href="#section">anchor</a>',
      '<img src="data:image/png;base64,AAAA">',
    ].join('')
    expect(applyBaseToDocHtml(html, '/app/')).toBe(html)
  })
})
