import { describe, expect, it } from 'vitest'
import { docRoutePath } from './discovery'
import { type ParseNavOptions, parseNavYaml } from './nav'

function options(paths: readonly string[]): ParseNavOptions {
  return { knownPaths: new Set(paths), docRoutePath }
}

describe('parseNavYaml', () => {
  it('parses a labeled doc entry and normalizes its path', () => {
    const result = parseNavYaml('nav:\n  - Home: index.md\n', options(['']))
    expect(result.malformed).toBe(false)
    expect(result.entries).toEqual([{ kind: 'doc', label: 'Home', path: '' }])
    expect(result.diagnostics).toEqual([])
  })

  it('parses a bare doc entry (no explicit label)', () => {
    const result = parseNavYaml('nav:\n  - architecture.md\n', options(['architecture']))
    expect(result.entries).toEqual([{ kind: 'doc', label: undefined, path: 'architecture' }])
  })

  it('treats .md as optional in paths', () => {
    const result = parseNavYaml('nav:\n  - Arch: architecture\n', options(['architecture']))
    expect(result.entries).toEqual([{ kind: 'doc', label: 'Arch', path: 'architecture' }])
  })

  it('maps index.md to the empty route path', () => {
    const result = parseNavYaml('nav:\n  - index.md\n', options(['']))
    expect(result.entries).toEqual([{ kind: 'doc', label: undefined, path: '' }])
  })

  it('parses a section with nested children in list order', () => {
    const source = [
      'nav:',
      '  - Home: index.md',
      '  - Decisions:',
      '    - adr/0001-a.md',
      '    - Second: adr/0002-b.md',
    ].join('\n')
    const result = parseNavYaml(source, options(['', 'adr/0001-a', 'adr/0002-b']))
    expect(result.malformed).toBe(false)
    expect(result.entries).toEqual([
      { kind: 'doc', label: 'Home', path: '' },
      {
        kind: 'section',
        label: 'Decisions',
        children: [
          { kind: 'doc', label: undefined, path: 'adr/0001-a' },
          { kind: 'doc', label: 'Second', path: 'adr/0002-b' },
        ],
      },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('records a diagnostic for an entry pointing at a non-existent doc', () => {
    const result = parseNavYaml('nav:\n  - Ghost: missing.md\n', options(['architecture']))
    expect(result.malformed).toBe(false)
    expect(result.entries).toEqual([{ kind: 'doc', label: 'Ghost', path: 'missing' }])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.target).toBe('missing')
  })

  it('is lenient on malformed YAML (no throw, malformed:true)', () => {
    const result = parseNavYaml('nav:\n  - : : :\n   bad', options(['']))
    expect(result.malformed).toBe(true)
    expect(result.entries).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
  })

  it('is malformed when the top-level nav key is missing', () => {
    const result = parseNavYaml('title: Docs\n', options(['']))
    expect(result.malformed).toBe(true)
    expect(result.entries).toEqual([])
  })

  it('is malformed when nav is not a list', () => {
    const result = parseNavYaml('nav: hello\n', options(['']))
    expect(result.malformed).toBe(true)
    expect(result.entries).toEqual([])
  })
})
