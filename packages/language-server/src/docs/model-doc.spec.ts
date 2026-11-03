import { markdownToHtml } from '@c4docs/likec4-core/utils'
import { describe, expect, it, vi } from 'vitest'
import type { DocLinkDiagnostic, DocLinkResolution, DocViewLinkState, DocViewResolution } from './model-doc'
import {
  deriveTitle,
  extractLikeC4ViewEmbeds,
  extractMermaidBlocks,
  modelDocFile,
  resolveDocLinks,
  resolveViewLinks,
  splitFrontmatter,
} from './model-doc'

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

  it('extracts a ```likec4-view block into a placeholder and collects an (unresolved) ref', () => {
    const raw = '# H\n\n```likec4-view\nview: index\n```\n'
    const page = modelDocFile({ path: 'guide', sourceAbsPath: '/p/docs/guide.md', raw })
    expect(page.html).toContain('<div data-likec4-view-embed="0"></div>')
    expect(page.html).not.toContain('view: index')
    expect(page.refs).toHaveLength(1)
    expect(page.refs[0]!.viewId).toBe('index')
    // No resolution context supplied, so the ref stays unresolved.
    expect(page.refs[0]!.resolved).toBe(false)
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

  it('round-trips a space-containing segment: %20 target ↔ human key ↔ %20 href, no .md', () => {
    const spacedPaths = new Set(['', 'common/unified token/adr-usl-user-context-token'])
    const { body, diagnostics } = resolveDocLinks(
      '[ctx](./common/unified%20token/adr-usl-user-context-token.md)',
      { docRoute: '', knownPaths: spacedPaths },
    )
    // decoded target resolves to the literal-space key; href re-encodes per segment, no .md
    expect(body).toBe('[ctx](/docs/common/unified%20token/adr-usl-user-context-token)')
    expect(body).not.toContain('.md')
    expect(diagnostics).toEqual([])
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

describe('extractLikeC4ViewEmbeds', () => {
  const resolution: DocViewResolution = {
    viewExists: (id) => id === 'index' || id === 'shop',
    elementExists: (fqn) => fqn === 'customer' || fqn === 'shop.api',
  }

  it('replaces a block with the exact placeholder markup and resolves a valid ref', () => {
    const { body, refs, diagnostics } = extractLikeC4ViewEmbeds('# H\n\n```likec4-view\nview: index\n```\n', {
      path: 'guide',
      resolution,
    })
    expect(body).toContain('<div data-likec4-view-embed="0"></div>')
    expect(body).not.toContain('view: index')
    expect(refs).toHaveLength(1)
    expect(refs[0]!.viewId).toBe('index')
    expect(refs[0]!.resolved).toBe(true)
    expect(refs[0]!.error).toBeUndefined()
    expect(diagnostics).toEqual([])
  })

  it('numbers multiple embeds by 0-based document order', () => {
    const raw = '```likec4-view\nview: index\n```\n\ntext\n\n```likec4-view\nview: shop\n```\n'
    const { body, refs } = extractLikeC4ViewEmbeds(raw, { path: 'guide', resolution })
    expect(body).toContain('<div data-likec4-view-embed="0"></div>')
    expect(body).toContain('<div data-likec4-view-embed="1"></div>')
    expect(refs.map((r) => r.viewId)).toEqual(['index', 'shop'])
  })

  it('carries the resolved optional state and source location', () => {
    const raw = '# H\n\n```likec4-view\nview: shop\nfocus: shop.api\ndynamic: sequence\ntheme: dark\npadding: 16\n```\n'
    const { refs } = extractLikeC4ViewEmbeds(raw, { path: 'guide', resolution })
    expect(refs[0]!.state).toEqual({ focus: 'shop.api', dynamic: 'sequence', theme: 'dark', padding: 16 })
    expect(refs[0]!.sourceLocation).toEqual({ path: 'guide', line: 3, column: 1 })
  })

  it('keeps an unknown-view ref with resolved:false and an error', () => {
    const { refs, diagnostics } = extractLikeC4ViewEmbeds('```likec4-view\nview: ghost\n```', {
      path: 'guide',
      resolution,
    })
    expect(refs).toHaveLength(1)
    expect(refs[0]!.resolved).toBe(false)
    expect(refs[0]!.error).toContain('Unknown view')
    expect(diagnostics).toHaveLength(1)
  })

  it('keeps an unknown-focus ref with resolved:false and an error', () => {
    const { refs } = extractLikeC4ViewEmbeds('```likec4-view\nview: index\nfocus: ghost\n```', {
      path: 'guide',
      resolution,
    })
    expect(refs[0]!.resolved).toBe(false)
    expect(refs[0]!.error).toContain('Unknown focus element')
  })

  it('keeps a parse-error ref (missing view) with resolved:false', () => {
    const { refs } = extractLikeC4ViewEmbeds('```likec4-view\nfocus: customer\n```', {
      path: 'guide',
      resolution,
    })
    expect(refs).toHaveLength(1)
    expect(refs[0]!.viewId).toBe('')
    expect(refs[0]!.resolved).toBe(false)
    expect(refs[0]!.error).toContain('Missing required "view"')
  })

  it('does NOT intercept a bare ```likec4 code block', () => {
    const raw = '```likec4\nspecification {\n}\n```'
    const { body, refs } = extractLikeC4ViewEmbeds(raw, { path: 'guide', resolution })
    expect(body).toBe(raw)
    expect(refs).toEqual([])
  })

  it('leaves the ref unresolved when no resolution context is supplied', () => {
    const { refs } = extractLikeC4ViewEmbeds('```likec4-view\nview: index\n```', { path: 'guide' })
    expect(refs[0]!.viewId).toBe('index')
    expect(refs[0]!.resolved).toBe(false)
  })
})

describe('extractMermaidBlocks', () => {
  /** Recovers the base64 source carried on the first data-mermaid-src attribute. */
  const decodeSrc = (body: string): string => {
    const match = /data-mermaid-src="([^"]*)"/.exec(body)
    expect(match, 'expected a data-mermaid-src attribute').not.toBeNull()
    return Buffer.from(match![1]!, 'base64').toString('utf8')
  }

  it('replaces a ```mermaid block with an empty data-mermaid div carrying base64 source', () => {
    const source = 'graph TD\n  A --> B'
    const { body } = extractMermaidBlocks(`# H\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`)
    // Empty element: no multiline text child, just a single-line attribute.
    expect(body).toContain('<div data-mermaid data-mermaid-src="')
    expect(body).toContain('></div>')
    expect(body).not.toContain('```mermaid')
    // The attribute round-trips the source exactly.
    expect(decodeSrc(body)).toBe(source)
  })

  it('base64 round-trips special characters (&, <, >) exactly', () => {
    const source = 'X & <Y> Z'
    const { body } = extractMermaidBlocks('```mermaid\nX & <Y> Z\n```')
    expect(decodeSrc(body)).toBe(source)
    // Payload stays on one line of base64 alphabet only.
    const attr = /data-mermaid-src="([^"]*)"/.exec(body)![1]!
    expect(attr).toMatch(/^[A-Za-z0-9+/=]*$/)
    expect(attr).not.toContain('\n')
  })

  it('carries the COMPLETE source of a block with indented subgraph lines', () => {
    // Regression: based on the real failing diagram. 4+-space-indented lines
    // (subgraph children) previously leaked into a separate indented code block.
    const source = [
      'flowchart TD',
      '    B[Browser] --> AK[Akamai edge<br/>sets headers]',
      '    subgraph WAF[CloudFront WAF us-east-1]',
      '      direction TB',
      '      W1[Allow Akamai IP set]',
      '      W2[Allow x-waf-secret header]',
      '      W3[Block /preview; default BLOCK]',
      '    end',
      '    CF --- WAF',
      '    subgraph INV[Cache invalidation]',
      '      SNS1[Status SNS] --> SQS[(Invalidation SQS)]',
      '      SQS --> LAM[Cache Invalidation Lambda] --> CF',
      '    end',
    ].join('\n')
    const { body } = extractMermaidBlocks('## 2. Current serving flow\n\n```mermaid\n' + source + '\n```\n')
    // Exactly one placeholder, source round-trips byte-for-byte including indents.
    expect((body.match(/data-mermaid-src=/g) ?? []).length).toBe(1)
    const decoded = decodeSrc(body)
    expect(decoded).toBe(source)
    expect(decoded).toContain('subgraph WAF[CloudFront WAF us-east-1]')
    expect(decoded).toContain('      W1[Allow Akamai IP set]')
    expect(decoded).toContain('subgraph INV[Cache invalidation]')
  })

  it('survives markdownToHtml without splitting indented lines into a <pre><code>', () => {
    const source = [
      'flowchart TD',
      '    subgraph WAF[CloudFront WAF us-east-1]',
      '      direction TB',
      '      W1[Allow Akamai IP set]',
      '    end',
    ].join('\n')
    const { body } = extractMermaidBlocks('```mermaid\n' + source + '\n```')
    const html = markdownToHtml(body)
    // The placeholder survives sanitization with both data attributes...
    expect(html).toContain('data-mermaid')
    expect(html).toContain('data-mermaid-src="')
    // ...and the full source is still recoverable from the attribute (not split).
    const match = /data-mermaid-src="([^"]*)"/.exec(html)
    expect(match).not.toBeNull()
    expect(Buffer.from(match![1]!, 'base64').toString('utf8')).toBe(source)
    // The indented mermaid lines did NOT leak into an indented code block.
    expect(html).not.toContain('<pre><code')
    expect(html).not.toContain('W1[Allow Akamai IP set]</code>')
  })

  it('does not touch a bare ```likec4 or ```likec4-view block', () => {
    const raw = '```likec4-view\nview: index\n```\n\n```likec4\nmodel {}\n```'
    const { body } = extractMermaidBlocks(raw)
    expect(body).toBe(raw)
  })

  it('round-trips a sequenceDiagram with <br/> notes, rect and alt blocks byte-for-byte', () => {
    // Regression: the real failing block #4. Notes with HTML <br/>, `rect rgb(...)`
    // background blocks, `alt/else/end`, square brackets and semicolons in message
    // text must all survive the extract -> encode -> decode pipeline unchanged.
    const source = [
      'sequenceDiagram',
      '    autonumber',
      '    actor L as BFF Lambda',
      '    participant GW as API Gateway (AWS_IAM auth)',
      '    note over L: Lambda injects creds<br/>(AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)<br/>via STS',
      '    rect rgb(240,240,240)',
      '    note right of L: Credential Resolution',
      '    L->>L: [AUTO] Lambda runtime injects credentials into env vars',
      '    end',
      '    alt Allowed',
      '        GW-->>L: 200 OK',
      '    else Denied',
      '        GW-->>L: 403 Forbidden',
      '    end',
      '    GW->>GW: [AUTO] Verify SigV4 signature; identify IAM principal (Lambda role)',
      '    note over L: enforced by API Gateway + IAM.<br/>All AuthNZ before traffic reaches the VPC.',
    ].join('\n')
    const { body } = extractMermaidBlocks('# H\n\n```mermaid\n' + source + '\n```\n')
    expect((body.match(/data-mermaid-src=/g) ?? []).length).toBe(1)
    const decoded = decodeSrc(body)
    expect(decoded).toBe(source)
    // The constructs that distinguish this block are all intact.
    expect(decoded).toContain('<br/>')
    expect(decoded).toContain('rect rgb(240,240,240)')
    expect(decoded).toContain('alt Allowed')
    expect(decoded).toContain('[AUTO] Lambda runtime injects credentials into env vars')
    expect(decoded).toContain('signature; identify IAM principal (Lambda role)')
  })
})
