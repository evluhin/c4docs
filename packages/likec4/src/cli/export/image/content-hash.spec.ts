import type { DiagramView } from '@c4docs/likec4-core'
import { describe, expect, it } from 'vitest'
import { imageFileName, slug, viewContentHash } from './content-hash'

/** A minimal stand-in for a layouted view; only structural equality matters to the hash. */
function view(partial: Record<string, unknown>): DiagramView {
  return partial as unknown as DiagramView
}

describe('viewContentHash', () => {
  it('is deterministic for an unchanged view across calls', () => {
    const v = view({ id: 'v1', nodes: [{ id: 'a' }], edges: [] })
    expect(viewContentHash(v)).toBe(viewContentHash(v))
  })

  it('is deterministic regardless of key ordering in the view object', () => {
    const a = view({ id: 'v1', nodes: [{ id: 'a' }], edges: [] })
    const b = view({ edges: [], nodes: [{ id: 'a' }], id: 'v1' })
    expect(viewContentHash(a)).toBe(viewContentHash(b))
  })

  it('changes when the view model changes (cache-busting)', () => {
    const a = view({ id: 'v1', nodes: [{ id: 'a' }], edges: [] })
    const b = view({ id: 'v1', nodes: [{ id: 'a' }, { id: 'b' }], edges: [] })
    expect(viewContentHash(a)).not.toBe(viewContentHash(b))
  })

  it('separates the diagram and sequence variants of the same view', () => {
    const v = view({ id: 'v1', nodes: [], edges: [] })
    expect(viewContentHash(v)).not.toBe(viewContentHash(v, 'sequence'))
  })
})

describe('slug', () => {
  it('lowercases and replaces non-alphanumeric runs with a single dash', () => {
    expect(slug('Team One / View_42')).toBe('team-one-view-42')
  })

  it('falls back to "view" for an id with no usable characters', () => {
    expect(slug('///')).toBe('view')
  })
})

describe('imageFileName', () => {
  it('produces `<slug>.<hash>.<ext>` for the default variant', () => {
    expect(imageFileName('v1', 'abc12345', 'svg')).toBe('v1.abc12345.svg')
  })

  it('includes the sequence variant in the name', () => {
    expect(imageFileName('v1', 'abc12345', 'svg', 'sequence')).toBe('v1.sequence.abc12345.svg')
  })

  it('is stable for the same inputs and changes with the hash', () => {
    expect(imageFileName('v1', 'abc12345', 'svg')).toBe(imageFileName('v1', 'abc12345', 'svg'))
    expect(imageFileName('v1', 'abc12345', 'svg')).not.toBe(imageFileName('v1', 'def67890', 'svg'))
  })
})
