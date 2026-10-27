// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { fromWorkspace } from '@c4docs/likec4-language-services/node'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import k from 'tinyrainbow'
import type { Argv } from 'yargs'
import { type ViteLogger, createLikeC4Logger, startTimer } from '../../../logger'
import { ensurePlaywright, ensureReact } from '../../ensure-libs'
import { path, project as projectOption } from '../../options'
import { runExportImages } from '../image/handler'
import { buildMkDocsNav } from './mkdocs-nav'
import { docFilePath, transformToTechDocs } from './transform'

/** The directory under the output root that holds the generated Markdown pages. */
const DOCS_SUBDIR = 'docs'
/** The directory under `docs/` that holds the exported view images. */
const IMAGES_SUBDIR = 'images'

export type TechDocsExportArgs = {
  /** The directory where c4 files are located. */
  path: string
  /** Project to export; required when the workspace has multiple projects. */
  project: string | undefined
  /** Output directory for the TechDocs tree (`mkdocs.yml` + `docs/`). */
  output: string
  /** Base URL of the interactive LikeC4 site used for `View interactive version` links. */
  siteBaseUrl: string
}

/**
 * Exports the project's documentation as a Backstage TechDocs / MkDocs tree:
 *
 * - renders every doc-referenced view to `<output>/docs/images/` via the shared
 *   image pipeline ({@link runExportImages}),
 * - transforms each {@link DocPage} into TechDocs Markdown (```likec4-view →
 *   static image + interactive link; ```mermaid passthrough; link rewrites) and
 *   writes it to `<output>/docs/<route>.md`,
 * - writes `<output>/mkdocs.yml` with a `nav:` built from the docs tree.
 *
 * Fully static and one-way: no runtime LikeC4, no HTML, no network.
 */
export async function runExportTechDocs(args: TechDocsExportArgs, logger: ViteLogger): Promise<void> {
  const timer = startTimer(logger)
  const output = resolve(args.output)
  const docsDir = join(output, DOCS_SUBDIR)
  const imagesDir = join(docsDir, IMAGES_SUBDIR)

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
  const knownPaths = new Set(Object.keys(docsModel.pages))

  let written = 0
  for (const page of Object.values(docsModel.pages)) {
    const markdown = transformToTechDocs(page.raw, {
      manifest,
      siteBaseUrl: args.siteBaseUrl,
      docRoute: page.path,
      knownPaths,
      imagesDir: IMAGES_SUBDIR,
    })
    const outfile = join(docsDir, docFilePath(page.path))
    await mkdir(dirname(outfile), { recursive: true })
    await writeFile(outfile, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf-8')
    written++
    logger.info(`${k.dim('page')} ${page.path || '(index)'} ${k.dim('->')} ${outfile}`)
  }

  const nav = buildMkDocsNav(docsModel)
  const siteName = docsModel.pages[docsModel.entry ?? '']?.title ?? projectId
  const mkdocs = `site_name: ${JSON.stringify(siteName)}\n\n${nav}`
  const mkdocsFile = join(output, 'mkdocs.yml')
  await writeFile(mkdocsFile, mkdocs, 'utf-8')
  logger.info(`${k.dim('mkdocs')} ${mkdocsFile}`)

  if (written === 0) {
    logger.warn(k.yellow('no documents found to export'))
  }
  timer.stopAndLog(`✓ export techdocs in `)
}

/** Registers the `export techdocs` subcommand and its options on the yargs instance. */
export function techdocsCmd(yargs: Argv) {
  return yargs.command({
    command: 'techdocs [path]',
    describe: 'export docs to MkDocs / Backstage TechDocs (Markdown + mkdocs.yml)',
    builder: yargs =>
      yargs
        .positional('path', path)
        .options({
          project: projectOption,
          'outdir': {
            alias: ['o', 'output'],
            type: 'string',
            desc: 'output directory for the TechDocs tree (mkdocs.yml and docs/)',
            normalize: true,
            nargs: 1,
            demandOption: true,
            coerce: resolve,
          },
          'site-url': {
            type: 'string',
            desc: 'base url of the interactive LikeC4 site for "View interactive version" links',
            default: '/',
            nargs: 1,
          },
        })
        .epilog(`${k.bold('Examples:')}
  ${k.green('$0 export techdocs -p my-project -o ./techdocs --site-url https://c4.acme.dev src/likec4')}
    ${k.gray('Export docs to ./techdocs as MkDocs Markdown with images and a mkdocs.yml nav')}
`),
    handler: async args => {
      const logger = createLikeC4Logger('c4:export')
      await ensureReact()
      await ensurePlaywright()
      await runExportTechDocs(
        {
          path: args.path,
          project: args.project,
          output: args.outdir as string,
          siteBaseUrl: args['site-url'] as string,
        },
        logger,
      )
    },
  })
}
