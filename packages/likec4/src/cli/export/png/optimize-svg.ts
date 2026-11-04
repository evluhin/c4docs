// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

/**
 * A map of CSS property name to its browser-computed default value, captured in
 * the same browser (and the same way) that produced the SVG. See
 * {@link optimizeExportedSvg} for why it must come from the live browser.
 */
export type SvgStyleDefaults = Readonly<Record<string, string>>

/**
 * Matches an XML entity reference (`&quot;`, `&amp;`, `&#39;`, `&#x2F;`) starting
 * at a given offset, so the trailing `;` of an entity is not mistaken for a
 * declaration separator.
 */
const ENTITY_RE = /^&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/

/**
 * Splits an inline `style="..."` declaration string into `prop: value` chunks,
 * treating only top-level `;` as separators. A `;` inside parentheses (e.g.
 * `rgb(...)`, `color-mix(...)`, `url(...)`) or closing an XML entity (e.g. the
 * `;` in `&quot;`) is kept as part of the value.
 */
function splitDeclarations(style: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < style.length; i++) {
    const ch = style[i]
    switch (true) {
      case ch === '(':
        depth++
        break
      case ch === ')':
        depth = depth > 0 ? depth - 1 : 0
        break
      case ch === '&' && ENTITY_RE.test(style.slice(i)): {
        // Skip to the entity's closing `;` so it is not treated as a separator.
        const semi = style.indexOf(';', i)
        i = semi
        break
      }
      case ch === ';' && depth === 0:
        out.push(style.slice(start, i))
        start = i + 1
        break
      default:
        break
    }
  }
  out.push(style.slice(start))
  return out
}

/**
 * Unescapes the XML entities that appear in serialized inline-style values
 * (`&quot;`, `&amp;`, `&lt;`, `&gt;`, `&#39;`). The `defaults` map holds raw DOM
 * values, so a serialized declaration must be unescaped before it can be compared
 * against a default. `&amp;` is resolved last so sequences like `&amp;quot;` are
 * not double-unescaped.
 */
function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Collects the set of custom-property names referenced by any `var(--name)` in the SVG. */
function collectReferencedCustomProps(svg: string): Set<string> {
  const referenced = new Set<string>()
  const re = /var\(\s*(--[A-Za-z0-9_-]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(svg)) !== null) {
    referenced.add(match[1]!)
  }
  return referenced
}

/**
 * Rewrites a single inline-style declaration string, dropping declarations that
 * have no effect on rendering:
 * - custom properties (`--*`) whose name is not referenced by any `var()` in the
 *   whole SVG (an unreferenced custom property cannot affect rendering), and
 * - standard properties whose value equals the browser default for that property
 *   (a declaration equal to the default is a no-op; because the exporter writes an
 *   explicit computed value on every node, dropping defaults is cascade-safe).
 *
 * All other declarations, including shorthands and any value that differs from the
 * default, are preserved verbatim.
 */
function optimizeStyle(style: string, defaults: SvgStyleDefaults, referencedCustomProps: Set<string>): string {
  const kept: string[] = []
  for (const declaration of splitDeclarations(style)) {
    const trimmed = declaration.trim()
    if (trimmed === '') {
      continue
    }
    const colon = trimmed.indexOf(':')
    if (colon < 0) {
      // Not a `prop: value` pair; keep as-is to avoid corrupting unexpected input.
      kept.push(trimmed)
      continue
    }
    const prop = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    switch (true) {
      case prop.startsWith('--'):
        if (referencedCustomProps.has(prop)) {
          kept.push(`${prop}: ${value}`)
        }
        continue
      // Compare against the default with XML entities resolved, since serialized
      // values carry `&quot;` etc. while `defaults` holds raw DOM values.
      case defaults[prop] === value || defaults[prop] === unescapeXml(value):
        continue
      default:
        kept.push(`${prop}: ${value}`)
    }
  }
  return kept.join('; ')
}

/**
 * Shrinks an SVG produced by `html-to-image` (a `<foreignObject>` wrapping the
 * rendered diagram DOM) by stripping redundant inline styles, without changing how
 * it renders.
 *
 * `html-to-image` serializes `getComputedStyle(node).cssText` onto every cloned
 * node, so each `style="..."` attribute carries the browser's full computed style
 * (600+ properties, almost all at their defaults) plus every ambient CSS custom
 * property. That is ~99% of the file. This transform removes exactly that dead
 * weight: default-valued standard declarations and unreferenced custom properties.
 *
 * Only inline `style="..."` attributes are touched. `<style>` blocks (including
 * `@font-face` rules and the fonts' woff2 data URIs), vector shapes, and all other
 * markup are left byte-for-byte unchanged.
 *
 * `defaults` MUST be captured from the same browser that produced the SVG and via
 * the same serialization path (`getComputedStyle(ref).cssText`), because computed
 * default values and their serialized shorthand form are browser-version specific.
 * A reference default captured elsewhere would risk either missing defaults or,
 * worse, dropping a declaration whose value is not actually the default. When
 * `defaults` is empty, only unreferenced custom properties are stripped.
 *
 * @param svg - The SVG markup produced by `html-to-image`'s `toSvg`.
 * @param defaults - Browser-computed default values, property name to value.
 * @returns The optimized SVG markup.
 */
export function optimizeExportedSvg(svg: string, defaults: SvgStyleDefaults): string {
  const referencedCustomProps = collectReferencedCustomProps(svg)
  return svg.replace(
    /style="([^"]*)"/g,
    (_whole, style: string) => `style="${optimizeStyle(style, defaults, referencedCustomProps)}"`,
  )
}
