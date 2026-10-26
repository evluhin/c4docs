// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramView } from '@likec4/core'
import { objectHash } from '@likec4/core/utils'

/** Length of the short hex digest embedded into image file names. */
const HASH_LENGTH = 8

/**
 * Computes a short, stable hash over the view's layouted-model input — the
 * deterministic structural description the renderer consumes — optionally
 * salted with the dynamic `variant` discriminator so the diagram and sequence
 * variants of one view hash differently.
 *
 * Hashing the model input (not the rendered SVG bytes) is intentional: the
 * rendered SVG carries run-varying generated class names and CSS-variable
 * ordering, so byte hashes are not stable across runs, whereas the layouted
 * view object is deterministic. A real diagram change (DSL/layout) still changes
 * the model and therefore the hash, preserving cache-busting.
 *
 * `objectHash` serializes with stable key ordering, so repeated runs over an
 * unchanged view yield the identical digest.
 *
 * Pure: depends only on its arguments, no I/O.
 */
export function viewContentHash(view: DiagramView, variant?: 'sequence'): string {
  return objectHash({ variant: variant ?? 'diagram', view }).slice(0, HASH_LENGTH)
}

/**
 * Turns a view id into a file-name-safe slug: lowercases, replaces any run of
 * non-alphanumeric characters with a single `-`, and trims leading/trailing `-`.
 */
export function slug(viewId: string): string {
  const s = viewId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s === '' ? 'view' : s
}

/**
 * Builds a content-addressed file name `${slug(viewId)}[.${variant}].${hash}.${ext}`.
 * The same view and variant produce the identical name across runs (stable
 * paths), while a changed view produces a new name (cache-busting).
 *
 * @param hash - a digest from {@link viewContentHash}.
 * @param ext - file extension without a leading dot, e.g. `svg`.
 * @param variant - dynamic variant discriminator, included in the name when `sequence`.
 */
export function imageFileName(viewId: string, hash: string, ext: string, variant?: 'sequence'): string {
  const parts = variant ? [slug(viewId), variant, hash, ext] : [slug(viewId), hash, ext]
  return parts.join('.')
}
