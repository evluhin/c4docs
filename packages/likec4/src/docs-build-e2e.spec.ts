// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { fromWorkspace } from '@c4docs/likec4-language-services/node'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'vitest'
import { viteAppRoot } from './vite/utils'
import { viteBuild } from './vite/vite-build'

/**
 * Phase 1 end-to-end for docs-as-code at the **build** layer: runs the real
 * `viteBuild` (the same path as `likec4 build`) and asserts the published
 * `dist` carries the docs. This is the test that ties items 1–14 together and
 * exercises the doc-asset copy (item 14) and backward compatibility (item 13).
 *
 * The static site is a client-rendered SPA, so the docs model (pages, tree,
 * entry) is inlined into the JS bundle by the `likec4:docs` virtual module;
 * doc-referenced relative images are copied to their rewritten output paths.
 *
 * Requires the prebuilt SPA app (`__app__`), produced by `pnpm --filter likec4 build`.
 * When it is absent (a source-only checkout) the suite is skipped rather than
 * failing, since there is nothing to bundle.
 */
function appAvailable(): boolean {
  try {
    return existsSync(viteAppRoot())
  } catch {
    return false
  }
}

const describeBuild = appAvailable() ? describe : describe.skip

describeBuild('docs-as-code build e2e', () => {
  const example = resolve(__dirname, '../../../examples/docs-as-code')

  it('emits docs pages, tree nav, entry, and copies referenced assets into dist', async ({ expect }) => {
    const outDir = await mkdtemp(join(tmpdir(), 'likec4-docs-dist-'))
    try {
      await using languageServices = await fromWorkspace(example, { watch: false })
      await viteBuild({
        languageServices,
        outputDir: outDir,
        buildWebcomponent: false,
      })

      // The referenced relative image is copied to its rewritten output path.
      expect(existsSync(join(outDir, 'docs', 'img', 'overview.png'))).toBe(true)

      // The docs model (pages + tree + entry) is inlined into the bundle.
      const bundle = readBundle(outDir)
      expect(bundle).toContain('Record architecture decisions') // ADR page content
      expect(bundle).toContain('Welcome') // home page content
      expect(bundle).toContain('Decisions') // adr folder label from index.md
      // the copied asset's output path is present (the rewritten <img src>)
      expect(bundle).toContain('/docs/img/overview.png')

      // The rendered page HTML points at the rewritten (copied) asset path, not
      // the original relative reference. `raw` intentionally keeps the original,
      // so assert on the modeled HTML rather than the whole bundle.
      const docs = await languageServices.docsModel('docs-as-code')
      const home = docs.pages['']!
      // The rewritten src must be ROOT-ABSOLUTE (leading '/') so it resolves to
      // the copied asset at <base>/docs/img/overview.png regardless of the
      // doc's current route — never a bare relative path (which the browser
      // would resolve against the route and 404).
      expect(home.html).toContain('src="/docs/img/overview.png"')
      expect(home.html).not.toContain('src="docs/img/overview.png"')
      expect(home.html).not.toContain('./img/overview.png')

      // Inter-doc link: `[architecture](./architecture.md)` is rewritten to the
      // in-app `/docs/architecture` route (never the raw `.md` reference), so a
      // click can be intercepted and routed as an SPA navigation.
      expect(home.html).toContain('href="/docs/architecture"')
      expect(home.html).not.toContain('architecture.md')

      // likec4:// link: `likec4://view/shop` is rewritten to the single-project
      // diagram route `/view/shop/` and the resolved view id is collected into
      // DocPage.links.
      expect(home.html).toContain('href="/view/shop/"')
      expect(home.html).not.toContain('likec4://view/shop')
      expect(home.links).toContain('shop')

      // The nav.yaml drives the tree: the unlisted ADR is hidden from the tree
      // but still present in pages (reachable by direct route).
      expect(home.raw).toContain('likec4://view/shop')
      expect(docs.pages['adr/0001-record-architecture-decisions']).toBeDefined()
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 180_000)

  it('leaves a project without docs unchanged (no docs dir in dist)', async ({ expect }) => {
    const workspace = await mkdtemp(join(tmpdir(), 'likec4-nodocs-src-'))
    const outDir = await mkdtemp(join(tmpdir(), 'likec4-nodocs-dist-'))
    try {
      await writeFile(join(workspace, 'likec4.config.json'), JSON.stringify({ name: 'no-docs' }))
      await writeFile(
        join(workspace, 'model.c4'),
        'specification { element system }\nmodel { sys = system "S" }\nviews { view index { include * } }\n',
      )

      await using languageServices = await fromWorkspace(workspace, { watch: false })
      await viteBuild({
        languageServices,
        outputDir: outDir,
        buildWebcomponent: false,
      })

      // No docs → no doc-asset directory is created in the output.
      expect(existsSync(join(outDir, 'docs'))).toBe(false)
      // Standard site output is still produced.
      expect(existsSync(join(outDir, 'index.html'))).toBe(true)
    } finally {
      await rm(workspace, { recursive: true, force: true })
      await rm(outDir, { recursive: true, force: true })
    }
  }, 180_000)
})

/** Concatenates the built JS assets so inlined docs data can be asserted. */
function readBundle(outDir: string): string {
  const assetsDir = join(outDir, 'assets')
  if (!existsSync(assetsDir)) {
    return ''
  }
  return readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assetsDir, f), 'utf8'))
    .join('\n')
}
