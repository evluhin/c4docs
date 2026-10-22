// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { LikeC4 } from './LikeC4'

/**
 * Phase 1 end-to-end for docs-as-code against the `examples/docs-as-code` project:
 * read through the public SDK, exercising discovery, per-file modeling (raw
 * fidelity, frontmatter, title, asset manifest), tree assembly, and entry
 * resolution — the same model the dev server, build, and MCP consume.
 *
 * The build-level assertions (docs pages reach `dist`, the referenced image is
 * copied, a no-docs build stays unchanged) live in `docs-build-e2e.spec.ts`.
 */
describe('docs-as-code (phase 1 e2e)', () => {
  const workspace = resolve(__dirname, '../../../examples/docs-as-code')

  it('builds a docs model with pages, tree nav, entry, and resolved assets', async ({ expect }) => {
    await using likec4 = await LikeC4.fromWorkspace(workspace, { throwIfInvalid: true, printErrors: false })
    const docs = await likec4.docsModel('docs-as-code')

    // Pages discovered, index.md mapped to its folder path
    expect(Object.keys(docs.pages).sort()).toEqual([
      '',
      'adr',
      'adr/0001-record-architecture-decisions',
      'architecture',
    ])

    // Rendered HTML + derived title + raw fidelity
    const home = docs.pages['']!
    expect(home.title).toBe('Home')
    expect(home.html).toContain('Welcome')

    const adrDoc = docs.pages['adr/0001-record-architecture-decisions']!
    expect(adrDoc.title).toBe('Record architecture decisions')
    // raw preserved byte-for-byte: the source still starts with the first heading
    expect(adrDoc.raw.startsWith('# Record architecture decisions')).toBe(true)

    // Tree reflects the folder structure with index.md overrides
    const topPaths = docs.tree.map((n) => n.path)
    // root index.md frontmatter `order` puts architecture before the adr folder
    expect(topPaths).toEqual(['architecture', 'adr'])

    const adrFolder = docs.tree.find((n) => n.path === 'adr')
    expect(adrFolder?.kind).toBe('folder')
    expect(adrFolder?.label).toBe('Decisions')
    expect(adrFolder?.children?.map((c) => c.path)).toEqual(['adr/0001-record-architecture-decisions'])

    // Docs-first landing entry resolves to the root index
    expect(docs.entry).toBe('')

    // Relative image asset resolved into the manifest and src rewritten.
    // The rewritten src is ROOT-ABSOLUTE (leading '/') so it resolves to the
    // copied asset at <base>/docs/img/overview.png regardless of the route.
    expect(home.assets).toHaveLength(1)
    expect(home.assets[0]!.outputPath).toBe('/docs/img/overview.png')
    expect(home.html).toContain('src="/docs/img/overview.png"')
    expect(home.html).not.toContain('src="docs/img/overview.png"')
    expect(home.html).not.toContain('./img/overview.png')
  })
})

describe('docs-as-code (no docs)', () => {
  let empty: string

  beforeAll(async () => {
    empty = await mkdtemp(join(tmpdir(), 'likec4-nodocs-'))
    await writeFile(
      join(empty, 'likec4.config.json'),
      JSON.stringify({ name: 'no-docs' }),
    )
    await writeFile(
      join(empty, 'model.c4'),
      'specification { element system }\nmodel { sys = system "S" }\nviews { view index { include * } }\n',
    )
  })

  afterAll(async () => {
    await rm(empty, { recursive: true, force: true })
  })

  it('leaves a project without docs with an empty docs model', async ({ expect }) => {
    await using likec4 = await LikeC4.fromWorkspace(empty)
    const docs = await likec4.docsModel('no-docs')
    expect(docs.pages).toEqual({})
    expect(docs.tree).toEqual([])
    expect(docs.entry).toBeNull()
  })
})
