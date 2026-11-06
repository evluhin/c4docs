import { describe, expect, it } from 'vitest'
import { discoverDocs, docRoutePath, encodeRoutePath, findMisplacedNavFiles, isNavFile } from './discovery'

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

describe('isNavFile', () => {
  it('matches nav.yaml and nav.yml (case-insensitive)', () => {
    expect(isNavFile('nav.yaml')).toBe(true)
    expect(isNavFile('nav.yml')).toBe(true)
    expect(isNavFile('architecture/NAV.YAML')).toBe(true)
    expect(isNavFile('a/b/nav.yml')).toBe(true)
  })

  it('does not match other files', () => {
    expect(isNavFile('index.md')).toBe(false)
    expect(isNavFile('navigation.yaml')).toBe(false)
    expect(isNavFile('nav.json')).toBe(false)
  })
})

describe('findMisplacedNavFiles', () => {
  it('flags subfolder nav.yaml and nav.yml but not the root nav.yaml', () => {
    const misplaced = findMisplacedNavFiles([
      'nav.yaml',
      'index.md',
      'architecture/nav.yaml',
      'architecture/a.md',
      'adr/sub/nav.yml',
    ])
    expect(misplaced).toEqual(['adr/sub/nav.yml', 'architecture/nav.yaml'])
  })

  it('returns nothing when only the root nav.yaml is present', () => {
    expect(findMisplacedNavFiles(['nav.yaml', 'index.md', 'guide.md'])).toEqual([])
  })

  it('normalizes backslashes and leading ./ before deciding', () => {
    expect(findMisplacedNavFiles(['.\\architecture\\nav.yaml', './nav.yaml'])).toEqual([
      'architecture/nav.yaml',
    ])
  })

  it('flags a root nav.yml variant only when nested (root nav.yml is not read)', () => {
    // A root `nav.yml` is itself ignored by the loader, so it is not "misplaced".
    expect(findMisplacedNavFiles(['nav.yml'])).toEqual([])
    expect(findMisplacedNavFiles(['sub/nav.yml'])).toEqual(['sub/nav.yml'])
  })
})
