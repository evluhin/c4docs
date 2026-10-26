import { describe, expect, it, vi } from 'vitest'
import type { DocLinkDiagnostic, DocLinkResolution, DocViewLinkState } from './model-doc'
import { deriveTitle, modelDocFile, resolveDocLinks, resolveViewLinks, splitFrontmatter } from './model-doc'

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

  it('leaves links untouched and links empty with no link-resolution options', () => {
    const raw = '# H\n\n[arch](./architecture.md) and [view](likec4://view/index)\n'
    const onDiagnostics = vi.fn<(diagnostics: readonly DocLinkDiagnostic[]) => void>()
    const page = modelDocFile({ path: 'guide', sourceAbsPath: '/p/docs/guide.md', raw, onDiagnostics })
    // doc link kept as the original relative href (not rewritten to /docs/...)
    expect(page.html).toContain('./architecture.md')
    expect(page.html).not.toContain('/docs/')
    // the view link was not rewritten to an in-app route
    expect(page.html).not.toContain('/view/index/')
    expect(page.links).toEqual([])
    expect(onDiagnostics).not.toHaveBeenCalled()
  })
})

describe('resolveDocLinks', () => {
  const knownPaths = new Set(['', 'architecture', 'adr', 'adr/0001-use-event-bus', 'guide'])

  it('rewrites a relative .md link to the /docs/<route> route', () => {
    const { body, diagnostics } = resolveDocLinks('[arch](./architecture.md)', { docRoute: '', knownPaths })
    expect(body).toBe('[arch](/docs/architecture)')
    expect(diagnostics).toEqual([])
  })

  it('maps index.md to its folder route', () => {
    const { body } = resolveDocLinks('[decisions](./adr/index.md)', { docRoute: '', knownPaths })
    expect(body).toBe('[decisions](/docs/adr)')
  })

  it('maps root index.md to the docs root', () => {
    const { body } = resolveDocLinks('[home](./index.md)', { docRoute: 'architecture', knownPaths })
    expect(body).toBe('[home](/docs/)')
  })

  it('resolves a ../ relative target against the current doc folder', () => {
    const { body } = resolveDocLinks('[first adr](../adr/0001-use-event-bus.md)', {
      docRoute: 'guide',
      knownPaths,
    })
    expect(body).toBe('[first adr](/docs/adr/0001-use-event-bus)')
  })

  it('preserves a #anchor', () => {
    const { body } = resolveDocLinks('[sec](./architecture.md#overview)', { docRoute: '', knownPaths })
    expect(body).toBe('[sec](/docs/architecture#overview)')
  })

  it('leaves external, absolute, bare-anchor and likec4:// links untouched', () => {
    const raw = '[ext](https://x.y) [abs](/already) [a](#here) [v](likec4://view/index) [img](./architecture.md)'
    const { body } = resolveDocLinks(raw, { docRoute: '', knownPaths })
    expect(body).toContain('(https://x.y)')
    expect(body).toContain('(/already)')
    expect(body).toContain('(#here)')
    expect(body).toContain('(likec4://view/index)')
    expect(body).toContain('(/docs/architecture)')
  })

  it('does not rewrite image references', () => {
    const { body } = resolveDocLinks('![diagram](./architecture.md)', { docRoute: '', knownPaths })
    expect(body).toBe('![diagram](./architecture.md)')
  })

  it('leaves an unknown doc target unchanged and records a diagnostic', () => {
    const { body, diagnostics } = resolveDocLinks('[missing](./nope.md)', { docRoute: '', knownPaths })
    expect(body).toBe('[missing](./nope.md)')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.target).toBe('./nope.md')
  })
})

describe('resolveViewLinks', () => {
  const routeFor = (viewId: string, state: DocViewLinkState) => {
    const params = new URLSearchParams()
    if (state.focus) params.set('focusOnElement', state.focus)
    if (state.dynamic) params.set('dynamic', state.dynamic)
    const q = params.toString()
    return q ? `/view/${viewId}/?${q}` : `/view/${viewId}/`
  }
  const opts = { viewExists: (id: string) => id === 'index' || id === 'shop', routeFor }

  it('rewrites a valid likec4://view/<id> link to the diagram route', () => {
    const { body, links, diagnostics } = resolveViewLinks('[diagram](likec4://view/index)', opts)
    expect(body).toBe('[diagram](/view/index/)')
    expect(links).toEqual(['index'])
    expect(diagnostics).toEqual([])
  })

  it('maps ?focus to focusOnElement', () => {
    const { body } = resolveViewLinks('[d](likec4://view/index?focus=customer)', opts)
    expect(body).toBe('[d](/view/index/?focusOnElement=customer)')
  })

  it('carries ?dynamic as a search param', () => {
    const { body } = resolveViewLinks('[d](likec4://view/index?dynamic=sequence)', opts)
    expect(body).toBe('[d](/view/index/?dynamic=sequence)')
  })

  it('supports a project-scoped routeFor prefix', () => {
    const projectRouteFor = (viewId: string) => `/project/acme/view/${viewId}/`
    const { body } = resolveViewLinks('[d](likec4://view/index)', {
      viewExists: () => true,
      routeFor: projectRouteFor,
    })
    expect(body).toBe('[d](/project/acme/view/index/)')
  })

  it('leaves an unknown view id unchanged and records a diagnostic', () => {
    const { body, links, diagnostics } = resolveViewLinks('[d](likec4://view/ghost)', opts)
    expect(body).toBe('[d](likec4://view/ghost)')
    expect(links).toEqual([])
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.target).toBe('likec4://view/ghost')
  })

  it('dedupes collected links in document order', () => {
    const raw = '[a](likec4://view/shop) [b](likec4://view/index) [c](likec4://view/shop)'
    const { links } = resolveViewLinks(raw, opts)
    expect(links).toEqual(['shop', 'index'])
  })
})

describe('modelDocFile with link resolution', () => {
  const linkResolution: DocLinkResolution = {
    knownPaths: new Set(['', 'architecture']),
    viewExists: (id) => id === 'index',
    routeFor: (viewId) => `/view/${viewId}/`,
  }

  it('rewrites doc and view links and populates page.links', () => {
    const raw = '# H\n\n[arch](./architecture.md)\n\n[diagram](likec4://view/index)\n'
    const onDiagnostics = vi.fn<(diagnostics: readonly DocLinkDiagnostic[]) => void>()
    const page = modelDocFile({
      path: '',
      sourceAbsPath: '/p/docs/index.md',
      raw,
      linkResolution,
      onDiagnostics,
    })
    expect(page.html).toContain('/docs/architecture')
    expect(page.html).toContain('/view/index/')
    expect(page.links).toEqual(['index'])
    expect(page.raw).toBe(raw)
    expect(page.refs).toEqual([])
    expect(onDiagnostics).not.toHaveBeenCalled()
  })

  it('reports diagnostics for unknown doc and view targets without throwing', () => {
    const raw = '[missing](./nope.md) [ghost](likec4://view/ghost)'
    const onDiagnostics = vi.fn<(diagnostics: readonly DocLinkDiagnostic[]) => void>()
    const page = modelDocFile({
      path: '',
      sourceAbsPath: '/p/docs/index.md',
      raw,
      linkResolution,
      onDiagnostics,
    })
    expect(page.html).toContain('./nope.md')
    expect(page.links).toEqual([])
    expect(onDiagnostics).toHaveBeenCalledTimes(1)
    const reported = onDiagnostics.mock.calls[0]![0]
    expect(reported).toHaveLength(2)
  })
})
