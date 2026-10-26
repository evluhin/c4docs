import type { DocFrontmatter, DocPage } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { type NavEntry, assembleDocsTreeFromNav } from './nav'
import { assembleDocsTree } from './tree'

function page(path: string, frontmatter: DocFrontmatter = {}, title?: string): DocPage {
  return {
    path,
    title: title ?? (typeof frontmatter.title === 'string' ? frontmatter.title : path || 'index'),
    frontmatter,
    html: '',
    raw: '',
    refs: [],
    links: [],
    assets: [],
  }
}

describe('assembleDocsTree', () => {
  it('sorts top-level docs alphabetically by default', () => {
    const { tree } = assembleDocsTree([
      page('guide', {}, 'Guide'),
      page('architecture', {}, 'Architecture'),
    ])
    expect(tree.map((n) => n.label)).toEqual(['Architecture', 'Guide'])
  })

  it('derives a folder label and child order from its index.md frontmatter', () => {
    const { tree } = assembleDocsTree([
      page('adr', { title: 'Decisions', order: ['0002-b', '0001-a'] }),
      page('adr/0001-a', {}, '0001 A'),
      page('adr/0002-b', {}, '0002 B'),
    ])
    const adr = tree.find((n) => n.path === 'adr')
    expect(adr?.kind).toBe('folder')
    expect(adr?.label).toBe('Decisions')
    expect(adr?.children?.map((c) => c.path)).toEqual(['adr/0002-b', 'adr/0001-a'])
  })

  it('humanizes a folder name with no index.md and sorts children alphabetically', () => {
    const { tree } = assembleDocsTree([
      page('how-to/second', {}, 'Second'),
      page('how-to/first', {}, 'First'),
    ])
    const folder = tree.find((n) => n.path === 'how-to')
    expect(folder?.label).toBe('How To')
    expect(folder?.children?.map((c) => c.label)).toEqual(['First', 'Second'])
  })

  it('lets per-file numeric order take precedence over alphabetical', () => {
    const { tree } = assembleDocsTree([
      page('b', { order: 1 }, 'Bravo'),
      page('a', {}, 'Alpha'),
    ])
    // 'b' has explicit order 1, so it comes before alphabetical 'a'
    expect(tree.map((n) => n.path)).toEqual(['b', 'a'])
  })

  it('does not render a folder index.md as a child node', () => {
    const { tree } = assembleDocsTree([
      page('adr'),
      page('adr/0001', {}, '0001'),
    ])
    const adr = tree.find((n) => n.path === 'adr')
    expect(adr?.children?.map((c) => c.path)).toEqual(['adr/0001'])
  })

  describe('entry resolution', () => {
    it('uses the config entry when present', () => {
      const { entry } = assembleDocsTree([page('guide'), page('architecture')], { entryConfig: 'guide' })
      expect(entry).toBe('guide')
    })

    it('normalizes a config entry that includes .md or index', () => {
      const { entry } = assembleDocsTree([page('')], { entryConfig: 'index.md' })
      expect(entry).toBe('')
    })

    it('falls back to the root index.md', () => {
      const { entry } = assembleDocsTree([page('guide'), page('')])
      expect(entry).toBe('')
    })

    it('falls back to the first top-level doc when no root index', () => {
      const { entry } = assembleDocsTree([page('guide', {}, 'Guide'), page('architecture', {}, 'Architecture')])
      expect(entry).toBe('architecture')
    })

    it('is null when there are no docs', () => {
      const { entry } = assembleDocsTree([])
      expect(entry).toBeNull()
    })
  })
})

describe('assembleDocsTreeFromNav', () => {
  it('honors nav order and nesting over any convention ordering', () => {
    const pages = [
      page('', {}, 'Home'),
      page('architecture', {}, 'Architecture'),
      page('adr/0001-a', {}, '0001 A'),
      page('adr/0002-b', {}, '0002 B'),
    ]
    const nav: NavEntry[] = [
      { kind: 'doc', path: 'architecture' },
      { kind: 'doc', path: '' },
      {
        kind: 'section',
        label: 'Decisions',
        children: [
          { kind: 'doc', path: 'adr/0002-b' },
          { kind: 'doc', path: 'adr/0001-a' },
        ],
      },
    ]
    const { tree } = assembleDocsTreeFromNav(pages, nav)
    expect(tree.map((n) => n.path)).toEqual(['architecture', '', ''])
    expect(tree[0]!.kind).toBe('doc')
    const section = tree[2]!
    expect(section.kind).toBe('folder')
    expect(section.label).toBe('Decisions')
    expect(section.children?.map((c) => c.path)).toEqual(['adr/0002-b', 'adr/0001-a'])
  })

  it('resolves a doc label as explicit nav label -> page title -> humanized filename', () => {
    const pages = [
      page('a', {}, 'Alpha Title'),
      page('b', {}, 'Bravo Title'),
    ]
    const nav: NavEntry[] = [
      { kind: 'doc', label: 'Explicit', path: 'a' },
      { kind: 'doc', path: 'b' },
      // no page for this path -> humanized filename fallback
      { kind: 'doc', path: 'c-doc' },
    ]
    const { tree } = assembleDocsTreeFromNav(pages, nav)
    expect(tree.map((n) => n.label)).toEqual(['Explicit', 'Bravo Title', 'C Doc'])
  })

  it('hides pages not referenced by nav from the tree but keeps them in pages', () => {
    const pages = [
      page('a', {}, 'Alpha'),
      page('hidden', {}, 'Hidden'),
    ]
    const nav: NavEntry[] = [{ kind: 'doc', path: 'a' }]
    const { tree, pages: pagesByPath, hidden } = assembleDocsTreeFromNav(pages, nav)
    expect(tree.map((n) => n.path)).toEqual(['a'])
    expect(Object.keys(pagesByPath).sort()).toEqual(['a', 'hidden'])
    expect(hidden).toEqual(['hidden'])
  })

  it('defaults entry to the first nav entry', () => {
    const pages = [page('', {}, 'Home'), page('guide', {}, 'Guide')]
    const nav: NavEntry[] = [
      { kind: 'doc', path: 'guide' },
      { kind: 'doc', path: '' },
    ]
    const { entry } = assembleDocsTreeFromNav(pages, nav)
    expect(entry).toBe('guide')
  })

  it('lets config entry override the first nav entry', () => {
    const pages = [page('', {}, 'Home'), page('guide', {}, 'Guide')]
    const nav: NavEntry[] = [
      { kind: 'doc', path: 'guide' },
      { kind: 'doc', path: '' },
    ]
    const { entry } = assembleDocsTreeFromNav(pages, nav, { entryConfig: 'index.md' })
    expect(entry).toBe('')
  })
})
