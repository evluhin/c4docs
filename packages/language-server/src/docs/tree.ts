// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocPage, DocsModel, DocTreeNode } from '@likec4/core/types'
import { humanizeTitle } from './model-doc'

export interface AssembleTreeOptions {
  /** `docs.entry` from config (route path, no extension), if set */
  entryConfig?: string | undefined
}

interface FolderBuilder {
  kind: 'folder'
  path: string
  name: string
  folders: Map<string, FolderBuilder>
  docs: DocPage[]
}

function newFolder(path: string, name: string): FolderBuilder {
  return { kind: 'folder', path, name, folders: new Map(), docs: [] }
}

/**
 * Returns the frontmatter `order` as a number when it is a per-file position.
 */
function fileOrder(page: DocPage): number | undefined {
  const order = page.frontmatter.order
  return typeof order === 'number' ? order : undefined
}

/**
 * Returns the `index.md` page of a folder (its route path equals the folder path).
 */
function folderIndex(folderPath: string, pages: Record<string, DocPage>): DocPage | undefined {
  return pages[folderPath]
}

/**
 * Comparator for nodes within a folder:
 * - nodes with an explicit numeric order come first (by that number)
 * - the rest are sorted alphabetically by label
 */
function compareNodes(a: DocTreeNode, b: DocTreeNode): number {
  const aHas = Number.isFinite(a.order)
  const bHas = Number.isFinite(b.order)
  if (aHas && bHas && a.order !== b.order) {
    return a.order - b.order
  }
  if (aHas !== bHas) {
    return aHas ? -1 : 1
  }
  return a.label.localeCompare(b.label)
}

/**
 * Applies an explicit child order (`order: string[]` on a folder index) by name:
 * listed children first in the given sequence, the rest after (stable).
 */
function applyChildOrder(nodes: DocTreeNode[], order: readonly string[] | undefined): DocTreeNode[] {
  if (!order || order.length === 0) {
    return [...nodes].sort(compareNodes)
  }
  const indexOfName = (node: DocTreeNode): number => {
    const name = node.path.split('/').filter(Boolean).pop() ?? node.path
    const i = order.indexOf(name)
    return i === -1 ? Number.POSITIVE_INFINITY : i
  }
  return [...nodes].sort((a, b) => {
    const ai = indexOfName(a)
    const bi = indexOfName(b)
    if (ai !== bi) {
      return ai - bi
    }
    return compareNodes(a, b)
  })
}

function buildNodes(folder: FolderBuilder, pages: Record<string, DocPage>): DocTreeNode[] {
  const nodes: DocTreeNode[] = []

  for (const page of folder.docs) {
    // Skip a folder's own index.md: it provides the folder's label (and, at the
    // root, the landing content), not a child node.
    if (page.path === folder.path) {
      continue
    }
    nodes.push({
      kind: 'doc',
      label: page.title,
      path: page.path,
      order: fileOrder(page) ?? Number.POSITIVE_INFINITY,
    })
  }

  for (const child of folder.folders.values()) {
    const index = folderIndex(child.path, pages)
    const label = (typeof index?.frontmatter.title === 'string' && index.frontmatter.title.trim() !== '')
      ? index.frontmatter.title.trim()
      : humanizeTitle(child.name)
    const childOrder = Array.isArray(index?.frontmatter.order) ? index.frontmatter.order : undefined
    const indexOrder = index ? fileOrder(index) : undefined
    nodes.push({
      kind: 'folder',
      label,
      path: child.path,
      order: indexOrder ?? Number.POSITIVE_INFINITY,
      children: applyChildOrder(buildNodes(child, pages), childOrder),
    })
  }

  return nodes
}

/**
 * Assembles the docs tree and resolves the entry doc.
 *
 * - Folders derive label/child-order from their optional `index.md` frontmatter,
 *   else humanized folder name with alphabetical children (explicit numeric
 *   order first).
 * - Per-file `title`/`order` frontmatter override a file's label/position.
 * - `entry` resolves: config `entry` → root `index.md` → first top-level doc → null.
 */
export function assembleDocsTree(
  pages: readonly DocPage[],
  options: AssembleTreeOptions = {},
): DocsModel {
  const pagesByPath: Record<string, DocPage> = {}
  for (const page of pages) {
    pagesByPath[page.path] = page
  }

  // A folder's index.md resolves to the folder path (not ".../index"), so the set
  // of folder paths is the set of route paths that are a strict prefix of another.
  const folderPaths = new Set<string>()
  for (const page of pages) {
    for (const other of pages) {
      if (other.path !== page.path && other.path.startsWith(page.path + '/')) {
        folderPaths.add(page.path)
        break
      }
    }
  }

  const root = newFolder('', '')
  const ensureFolder = (folderPath: string): FolderBuilder => {
    if (folderPath === '') {
      return root
    }
    const segments = folderPath.split('/')
    let current = root
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]!
      const path = segments.slice(0, i + 1).join('/')
      let next = current.folders.get(name)
      if (!next) {
        next = newFolder(path, name)
        current.folders.set(name, next)
      }
      current = next
    }
    return current
  }

  for (const page of pages) {
    const segments = page.path.split('/').filter(Boolean)
    const parentPath = segments.slice(0, -1).join('/')
    // A doc whose route path is itself a folder path is that folder's index.
    const owner = folderPaths.has(page.path) ? ensureFolder(page.path) : ensureFolder(parentPath)
    owner.docs.push(page)
  }

  const rootIndex = folderIndex('', pagesByPath)
  const rootChildOrder = Array.isArray(rootIndex?.frontmatter.order) ? rootIndex.frontmatter.order : undefined
  const tree = applyChildOrder(buildNodes(root, pagesByPath), rootChildOrder)

  const entry = resolveEntry(pages, pagesByPath, tree, options.entryConfig)

  return { tree, pages: pagesByPath, entry }
}

function resolveEntry(
  pages: readonly DocPage[],
  pagesByPath: Record<string, DocPage>,
  tree: readonly DocTreeNode[],
  entryConfig: string | undefined,
): string | null {
  if (entryConfig != null) {
    const normalized = entryConfig.replace(/\.md$/i, '').replace(/^\/+/, '')
    const routePath = normalized === 'index' ? '' : normalized
    if (pagesByPath[routePath]) {
      return routePath
    }
  }
  if (pagesByPath['']) {
    return ''
  }
  // First top-level doc node in tree order.
  const firstDoc = tree.find((n) => n.kind === 'doc')
  if (firstDoc) {
    return firstDoc.path
  }
  if (pages.length > 0) {
    return pages[0]!.path
  }
  return null
}
