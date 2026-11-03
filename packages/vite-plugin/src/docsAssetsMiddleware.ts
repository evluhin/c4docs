// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

import type { ProjectId } from '@c4docs/likec4-core/types'
import type { LikeC4LanguageServices } from '@c4docs/likec4-language-services'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'pathe'
import type { Connect, ViteDevServer } from 'vite'
import type { ViteLogger } from './logger'

/**
 * Minimal extension -> MIME map for the static assets a doc may reference
 * (images and PDFs). Kept tiny on purpose so the dev server does not pull in a
 * heavy mime dependency; unknown extensions fall back to a generic binary type.
 */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
}

/**
 * Resolves the MIME type for a file path from its extension, defaulting to a
 * generic binary stream when the extension is unknown.
 */
export function mimeTypeForPath(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Normalizes a modeled `outputPath` (project-root-relative, leading `/`, e.g.
 * `/docs/assets/edge-service.png`) to the slash-separated, leading-slash-free
 * key used for lookups. Mirrors the normalization `copyDocsAssets` applies when
 * the production build copies the same asset, so dev and build agree on URLs.
 */
export function normalizeOutputPath(outputPath: string): string {
  return outputPath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/**
 * Extracts the asset lookup key from an incoming request URL path.
 *
 * Handles the two URL shapes the SPA can produce:
 *  - single-project / non-scoped: `/docs/assets/x.png`
 *  - project-scoped route:        `/project/<projectId>/docs/assets/x.png`
 *
 * The modeled `outputPath` is NOT project-scoped (always `/docs/...`), so the
 * project-scoped prefix is stripped down to the same `docs/...` key before the
 * manifest lookup. Returns `null` when the path is not under a docs prefix.
 *
 * NOTE (multi-project limitation): because `outputPath` is not project-scoped,
 * two projects that both expose `/docs/assets/x.png` collide on the same key.
 * The single-project case (the common one) is served correctly; for the
 * project-scoped shape we restrict the manifest to the matching project to
 * avoid serving one project's bytes under another's URL.
 */
export function parseAssetRequest(
  urlPath: string,
): { key: string; projectId: string | null } | null {
  // Strip query/hash and decode percent-encoding.
  const pathname = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!)
  const trimmed = pathname.replace(/^\/+/, '')

  const projectScoped = /^project\/([^/]+)\/(docs\/.+)$/.exec(trimmed)
  switch (true) {
    case projectScoped !== null:
      return { key: projectScoped[2]!, projectId: projectScoped[1]! }
    case trimmed.startsWith('docs/'):
      return { key: trimmed, projectId: null }
    default:
      return null
  }
}

/**
 * Strips the configured Vite `base` prefix from a request URL path. Vite
 * normally serves the app under `base`; the SPA points asset `src` at
 * `<base>/docs/...`, so we remove `base` before matching the docs prefix.
 */
export function stripBase(urlPath: string, base: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  if (normalizedBase !== '/' && urlPath.startsWith(normalizedBase)) {
    return `/${urlPath.slice(normalizedBase.length)}`
  }
  // base === '/' or path already relative to root
  return urlPath
}

/**
 * Builds the `normalizedOutputPath -> sourceAbsPath` lookup for a single
 * project's docs model. Only manifested assets (referenced by a modeled `.md`)
 * are servable, which — exactly like the build — prevents the dev server from
 * becoming an arbitrary-file reader.
 *
 * Containment is still enforced defensively: an asset whose `sourceAbsPath`
 * resolves outside the project folder is dropped (the modeling layer already
 * rejects `..` escapes, this is a belt-and-braces check on the serving side).
 */
export async function buildAssetLookup(
  likec4: LikeC4LanguageServices,
  projectId: ProjectId,
  projectFolderFsPath: string,
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()
  const docs = await likec4.docsModel(projectId)
  const projectRoot = resolve(projectFolderFsPath)
  for (const page of Object.values(docs.pages)) {
    for (const asset of page.assets) {
      const key = normalizeOutputPath(asset.outputPath)
      if (key === '') {
        continue
      }
      const abs = resolve(asset.sourceAbsPath)
      // Containment: the resolved source must stay inside the project folder.
      const rel = relative(projectRoot, abs)
      if (rel.startsWith('..') || resolve(projectRoot, rel) !== abs) {
        continue
      }
      // First page wins; duplicates across pages point at the same source.
      if (!lookup.has(key)) {
        lookup.set(key, abs)
      }
    }
  }
  return lookup
}

/**
 * Creates the Vite dev middleware that serves doc-referenced static assets
 * (images, PDFs) at the same root-absolute URLs the modeling layer rewrote them
 * to and the production build copies them to — closing the dev/build parity gap
 * where these assets previously fell through to the SPA not-found page.
 *
 * The lookup is rebuilt on every matched request from the CURRENT docs model, so
 * replacing an already-referenced asset on disk is served without a dev-server
 * restart. Anything that is not a known, existing asset file is passed to
 * `next()` so real doc routes and the SPA history fallback keep working.
 */
export function createDocsAssetsMiddleware(
  likec4: LikeC4LanguageServices,
  server: ViteDevServer,
  logger: ViteLogger,
): Connect.NextHandleFunction {
  const base = server.config.base || '/'

  return (req, res, next) => {
    void handle(req, res).catch((err) => {
      logger.error(`docs asset middleware error: ${String(err)}`)
      next()
    })

    async function handle(
      request: Connect.IncomingMessage,
      response: typeof res,
    ): Promise<void> {
      const method = request.method ?? 'GET'
      if (method !== 'GET' && method !== 'HEAD') {
        next()
        return
      }
      const url = request.url
      if (!url) {
        next()
        return
      }

      const parsed = parseAssetRequest(stripBase(url, base))
      if (!parsed) {
        next()
        return
      }

      // Restrict the project set: for a project-scoped URL only consult that
      // project; otherwise consult every project (single-project repos resolve
      // unambiguously, which is the case the fix targets).
      const projects = likec4.projects()
      const candidates = parsed.projectId !== null
        ? projects.filter(p => p.id === parsed.projectId)
        : projects

      let sourceAbsPath: string | null = null
      for (const project of candidates) {
        const lookup = await buildAssetLookup(likec4, project.id, project.folder.fsPath)
        const hit = lookup.get(parsed.key)
        if (hit) {
          sourceAbsPath = hit
          break
        }
      }

      if (!sourceAbsPath || !existsSync(sourceAbsPath) || !statSync(sourceAbsPath).isFile()) {
        // Not a servable asset: let doc routes / SPA fallback handle it.
        next()
        return
      }

      const stat = statSync(sourceAbsPath)
      response.statusCode = 200
      response.setHeader('Content-Type', mimeTypeForPath(sourceAbsPath))
      response.setHeader('Content-Length', stat.size)
      // Dev assets are not fingerprinted; avoid stale caches while editing.
      response.setHeader('Cache-Control', 'no-cache')
      if (method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(sourceAbsPath).on('error', (err) => {
        logger.error(`failed to stream docs asset ${sourceAbsPath}: ${String(err)}`)
        if (!response.headersSent) {
          response.statusCode = 500
        }
        response.end()
      }).pipe(response)
    }
  }
}
