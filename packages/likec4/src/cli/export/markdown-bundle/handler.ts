// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel, DocTreeNode } from '@c4docs/likec4-core'
import { fromWorkspace } from '@c4docs/likec4-language-services/node'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import k from 'tinyrainbow'
import type { Argv } from 'yargs'
import { type ViteLogger, createLikeC4Logger, startTimer } from '../../../logger'
import { ensurePlaywright, ensureReact } from '../../ensure-libs'
import { path, project as projectOption } from '../../options'
import { runExportImages } from '../image/handler'
import { transformToBundle } from './transform'

/** The directory under the output root that holds the exported view images. */
const IMAGES_SUBDIR = 'images'
/** The manifest file describing the doc tree/order, written at the output root. */
const BUNDLE_MANIFEST_FILENAME = 'manifest.json'

export type MarkdownBundleExportArgs = {
  /** The directory where c4 files are located. */
  path: string
  /** Project to export; required when the workspace has multiple projects. */
  project: string | undefined
  /** Output directory for the portable Markdown bundle. */
  output: string
  /**
   * Optional base URL of the interactive LikeC4 site. When given, each embedded
   * view also gets a `View interactive version` link. Omit for a fully
   * platform-neutral bundle.
   */
  siteBaseUrl?: string
}

/** A node of the bundle manifest's doc tree. Mirrors {@link DocTreeNode}. */
interface BundleManifestNode {
  kind: 'doc' | 'folder'
  label: string
  path: string
  order: number
  /** docs only: the `.md` file path relative to the output root */
  file?: string
  /** folders only: nested children in resolved order */
  children?: BundleManifestNode[]
}

/** The `manifest.json` written at the bundle root: the doc tree/order plus entry. */
interface BundleManifest {
  entry: string | null
  tree: BundleManifestNode[]
}

/**
 * Maps a doc route path (no extension) to its bundle Markdown file path. The
 * root route maps to `index.md`; every other route `r` maps to `r.md`.
 */
function docFilePath(route: string): string {
  return route === '' ? 'index.md' : `${route}.md`
}

/** Projects the resolved docs tree into the serializable manifest tree. */
function toManifestTree(tree: readonly DocTreeNode[]): BundleManifestNode[] {
  return tree.map((node): BundleManifestNode => {
    if (node.kind === 'folder') {
      return {
        kind: 'folder',
        label: node.label,
        path: node.path,
        order: node.order,
        children: toManifestTree(node.children ?? []),
      }
    }
    return {
      kind: 'doc',
      label: node.label,
      path: node.path,
      order: node.order,
      file: docFilePath(node.path),
    }
  })
}

/**
 * Builds the bundle manifest from the resolved {@link DocsModel}. The language
 * server already folds `docs/nav.yaml` (sections, labels, order) into
 * `tree`, so the manifest reflects the authored order.
 *
 * Pure: no I/O.
 */
function buildBundleManifest(docsModel: DocsModel): BundleManifest {
  return {
    entry: docsModel.entry,
    tree: toManifestTree(docsModel.tree),
  }
}

/**
 * Exports the project's documentation as a portable Markdown + images bundle for
 * any external publisher (Confluence, etc.):
 *
 * - renders every doc-referenced view to `<output>/images/` via the shared image
 *   pipeline ({@link runExportImages}),
 * - transforms each {@link DocPage} into platform-neutral Markdown (```likec4-view
 *   → relative image reference, optional interactive link; ```mermaid left as a
 *   fenced block) and writes it to `<output>/<route>.md`,
 * - writes `<output>/manifest.json` describing the doc tree/order.
 *
 * LikeC4 knows nothing about any specific publisher: no API, no tokens, no
 * network. Delivery to Confluence or elsewhere lives in the user's CI.
 */
export async function runExportMarkdownBundle(args: MarkdownBundleExportArgs, logger: ViteLogger): Promise<void> {
  const timer = startTimer(logger)
  const output = resolve(args.output)
  const imagesDir = join(output, IMAGES_SUBDIR)

  // Render images first via the shared pipeline (it starts its own server and
  // loads the workspace). The manifest's image paths are relative to imagesDir.
  await mkdir(imagesDir, { recursive: true })
  const { manifest } = await runExportImages(
    { path: args.path, project: args.project, output: imagesDir },
    logger,
  )

  await using likec4 = await fromWorkspace(args.path, {
    graphviz: 'wasm',
    watch: false,
  })

  const projects = [...likec4.languageServices.projects()]
  const projectId = args.project ?? (projects.length === 1 ? projects[0]?.id : undefined)
  if (projectId === undefined) {
    throw new Error('a project must be specified when the workspace has multiple projects')
  }
  if (!projects.some(p => p.id === projectId)) {
    logger.error(`project not found: ${projectId}`)
    throw new Error(`project not found: ${projectId}`)
  }

  const docsModel = await likec4.docsModel(projectId)

  let written = 0
  for (const page of Object.values(docsModel.pages)) {
    const markdown = transformToBundle(page.raw, {
      manifest,
      ...(args.siteBaseUrl !== undefined ? { siteBaseUrl: args.siteBaseUrl } : {}),
      docRoute: page.path,
      imagesDir: IMAGES_SUBDIR,
    })
    const outfile = join(output, docFilePath(page.path))
    await mkdir(dirname(outfile), { recursive: true })
    await writeFile(outfile, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf-8')
    written++
    logger.info(`${k.dim('page')} ${page.path || '(index)'} ${k.dim('->')} ${outfile}`)
  }

  const bundleManifest = buildBundleManifest(docsModel)
  const manifestFile = join(output, BUNDLE_MANIFEST_FILENAME)
  await writeFile(manifestFile, `${JSON.stringify(bundleManifest, null, 2)}\n`, 'utf-8')
  logger.info(`${k.dim('manifest')} ${manifestFile}`)

  if (written === 0) {
    logger.warn(k.yellow('no documents found to export'))
  }
  timer.stopAndLog(`✓ export markdown-bundle in `)
}

/** Registers the `export markdown-bundle` subcommand and its options on the yargs instance. */
export function markdownBundleCmd(yargs: Argv) {
  return yargs.command({
    command: 'markdown-bundle [path]',
    describe: 'export docs to a portable Markdown + images bundle for external publishers',
    builder: yargs =>
      yargs
        .positional('path', path)
        .options({
          project: projectOption,
          'outdir': {
            alias: ['o', 'output'],
            type: 'string',
            desc: 'output directory for the Markdown bundle (.md pages, images/ and manifest.json)',
            normalize: true,
            nargs: 1,
            demandOption: true,
            coerce: resolve,
          },
          'site-url': {
            type: 'string',
            desc: 'optional base url of the interactive LikeC4 site for "View interactive version" links',
            nargs: 1,
          },
        })
        .epilog(`${k.bold('Examples:')}
  ${k.green('$0 export markdown-bundle -p my-project -o ./bundle src/likec4')}
    ${k.gray('Export docs to ./bundle as portable Markdown with images/ and manifest.json')}

  ${k.green('$0 export markdown-bundle -p my-project -o ./bundle --site-url https://c4.acme.dev src/likec4')}
    ${k.gray('Also add "View interactive version" links pointing at the hosted LikeC4 site')}
`),
    handler: async args => {
      const logger = createLikeC4Logger('c4:export')
      await ensureReact()
      await ensurePlaywright()
      await runExportMarkdownBundle(
        {
          path: args.path,
          project: args.project,
          output: args.outdir as string,
          ...(args['site-url'] !== undefined ? { siteBaseUrl: args['site-url'] as string } : {}),
        },
        logger,
      )
    },
  })
}
