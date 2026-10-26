import { describe, expect, it } from 'vitest'
import { parseLikeC4ViewBlock } from './parse-view-block'

describe('parseLikeC4ViewBlock', () => {
  it('parses a single required view directive', () => {
    const result = parseLikeC4ViewBlock('view: index')
    expect(result.viewId).toBe('index')
    expect(result.state).toEqual({})
    expect(result.errors).toEqual([])
  })

  it('parses all four optional keys with value coercion', () => {
    const result = parseLikeC4ViewBlock(
      [
        'view: shop',
        'focus: shop.api',
        'dynamic: sequence',
        'theme: dark',
        'padding: 32',
      ].join('\n'),
    )
    expect(result.viewId).toBe('shop')
    expect(result.state).toEqual({
      focus: 'shop.api',
      dynamic: 'sequence',
      theme: 'dark',
      padding: 32,
    })
    expect(result.state.padding).toBeTypeOf('number')
    expect(result.errors).toEqual([])
  })

  it('errors when view is missing', () => {
    const result = parseLikeC4ViewBlock('focus: shop.api')
    expect(result.viewId).toBeUndefined()
    expect(result.errors).toEqual([{ message: 'Missing required "view" directive', line: 1 }])
  })

  it('errors on a duplicate view directive, keeping the first', () => {
    const result = parseLikeC4ViewBlock('view: index\nview: shop')
    expect(result.viewId).toBe('index')
    expect(result.errors).toEqual([{ message: 'Duplicate "view" directive', line: 2 }])
  })

  it('errors on an unknown key with its line number', () => {
    const result = parseLikeC4ViewBlock('view: index\nfocuss: shop')
    expect(result.viewId).toBe('index')
    expect(result.errors).toEqual([{ message: 'Unknown key "focuss"', line: 2 }])
  })

  it('errors on an invalid dynamic value', () => {
    const result = parseLikeC4ViewBlock('view: index\ndynamic: animated')
    expect(result.state.dynamic).toBeUndefined()
    expect(result.errors).toEqual([{
      message: 'Invalid "dynamic" value "animated", expected "diagram" or "sequence"',
      line: 2,
    }])
  })

  it('errors on an invalid theme value', () => {
    const result = parseLikeC4ViewBlock('view: index\ntheme: neon')
    expect(result.state.theme).toBeUndefined()
    expect(result.errors).toEqual([{
      message: 'Invalid "theme" value "neon", expected "light", "dark" or "auto"',
      line: 2,
    }])
  })

  it('errors on an invalid (non-integer) padding value', () => {
    const result = parseLikeC4ViewBlock('view: index\npadding: 1.5')
    expect(result.state.padding).toBeUndefined()
    expect(result.errors).toEqual([{
      message: 'Invalid "padding" value "1.5", expected a non-negative integer',
      line: 2,
    }])
  })

  it('errors on a negative padding value', () => {
    const result = parseLikeC4ViewBlock('view: index\npadding: -4')
    expect(result.state.padding).toBeUndefined()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.line).toBe(2)
  })

  it('tolerates blank and whitespace-only lines', () => {
    const result = parseLikeC4ViewBlock('\nview: index\n   \nfocus: shop\n')
    expect(result.viewId).toBe('index')
    expect(result.state).toEqual({ focus: 'shop' })
    expect(result.errors).toEqual([])
  })

  it('tolerates CRLF line endings', () => {
    const result = parseLikeC4ViewBlock('view: index\r\nfocus: shop\r\n')
    expect(result.viewId).toBe('index')
    expect(result.state).toEqual({ focus: 'shop' })
    expect(result.errors).toEqual([])
  })
})
