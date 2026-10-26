import { describe, expect, it } from 'vitest'
import { discoverDocs, docRoutePath, encodeRoutePath } from './discovery'

describe('encodeRoutePath', () => {
  it('returns the root route unchanged', () => {
    expect(encodeRoutePath('')).toBe('')
  })

  it('leaves plain segments untouched', () => {
    expect(encodeRoutePath('adr/0001-use-event-bus')).toBe('adr/0001-use-event-bus')
  })

  it('encodes a space per segment while keeping slash separators', () => {
    expect(encodeRoutePath('common/unified token/adr-usl-user-context-token')).toBe(
      'common/unified%20token/adr-usl-user-context-token',
    )
  })
})

describe('docRoutePath', () => {
  it('strips the .md extension', () => {
    expect(docRoutePath('guide.md')).toBe('guide')
    expect(docRoutePath('adr/0001-use-event-bus.md')).toBe('adr/0001-use-event-bus')
  })

  it('maps index.md to its folder path', () => {
    expect(docRoutePath('index.md')).toBe('')
    expect(docRoutePath('adr/index.md')).toBe('adr')
    expect(docRoutePath('a/b/index.md')).toBe('a/b')
  })

  it('normalizes backslashes and leading ./', () => {
    expect(docRoutePath('.\\adr\\0001.md')).toBe('adr/0001')
    expect(docRoutePath('./guide.md')).toBe('guide')
  })
})

describe('discoverDocs', () => {
  it('maps files to route paths sorted by path', () => {
    const { docs, diagnostics } = discoverDocs([
      'index.md',
      'adr/0001-use-event-bus.md',
      'guide.md',
    ])
    expect(diagnostics).toEqual([])
    expect(docs).toEqual([
      { path: '', relativePath: 'index.md' },
      { path: 'adr/0001-use-event-bus', relativePath: 'adr/0001-use-event-bus.md' },
      { path: 'guide', relativePath: 'guide.md' },
    ])
  })

  it('emits a diagnostic when two files resolve to the same route path', () => {
    const { docs, diagnostics } = discoverDocs([
      'adr/index.md',
      'adr.md',
    ])
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.path).toBe('adr')
    expect(diagnostics[0]!.files).toEqual(['adr.md', 'adr/index.md'])
    // the first (sorted) file is kept, not dropped silently
    expect(docs).toEqual([{ path: 'adr', relativePath: 'adr.md' }])
  })
})
