import { describe, expect, it } from 'vitest'
import { deriveTitle, modelDocFile, splitFrontmatter } from './model-doc'

describe('splitFrontmatter', () => {
  it('returns empty frontmatter and full body when no frontmatter', () => {
    const raw = '# Title\n\nbody text'
    const { frontmatter, body } = splitFrontmatter(raw)
    expect(frontmatter).toEqual({})
    expect(body).toBe(raw)
  })

  it('parses leading frontmatter and strips it from the body', () => {
    const raw = '---\ntitle: Hello\norder: 2\n---\n# Heading\n\ntext'
    const { frontmatter, body } = splitFrontmatter(raw)
    expect(frontmatter).toEqual({ title: 'Hello', order: 2 })
    expect(body).toBe('# Heading\n\ntext')
  })

  it('is lenient on malformed frontmatter', () => {
    const raw = '---\n: : :\n---\nbody'
    const { frontmatter } = splitFrontmatter(raw)
    expect(frontmatter).toEqual({})
  })
})

describe('deriveTitle', () => {
  it('prefers frontmatter title', () => {
    expect(deriveTitle({ title: 'From Frontmatter' }, '# Heading', 'guide')).toBe('From Frontmatter')
  })

  it('falls back to the first heading', () => {
    expect(deriveTitle({}, 'intro\n# The Heading\nmore', 'guide')).toBe('The Heading')
  })

  it('falls back to the humanized filename', () => {
    expect(deriveTitle({}, 'no heading here', 'adr/0001-use-event-bus')).toBe('0001 Use Event Bus')
  })
})

describe('modelDocFile', () => {
  it('preserves raw byte-for-byte', () => {
    const raw = '---\ntitle: X\n---\n# H\n\n- a\n- b\n'
    const page = modelDocFile({ path: 'guide', sourceAbsPath: '/p/docs/guide.md', raw })
    expect(page.raw).toBe(raw)
  })

  it('renders GFM to sanitized HTML and keeps refs/links empty in Phase 1', () => {
    const raw = '# Heading\n\n- one\n- two\n\n> [!NOTE]\n> an alert\n'
    const page = modelDocFile({ path: 'guide', sourceAbsPath: '/p/docs/guide.md', raw })
    expect(page.html).toContain('<h1')
    expect(page.html).toContain('<ul')
    expect(page.html).toContain('markdown-alert')
    expect(page.refs).toEqual([])
    expect(page.links).toEqual([])
  })

  it('leaves a ```likec4-view code block as a plain code block in Phase 1', () => {
    const raw = '# H\n\n```likec4-view\nview: index\n```\n'
    const page = modelDocFile({ path: 'guide', sourceAbsPath: '/p/docs/guide.md', raw })
    expect(page.html).toContain('<pre')
    expect(page.html).toContain('view: index')
  })

  it('resolves relative image assets and rewrites their src', () => {
    const raw = '# H\n\n![diagram](./img/a.png)\n\n![external](https://example.com/b.png)\n'
    const page = modelDocFile({
      path: 'guide',
      sourceAbsPath: '/p/docs/guide.md',
      raw,
      resolveAsset: (ref) =>
        ref === './img/a.png'
          ? { sourceAbsPath: '/p/docs/img/a.png', outputPath: 'docs/img/a.png' }
          : null,
    })
    expect(page.assets).toEqual([{ sourceAbsPath: '/p/docs/img/a.png', outputPath: 'docs/img/a.png' }])
    expect(page.html).toContain('docs/img/a.png')
    expect(page.html).toContain('https://example.com/b.png')
  })
})
