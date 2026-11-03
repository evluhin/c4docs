// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

import type { DocAsset, DocPage, DocsModel, ProjectId } from '@c4docs/likec4-core/types'
import type { LikeC4LanguageServices } from '@c4docs/likec4-language-services'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  buildAssetLookup,
  mimeTypeForPath,
  normalizeOutputPath,
  parseAssetRequest,
  stripBase,
} from './docsAssetsMiddleware'

describe('normalizeOutputPath', () => {
  it('strips the leading slash and keeps the docs-relative path', ({ expect }) => {
    expect(normalizeOutputPath('/docs/assets/edge-service.png')).toBe('docs/assets/edge-service.png')
  })

  it('normalizes backslashes to forward slashes', ({ expect }) => {
    expect(normalizeOutputPath('\\docs\\assets\\x.png')).toBe('docs/assets/x.png')
  })
})

describe('stripBase', () => {
  it('returns the path unchanged when base is root', ({ expect }) => {
    expect(stripBase('/docs/assets/x.png', '/')).toBe('/docs/assets/x.png')
  })

  it('strips a configured non-root base', ({ expect }) => {
    expect(stripBase('/my-app/docs/assets/x.png', '/my-app/')).toBe('/docs/assets/x.png')
  })

  it('leaves paths that do not start with the base untouched', ({ expect }) => {
    expect(stripBase('/docs/assets/x.png', '/my-app/')).toBe('/docs/assets/x.png')
  })
})

describe('parseAssetRequest', () => {
  it('maps a single-project docs path to a key with no project id', ({ expect }) => {
    expect(parseAssetRequest('/docs/assets/edge-service.png')).toEqual({
      key: 'docs/assets/edge-service.png',
      projectId: null,
    })
  })

  it('maps a project-scoped docs path to the non-scoped key and the project id', ({ expect }) => {
    expect(parseAssetRequest('/project/security/docs/assets/edge-service.png')).toEqual({
      key: 'docs/assets/edge-service.png',
      projectId: 'security',
    })
  })

  it('decodes percent-encoding and drops query/hash', ({ expect }) => {
    expect(parseAssetRequest('/docs/assets/edge%20service.png?v=1#x')).toEqual({
      key: 'docs/assets/edge service.png',
      projectId: null,
    })
  })

  it('returns null for non-docs paths so they fall through to next()', ({ expect }) => {
    expect(parseAssetRequest('/some/view.svg')).toBeNull()
    expect(parseAssetRequest('/')).toBeNull()
  })
})

describe('mimeTypeForPath', () => {
  it('resolves known image and pdf extensions', ({ expect }) => {
    expect(mimeTypeForPath('x.png')).toBe('image/png')
    expect(mimeTypeForPath('x.JPG')).toBe('image/jpeg')
    expect(mimeTypeForPath('x.svg')).toBe('image/svg+xml')
    expect(mimeTypeForPath('x.pdf')).toBe('application/pdf')
  })

  it('falls back to a generic binary type for unknown extensions', ({ expect }) => {
    expect(mimeTypeForPath('x.unknownext')).toBe('application/octet-stream')
  })
})

describe('buildAssetLookup', () => {
  let projectRoot: string

  const makeServices = (pages: Record<string, DocPage>): LikeC4LanguageServices => {
    const docs: DocsModel = { tree: [], pages, entry: null }
    return {
      docsModel: async () => docs,
    } as unknown as LikeC4LanguageServices
  }

  const makePage = (assets: DocAsset[]): DocPage => ({
    path: 'index',
    title: 'Index',
    frontmatter: {},
    html: '',
    raw: '',
    refs: [],
    links: [],
    assets,
  })

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'docs-assets-test-'))
    writeFileSync(join(projectRoot, 'edge-service.png'), 'PNGBYTES')
  })

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('maps a known outputPath to the asset source path on disk', async ({ expect }) => {
    const sourceAbsPath = join(projectRoot, 'edge-service.png')
    const services = makeServices({
      index: makePage([{ sourceAbsPath, outputPath: '/docs/assets/edge-service.png' }]),
    })

    const lookup = await buildAssetLookup(services, 'default' as ProjectId, projectRoot)

    expect(lookup.get('docs/assets/edge-service.png')).toBe(sourceAbsPath)
  })

  it('rejects an asset whose source escapes the project folder via ..', async ({ expect }) => {
    const escaping = join(projectRoot, '..', '..', 'etc', 'passwd')
    const services = makeServices({
      index: makePage([{ sourceAbsPath: escaping, outputPath: '/docs/assets/passwd' }]),
    })

    const lookup = await buildAssetLookup(services, 'default' as ProjectId, projectRoot)

    expect(lookup.has('docs/assets/passwd')).toBe(false)
  })
})
