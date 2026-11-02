import { describe, expect, it } from 'vitest'
import { docLinkHref, docRoutePath, encodeRoutePath } from './doc-route'

describe('docRoutePath', () => {
  it('strips the .md extension', () => {
    expect(docRoutePath('architecture/02-edge-service.md')).toBe('architecture/02-edge-service')
  })

  it('maps index.md to its folder', () => {
    expect(docRoutePath('index.md')).toBe('')
    expect(docRoutePath('adr/index.md')).toBe('adr')
  })

  it('normalizes leading ./ and backslashes', () => {
    expect(docRoutePath('./adr\\0001-use-event-bus.md')).toBe('adr/0001-use-event-bus')
  })
})

describe('encodeRoutePath', () => {
  it('encodes per segment and keeps separators', () => {
    expect(encodeRoutePath('architecture/02-edge-service')).toBe('architecture/02-edge-service')
    expect(encodeRoutePath('notes/unified token')).toBe('notes/unified%20token')
  })

  it('returns empty string for the root route', () => {
    expect(encodeRoutePath('')).toBe('')
  })
})

describe('docLinkHref', () => {
  it('builds a /docs/<route>/ href for a nested associated document', () => {
    expect(docLinkHref({ relative: 'docs/architecture/02-edge-service.md', docsDir: 'docs' }))
      .toBe('/docs/architecture/02-edge-service/')
  })

  it('maps the docs index to /docs/', () => {
    expect(docLinkHref({ relative: 'docs/index.md', docsDir: 'docs' })).toBe('/docs/')
  })

  it('preserves an anchor', () => {
    expect(docLinkHref({ relative: 'docs/adr/0001-use-event-bus.md#decision', docsDir: 'docs' }))
      .toBe('/docs/adr/0001-use-event-bus/#decision')
  })

  it('honors a custom docs dir', () => {
    expect(docLinkHref({ relative: 'documentation/architecture/02-edge-service.md', docsDir: 'documentation' }))
      .toBe('/docs/architecture/02-edge-service/')
  })

  it('returns null for a non-markdown link', () => {
    expect(docLinkHref({ relative: 'docs/diagram.png', docsDir: 'docs' })).toBeNull()
  })

  it('returns null for a markdown file outside the docs dir', () => {
    expect(docLinkHref({ relative: 'src/notes.md', docsDir: 'docs' })).toBeNull()
  })

  it('encodes spaces in a route segment', () => {
    expect(docLinkHref({ relative: 'docs/notes/unified token.md', docsDir: 'docs' }))
      .toBe('/docs/notes/unified%20token/')
  })
})
