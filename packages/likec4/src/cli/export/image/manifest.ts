// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { writeFile } from 'node:fs/promises'

/**
 * Maps every referenced view (keyed by {@link manifestKey}) to the path of its
 * rendered image. The path is relative to the manifest's output directory and
 * uses forward slashes so it is portable across platforms and consumable by
 * external docs systems.
 *
 * Consumers should look images up through this mapping and must not parse the
 * hash out of the file name; the hash is an implementation detail.
 */
export type ImageManifest = Record<string, string>

/** A single rendered image entry used to build an {@link ImageManifest}. */
export interface ImageManifestEntry {
  /** manifest key from {@link manifestKey} */
  key: string
  /** image path relative to the output directory, forward-slashed */
  imagePath: string
}

/**
 * The manifest key for a referenced view. The default diagram variant is keyed
 * by its bare view id; the sequence variant is suffixed with `#sequence` so a
 * view referenced both ways occupies two distinct keys.
 */
export function manifestKey(viewId: string, variant?: 'sequence'): string {
  return variant ? `${viewId}#${variant}` : viewId
}

/**
 * Builds an {@link ImageManifest} from rendered entries. Entries are sorted by
 * key so the serialized manifest is deterministic regardless of render order.
 *
 * Pure: no I/O.
 */
export function buildImageManifest(entries: readonly ImageManifestEntry[]): ImageManifest {
  const manifest: ImageManifest = {}
  for (const { key, imagePath } of [...entries].sort((a, b) => a.key.localeCompare(b.key))) {
    manifest[key] = imagePath
  }
  return manifest
}

/** Writes the manifest as pretty-printed JSON (trailing newline) to `outfile`. */
export async function writeImageManifest(outfile: string, manifest: ImageManifest): Promise<void> {
  await writeFile(outfile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}
