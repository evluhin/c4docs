import type { DocFrontmatter, DocPage } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
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
