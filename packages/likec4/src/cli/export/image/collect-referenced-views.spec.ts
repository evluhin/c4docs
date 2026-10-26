import type { DiagramRef, DocPage, DocsModel, ViewId } from '@likec4/core'
import { describe, expect, it } from 'vitest'
import { collectReferencedViews } from './collect-referenced-views'

function ref(viewId: string, dynamic?: 'diagram' | 'sequence'): DiagramRef {
  return {
    viewId: viewId as ViewId,
    state: dynamic ? { dynamic } : {},
    sourceLocation: { path: 'doc.md', line: 1, column: 1 },
    resolved: true,
  }
}

function page(partial: Partial<DocPage>): DocPage {
  return {
    path: 'doc',
    title: 'Doc',
    frontmatter: {},
    html: '',
    raw: '',
    refs: [],
    links: [],
    assets: [],
    ...partial,
  }
}

function docsModel(pages: DocPage[]): DocsModel {
  return {
    tree: [],
    entry: null,
    pages: Object.fromEntries(pages.map((p, i) => [p.path || String(i), p])),
  }
}

describe('collectReferencedViews', () => {
  it('collects refs-only references', () => {
    const model = docsModel([page({ path: 'a', refs: [ref('v1'), ref('v2')] })])
    expect(collectReferencedViews(model)).toEqual([{ viewId: 'v1' }, { viewId: 'v2' }])
  })

  it('collects links-only references', () => {
    const model = docsModel([page({ path: 'a', links: ['v1', 'v2'] as ViewId[] })])
    expect(collectReferencedViews(model)).toEqual([{ viewId: 'v1' }, { viewId: 'v2' }])
  })

  it('unions refs and links and dedupes identical variants', () => {
    const model = docsModel([
      page({ path: 'a', refs: [ref('v1')], links: ['v1', 'v2'] as ViewId[] }),
      page({ path: 'b', refs: [ref('v2')] }),
    ])
    expect(collectReferencedViews(model)).toEqual([{ viewId: 'v1' }, { viewId: 'v2' }])
  })

  it('yields both variants for a view referenced as diagram and as sequence', () => {
    const model = docsModel([
      page({ path: 'a', refs: [ref('v1', 'diagram'), ref('v1', 'sequence')] }),
    ])
    expect(collectReferencedViews(model)).toEqual([
      { viewId: 'v1' },
      { viewId: 'v1', dynamic: 'sequence' },
    ])
  })

  it('treats a non-sequence dynamic ref as the default diagram variant', () => {
    const model = docsModel([page({ path: 'a', refs: [ref('v1', 'diagram')] })])
    expect(collectReferencedViews(model)).toEqual([{ viewId: 'v1' }])
  })
})
