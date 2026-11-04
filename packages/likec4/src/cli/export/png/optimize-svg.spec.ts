// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

import { describe, expect, it } from 'vitest'
import { type SvgStyleDefaults, optimizeExportedSvg } from './optimize-svg'

// A representative slice of the browser defaults html-to-image dumps onto every
// node (hundreds of default-valued declarations per node).
const defaults: SvgStyleDefaults = {
  'accent-color': 'auto',
  'animation-composition': 'replace',
  'background': 'none 0% 0% / auto repeat scroll padding-box border-box rgba(0, 0, 0, 0)',
  'border': '0px rgb(0, 0, 0)',
  'box-sizing': 'border-box',
  'color': 'rgb(0, 0, 0)',
  'display': 'block',
  '-webkit-tap-highlight-color': 'rgba(0, 0, 0, 0.18)',
}

describe('optimizeExportedSvg', () => {
  // One node carrying a huge computed-style dump (mostly defaults) plus a few real
  // declarations and an ambient custom property, inside a <foreignObject>, with a
  // <style> block holding an @font-face that must survive untouched.
  const bloatedStyle = [
    'accent-color: auto',
    'animation-composition: replace',
    'background: none 0% 0% / auto repeat scroll padding-box border-box rgba(0, 0, 0, 0)',
    'border: 0px rgb(0, 0, 0)',
    'box-sizing: border-box',
    'color: rgb(26, 25, 43)', // real, differs from default
    'display: flex', // real, differs from default
    '-webkit-tap-highlight-color: rgba(0, 0, 0, 0.18)',
    '--mantine-color-body: #ffffff', // unreferenced custom property -> dropped
    '--colors-likec4-accent: #4587a1', // referenced via var() -> kept
    'fill: color-mix(in srgb, #087f5b, transparent 40%)', // contains ; -safe parens, unknown prop -> kept
  ].join('; ')

  const fontFace = `@font-face{font-family:'IBM Plex Sans';src:url(data:font/woff2;base64,AAAA) format('woff2')}`

  const bloatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">`
    + `<style>${fontFace} .x{color:var(--colors-likec4-accent)}</style>`
    + `<foreignObject width="100" height="100">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="${bloatedStyle}">hi</div>`
    + `</foreignObject></svg>`

  const optimized = optimizeExportedSvg(bloatedSvg, defaults)

  it('is smaller than the input', () => {
    expect(optimized.length).toBeLessThan(bloatedSvg.length)
  })

  it('drastically shrinks the bloated inline style attribute', () => {
    const originalStyle = /style="([^"]*)"/.exec(bloatedSvg)![1]!
    const optimizedStyle = /style="([^"]*)"/.exec(optimized)![1]!
    // Only the 3 real declarations and the referenced custom property survive.
    expect(optimizedStyle.length).toBeLessThan(originalStyle.length * 0.5)
  })

  it('drops default-valued standard declarations', () => {
    expect(optimized).not.toContain('accent-color: auto')
    expect(optimized).not.toContain('animation-composition: replace')
    expect(optimized).not.toContain('box-sizing: border-box')
    expect(optimized).not.toContain('-webkit-tap-highlight-color')
    expect(optimized).not.toContain('border: 0px rgb(0, 0, 0)')
  })

  it('preserves standard declarations that differ from the default', () => {
    expect(optimized).toContain('color: rgb(26, 25, 43)')
    expect(optimized).toContain('display: flex')
  })

  it('preserves declarations whose value contains parentheses', () => {
    expect(optimized).toContain('fill: color-mix(in srgb, #087f5b, transparent 40%)')
  })

  it('drops unreferenced custom properties but keeps referenced ones', () => {
    expect(optimized).not.toContain('--mantine-color-body')
    expect(optimized).toContain('--colors-likec4-accent: #4587a1')
  })

  it('drops default values even when the serialized value is XML-escaped', () => {
    const svg = `<svg><foreignObject><div `
      + `style="-webkit-locale: &quot;en-US&quot;; color: rgb(26, 25, 43)"></div></foreignObject></svg>`
    const out = optimizeExportedSvg(svg, { '-webkit-locale': '"en-US"', 'color': 'rgb(0, 0, 0)' })
    expect(out).not.toContain('-webkit-locale')
    expect(out).toContain('color: rgb(26, 25, 43)')
  })

  it('leaves the @font-face and its woff2 data uri untouched', () => {
    expect(optimized).toContain(fontFace)
    expect(optimized).toContain('data:font/woff2;base64,AAAA')
  })

  it('leaves the <style> block and markup structure intact', () => {
    expect(optimized).toContain('<foreignObject width="100" height="100">')
    expect(optimized).toContain('.x{color:var(--colors-likec4-accent)}')
    expect(optimized).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">')
    // Still well-formed: one <svg>, one </svg>, balanced foreignObject.
    expect(optimized.match(/<svg\b/g)).toHaveLength(1)
    expect(optimized.match(/<\/svg>/g)).toHaveLength(1)
    expect(optimized.match(/<foreignObject\b/g)).toHaveLength(1)
    expect(optimized.match(/<\/foreignObject>/g)).toHaveLength(1)
  })

  it('never strips a property absent from the defaults map', () => {
    // `overflow` has an element-type-dependent default (`visible` on <div>,
    // `hidden` on a nested <svg>), so the browser-side capture excludes it from
    // the defaults map. It must therefore always survive, even at value `visible`.
    const svg = `<svg><svg style="overflow: visible; color: rgb(0, 0, 0)"><path/></svg></svg>`
    const out = optimizeExportedSvg(svg, { color: 'rgb(0, 0, 0)' })
    expect(out).toContain('overflow: visible')
    expect(out).not.toContain('color: rgb(0, 0, 0)')
  })

  it('only strips unreferenced custom props when no defaults are supplied', () => {
    const noDefaults = optimizeExportedSvg(bloatedSvg, {})
    expect(noDefaults).not.toContain('--mantine-color-body')
    expect(noDefaults).toContain('--colors-likec4-accent: #4587a1')
    // Without a defaults map, default-valued standard declarations stay.
    expect(noDefaults).toContain('accent-color: auto')
  })
})
