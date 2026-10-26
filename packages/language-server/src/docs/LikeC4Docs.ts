// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocAsset, DocPage, DocsModel, ProjectId } from '@likec4/core/types'
import { onNextTick } from '@likec4/core/utils'
import { Disposable, DocumentState, URI, UriUtils } from 'langium'
import { posix } from 'node:path'
import type {
  DocsUpdateEvent,
  DocsUpdateListener,
  LikeC4Docs,
} from '../filesystem/types'
import { isMarkdownFile } from '../filesystem/utils'
import { logger as rootLogger } from '../logger'
import type { LikeC4Services, LikeC4SharedServices } from '../module'
import { ADisposable, safeCall } from '../utils'
import type { Project } from '../workspace/ProjectsManager'
import { discoverDocs, docRoutePath } from './discovery'
import type { DocLinkDiagnostic, DocLinkResolution, DocViewLinkState, DocViewResolution } from './model-doc'
import { modelDocFile } from './model-doc'
import { assembleDocsTreeFromNav, parseNavYaml } from './nav'
import { assembleDocsTree } from './tree'

function isLikeC4Services(services: object): services is LikeC4Services {
  return 'likec4' in services
}

/**
 * Builds the in-app diagram route href for a view link.
 *
 * - single project: `/view/<id>/`
 * - project-scoped: `/project/<projectId>/view/<id>/`
 *
 * `?focus` maps to the `focusOnElement` search param and `?dynamic` to `dynamic`.
 * The href is root-absolute so the SPA's base-path prefixing applies.
 */
function buildViewRoute(projectId: ProjectId | undefined, viewId: string, state: DocViewLinkState): string {
  const encodedView = encodeURIComponent(viewId)
  const base = projectId
    ? `/project/${encodeURIComponent(projectId)}/view/${encodedView}/`
    : `/view/${encodedView}/`
  const params = new URLSearchParams()
  if (state.focus) {
    params.set('focusOnElement', state.focus)
  }
  if (state.dynamic) {
    params.set('dynamic', state.dynamic)
  }
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

const docsLogger = rootLogger.getChild('docs')

/**
 * Discovers, models, and assembles the docs model for each project, reusing the
 * existing `FileSystemProvider` for discovery and caching the result per project.
 * Mirrors the `DescriptionFiles` service shape (update + listeners) so dev HMR can
 * reload on `.md` changes over the same seam as `.c4` changes.
 */
export class DefaultLikeC4Docs extends ADisposable implements LikeC4Docs {
  private cache = new Map<ProjectId, Promise<DocsModel>>()
  private listeners: DocsUpdateListener[] = []

  constructor(private services: LikeC4SharedServices) {
    super()
    this.onDispose(Disposable.create(() => {
      this.cache.clear()
      this.listeners.length = 0
    }))
    onNextTick(() => {
      this.onDispose(
        services.workspace.ProjectsManager.onProjectsUpdate(() => this.clearCaches()),
      )
      // The docs model is primed during workspace init, before any `.c4`
      // document is linked, so view-link resolution cannot see the model yet.
      // Clear the cache whenever the model is (re)parsed so the next docs read
      // rebuilds with resolved `likec4://view/<id>` links.
      const likec4 = services.ServiceRegistry.all.find(isLikeC4Services)
      if (likec4) {
        this.onDispose(
          likec4.likec4.ModelBuilder.onModelParsed(() => this.clearCaches()),
        )
      }
    })
  }

  clearCaches(): void {
    this.cache.clear()
  }

  onDocsUpdate(listener: DocsUpdateListener): Disposable {
    this.listeners.push(listener)
    return Disposable.create(() => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) {
        this.listeners.splice(index, 1)
      }
    })
  }

  docsModel(projectId: ProjectId): Promise<DocsModel> {
    const cached = this.cache.get(projectId)
    if (cached) {
      return cached
    }
    const result = this.buildDocsModel(projectId)
    this.cache.set(projectId, result)
    return result
  }

  isDocsFile(uri: URI): boolean {
    if (uri.scheme !== 'file' || !isMarkdownFile(uri.path)) {
      return false
    }
    for (const projectId of this.services.workspace.ProjectsManager.all) {
      const project = safeGetProject(this.services, projectId)
      if (project && this.isInsideDocsDir(project, uri)) {
        return true
      }
    }
    return false
  }

  async handleFileSystemUpdate(
    event: { update: URI; delete?: never } | { delete: URI; update?: never },
  ): Promise<void> {
    const uri = event.update ?? event.delete
    const projects = new Set<ProjectId>()
    for (const projectId of this.services.workspace.ProjectsManager.all) {
      const project = safeGetProject(this.services, projectId)
      if (project && this.isInsideDocsDir(project, uri)) {
        projects.add(projectId)
      }
    }
    for (const projectId of projects) {
      this.cache.delete(projectId)
      // Eagerly recompute so the next read (and listeners) see fresh data.
      this.docsModel(projectId).catch((err) => {
        docsLogger.warn(`Failed to rebuild docs for project ${projectId}`, { err })
      })
      this.triggerUpdate({ projectId })
    }
  }

  private docsDirUri(project: Project): URI {
    const dir = project.config.docs?.dir ?? 'docs'
    return UriUtils.resolvePath(project.folderUri, dir)
  }

  private isInsideDocsDir(project: Project, uri: URI): boolean {
    const docsDir = this.docsDirUri(project)
    const prefix = docsDir.path.endsWith('/') ? docsDir.path : docsDir.path + '/'
    return uri.path === docsDir.path || uri.path.startsWith(prefix)
  }

  private async buildDocsModel(projectId: ProjectId): Promise<DocsModel> {
    const project = safeGetProject(this.services, projectId)
    if (!project) {
      return { tree: [], pages: {}, entry: null }
    }
    const docsDir = this.docsDirUri(project)
    const provider = this.services.workspace.FileSystemProvider

    const files = await provider.scanDirectory(docsDir, isMarkdownFile)
    // Add the docs dir to the watch set so dev picks up changes (mirrors .c4 scan).
    this.services.workspace.FileSystemWatcher?.watch(docsDir.fsPath)

    const relativePaths = files.map((f) => UriUtils.relative(docsDir, f.uri))
    const { docs } = discoverDocs(relativePaths)

    const relativeToUri = new Map(
      files.map((f) => [UriUtils.relative(docsDir, f.uri).replace(/\\/g, '/'), f.uri] as const),
    )

    const { linkResolution, viewResolution } = await this.buildResolution(projectId, docs.map((d) => d.path))

    const pages: DocPage[] = []
    for (const doc of docs) {
      const uri = relativeToUri.get(doc.relativePath)
      if (!uri) {
        continue
      }
      const raw = await provider.readFile(uri)
      const page = modelDocFile({
        path: doc.path,
        sourceAbsPath: uri.fsPath,
        raw,
        resolveAsset: (reference) => this.resolveAsset(project, uri, reference),
        linkResolution,
        ...(viewResolution ? { viewResolution } : {}),
        onDiagnostics: (diagnostics) => this.logLinkDiagnostics(projectId, doc.path, diagnostics),
      })
      pages.push(page)
    }

    const entryConfig = project.config.docs?.entry
    const knownPaths = new Set(pages.map((p) => p.path))

    // Optional docs/nav.yaml explicit navigation (mkdocs-style). When present and
    // well-formed, the tree is built ENTIRELY from it; otherwise fall back to the
    // convention tree. The two are mutually exclusive and never merged.
    const navUri = UriUtils.resolvePath(docsDir, 'nav.yaml')
    // Watch nav.yaml so dev HMR reloads when it is created/changed (handled by the
    // docs-dir-keyed handleFileSystemUpdate, which invalidates the cache).
    this.services.workspace.FileSystemWatcher?.watch(navUri.fsPath)
    const navExists = await provider.exists(navUri).catch(() => false)
    if (navExists) {
      const source = await provider.readFile(navUri)
      const { entries, diagnostics, malformed } = parseNavYaml(source, { knownPaths, docRoutePath })
      if (!malformed) {
        const result = assembleDocsTreeFromNav(pages, entries, { entryConfig })
        for (const diagnostic of diagnostics) {
          docsLogger.warn(`[${projectId}] nav.yaml: ${diagnostic.message}`)
        }
        if (result.hidden.length > 0) {
          docsLogger.warn(
            `[${projectId}] nav.yaml does not list ${result.hidden.length} doc(s), hidden from the tree: ${
              result.hidden.map((p) => p || '/').join(', ')
            }`,
          )
        }
        const { tree, pages: pagesByPath, entry } = result
        return { tree, pages: pagesByPath, entry }
      }
      for (const diagnostic of diagnostics) {
        docsLogger.warn(`[${projectId}] nav.yaml: ${diagnostic.message}`)
      }
    }

    return assembleDocsTree(pages, { entryConfig })
  }

  /**
   * Builds the per-project link-resolution context used by {@link modelDocFile}
   * to rewrite inter-doc and `likec4://view/<id>` links.
   *
   * View-id existence is checked against the computed model for the project; if
   * the model cannot be obtained (missing LikeC4 services or EMPTY model), no
   * view id is considered to exist (a warning is logged). The single-vs-project
   * route form mirrors the SPA signal (`hasMultipleProjects()`).
   */
  private async buildResolution(
    projectId: ProjectId,
    knownPaths: readonly string[],
  ): Promise<{ linkResolution: DocLinkResolution; viewResolution: DocViewResolution | undefined }> {
    const likec4 = this.services.ServiceRegistry.all.find(isLikeC4Services)
    let viewExists: (viewId: string) => boolean = () => false
    let viewResolution: DocViewResolution | undefined
    if (likec4) {
      // `computeModel` waits for the DocumentBuilder to reach the `Linked` state
      // before returning a model with computed views. During workspace init the
      // docs model is primed *before* any `.c4` document is linked, so awaiting
      // here would deadlock (the build phase can only advance after this prime
      // completes). In that case skip view resolution — the model is re-parsed
      // afterwards, which clears the docs cache (see constructor) so the next
      // read resolves links and refs. Once linking is done, await to resolve.
      if (this.services.workspace.DocumentBuilder.currentPhase >= DocumentState.Linked) {
        try {
          const model = await likec4.likec4.ModelBuilder.computeModel(projectId)
          viewExists = (viewId) => model.findView(viewId) != null
          viewResolution = {
            viewExists,
            elementExists: (fqn) => model.findElement(fqn) != null,
          }
        } catch (err) {
          docsLogger.warn(
            `Could not compute model for project ${projectId}; doc view links and refs will not resolve`,
            { err },
          )
        }
      }
    } else {
      docsLogger.warn('LikeC4 services are not registered; doc view links and refs will not resolve')
    }

    const isProjectScoped = this.services.workspace.ProjectsManager.hasMultipleProjects()
    const routeFor = (viewId: string, state: DocViewLinkState): string =>
      buildViewRoute(isProjectScoped ? projectId : undefined, viewId, state)

    return {
      linkResolution: {
        knownPaths: new Set(knownPaths),
        viewExists,
        routeFor,
      },
      viewResolution,
    }
  }

  private logLinkDiagnostics(
    projectId: ProjectId,
    docPath: string,
    diagnostics: readonly DocLinkDiagnostic[],
  ): void {
    for (const diagnostic of diagnostics) {
      docsLogger.warn(`[${projectId}] ${docPath || '/'}: ${diagnostic.message}`)
    }
  }

  /**
   * Resolves a relative asset reference against the doc's folder, producing the
   * absolute source path and a build output path.
   *
   * `outputPath` is **root-absolute** (leading `/`, e.g. `/docs/img/overview.png`)
   * so the rewritten `src` resolves to the copied asset at `<base>/docs/img/overview.png`
   * regardless of the doc's current route. The SPA applies the configured base path
   * when rendering doc HTML (see `DocsPage`); the build copies the asset into the
   * publicDir at the same path (leading slash stripped).
   */
  private resolveAsset(project: Project, docUri: URI, reference: string): DocAsset | null {
    const clean = reference.split('?')[0]!.split('#')[0]!
    if (clean === '') {
      return null
    }
    const docDir = UriUtils.dirname(docUri)
    const assetUri = UriUtils.resolvePath(docDir, clean)
    // Keep assets within the project folder.
    const projectPrefix = project.folderUri.path.endsWith('/')
      ? project.folderUri.path
      : project.folderUri.path + '/'
    if (!assetUri.path.startsWith(projectPrefix)) {
      return null
    }
    const relative = posix.normalize(UriUtils.relative(project.folderUri, assetUri)).replace(/\\/g, '/')
    const outputPath = '/' + relative.replace(/^\/+/, '')
    return {
      sourceAbsPath: assetUri.fsPath,
      outputPath,
    }
  }

  private triggerUpdate(event: DocsUpdateEvent): void {
    // Copy so a listener that unsubscribes during dispatch does not skip others.
    for (const listener of this.listeners.slice()) {
      safeCall(() => listener(event))
    }
  }
}

function safeGetProject(services: LikeC4SharedServices, projectId: ProjectId): Project | undefined {
  try {
    return services.workspace.ProjectsManager.getProject(projectId)
  } catch {
    return undefined
  }
}
