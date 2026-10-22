// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

export {
  discoverDocs,
  type DiscoveredDoc,
  docRoutePath,
  type DocsDiscoveryDiagnostic,
  type DocsDiscoveryResult,
} from './discovery'
export { DefaultLikeC4Docs } from './LikeC4Docs'
export {
  deriveTitle,
  humanizeTitle,
  modelDocFile,
  type ModelDocInput,
  splitFrontmatter,
} from './model-doc'
export { assembleDocsTree, type AssembleTreeOptions } from './tree'
