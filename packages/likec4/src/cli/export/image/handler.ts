// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramView, NonEmptyArray } from '@likec4/core'
import { fromWorkspace } from '@likec4/language-services/node'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { hasAtLeast } from 'remeda'
import k from 'tinyrainbow'
import type { Argv } from 'yargs'
import { type ViteLogger, createLikeC4Logger, startTimer } from '../../../logger'
import { resolveServerUrl } from '../../../vite/printServerUrls'
import { viteDev } from '../../../vite/vite-dev'
import { ensurePlaywright, ensureReact } from '../../ensure-libs'
import { path, project as projectOption } from '../../options'
import { exportViewsToPNG } from '../png/handler'
import { collectReferencedViews } from './collect-referenced-views'
import { imageFileName, viewContentHash } from './content-hash'
import {
  type ImageManifest,
  type ImageManifestEntry,
  buildImageManifest,
  manifestKey,
  writeImageManifest,
} from './manifest'

/** The manifest file name written alongside the exported images. */
export const IMAGE_MANIFEST_FILENAME = 'images.json'

export type ImageExportArgs = {
  /** The directory where c4 files are located. */
  path: string
  /** Project to export; required because the manifest is per-project. */
  project: string | undefined
  /** Output directory for images and the manifest. */
  output: string
}

/**
 * The outcome of {@link runExportImages}: the manifest and the absolute output
 * directory the hashed SVG files and `images.json` were written to. Shared with
 * the external-docs export features that consume these images.
 */
export interface ExportImagesResult {
  manifest: ImageManifest
  outputDir: string
}

/**
 * Renders every view referenced by any document to a deterministic,
 * content-hashed `<slug>.<hash>.svg` and writes an `images.json` manifest
 * mapping each referenced view id to its image path (relative to `output`,
 * forward-slashed).
 *
 * Dynamic views referenced with `dynamic: sequence` are rendered with the
 * sequence layout; all other references use the default diagram layout. A view
 * referenced both ways is rendered twice.
 *
 * Re-running with unchanged views yields identical file names because the name
 * is derived from the rendered bytes. Stale files for a changed view are left in
 * place by the renderer, but the manifest always points at the current content.
 *
 * Exported so the external-docs export features can reuse the same artifact.
 */
export async function runExportImages(args: ImageExportArgs, logger: ViteLogger): Promise<ExportImagesResult> {
  const timer = startTimer(logger)
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

  const output = resolve(args.output)
  const docsModel = await likec4.docsModel(projectId)
  const referenced = collectReferencedViews(docsModel)

  if (!hasAtLeast(referenced, 1)) {
    logger.warn(k.yellow('no views referenced by documents, nothing to export'))
    await writeImageManifest(join(output, IMAGE_MANIFEST_FILENAME), {})
    timer.stopAndLog(`✓ export images in `)
    return { manifest: {}, outputDir: output }
  }

  const diagrams = await likec4.diagrams(projectId)
  const byId = new Map<string, DiagramView>(diagrams.map(d => [d.id, d]))

  // Split into default-diagram and sequence variants; the PNG/SVG render path
  // applies a single layout variant per batch.
  const diagramViews: DiagramView[] = []
  const sequenceViews: DiagramView[] = []
  for (const ref of referenced) {
    const view = byId.get(ref.viewId)
    if (!view) {
      logger.warn(k.yellow(`referenced view not found, skipping: ${ref.viewId}`))
      continue
    }
    if (ref.dynamic === 'sequence') {
      sequenceViews.push(view)
    } else {
      diagramViews.push(view)
    }
  }

  const tmp = await mkdtemp(join(tmpdir(), 'likec4-images-'))
  let server: Awaited<ReturnType<typeof viteDev>> | undefined
  const entries: ImageManifestEntry[] = []
  try {
    server = await viteDev({
      languageServices: likec4,
      buildWebcomponent: false,
      openBrowser: false,
      hmr: false,
    })
    const serverUrl = resolveServerUrl(server)
    if (!serverUrl) {
      throw new Error('Vite server is not ready, no resolvedUrls')
    }

    const batches: Array<{ views: NonEmptyArray<DiagramView>; sequence: boolean }> = []
    if (hasAtLeast(diagramViews, 1)) {
      batches.push({ views: diagramViews, sequence: false })
    }
    if (hasAtLeast(sequenceViews, 1)) {
      batches.push({ views: sequenceViews, sequence: true })
    }

    for (const batch of batches) {
      const succeed = await exportViewsToPNG({
        logger,
        serverUrl,
        views: batch.views,
        output: tmp,
        outputType: 'flat',
        sequence: batch.sequence,
        format: 'svg',
      })
      if (succeed.length !== batch.views.length) {
        throw new Error(`Failed ${batch.views.length - succeed.length} out of ${batch.views.length} views`)
      }
      const variant = batch.sequence ? 'sequence' : undefined
      for (const { view, path: svgPath } of succeed) {
        // Hash the deterministic layouted-model input, not the rendered SVG
        // bytes, so unchanged views keep stable names across runs while a real
        // diagram change still busts the cache.
        const hash = viewContentHash(view, variant)
        const filename = imageFileName(view.id, hash, 'svg', variant)
        await rename(svgPath, join(output, filename))
        entries.push({ key: manifestKey(view.id, variant), imagePath: filename })
        logger.info(`${k.dim('image')} ${manifestKey(view.id, variant)} ${k.dim('->')} ${filename}`)
      }
    }
  } finally {
    if (server) {
      logger.info(k.cyan('stop server'))
      await server.close().catch(e => logger.error(e))
    }
    await rm(tmp, { recursive: true, force: true })
  }

  const manifest = buildImageManifest(entries)
  await writeImageManifest(join(output, IMAGE_MANIFEST_FILENAME), manifest)
  logger.info(`${k.dim('manifest')} ${join(output, IMAGE_MANIFEST_FILENAME)}`)
  timer.stopAndLog(`✓ export images in `)
  return { manifest, outputDir: output }
}

/** Registers the `export image` subcommand and its options on the yargs instance. */
export function imageCmd(yargs: Argv) {
  return yargs.command({
    command: 'image [path]',
    describe: 'export view images referenced by docs (SVG) with a content-hashed manifest',
    builder: yargs =>
      yargs
        .positional('path', path)
        .options({
          project: projectOption,
          'outdir': {
            alias: ['o', 'output'],
            type: 'string',
            desc: 'output directory for SVG images and images.json manifest',
            normalize: true,
            nargs: 1,
            demandOption: true,
            coerce: resolve,
          },
        })
        .epilog(`${k.bold('Examples:')}
  ${k.green('$0 export image -p my-project -o ./docs/assets src/likec4')}
    ${k.gray('Render every doc-referenced view to ./docs/assets as SVG with an images.json manifest')}
`),
    handler: async args => {
      const logger = createLikeC4Logger('c4:export')
      await ensureReact()
      await ensurePlaywright()
      await runExportImages(
        {
          path: args.path,
          project: args.project,
          output: args.outdir as string,
        },
        logger,
      )
    },
  })
}
