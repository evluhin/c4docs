// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocAsset, DocPage, DocsModel, ProjectId } from '@likec4/core/types'
import { onNextTick } from '@likec4/core/utils'
import { Disposable, URI, UriUtils } from 'langium'
import { posix } from 'node:path'
import type {
  DocsUpdateEvent,
  DocsUpdateListener,
  LikeC4Docs,
} from '../filesystem/types'
import { isMarkdownFile } from '../filesystem/utils'
import { logger as rootLogger } from '../logger'
import type { LikeC4SharedServices } from '../module'
import { ADisposable, safeCall } from '../utils'
import type { Project } from '../workspace/ProjectsManager'
import { discoverDocs } from './discovery'
import { modelDocFile } from './model-doc'
import { assembleDocsTree } from './tree'

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
      })
      pages.push(page)
    }

    return assembleDocsTree(pages, { entryConfig: project.config.docs?.entry })
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
