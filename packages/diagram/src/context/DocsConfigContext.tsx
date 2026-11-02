// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { type PropsWithChildren, createContext, useContext } from 'react'

/**
 * Ambient docs configuration for the diagram UI.
 *
 * `docsDir` is the project's configured docs directory (default `docs`). It is
 * the only piece of docs config the diagram needs: an element/view's
 * associated-document `link` stores a project-root-relative `.md` path that
 * includes this dir, and the `/docs/<route>/` route key is relative to it. The
 * data-wiring layer (`@c4docs/likec4-spa`) supplies it; when absent, the diagram
 * renders document links as plain relative URLs (prior behavior).
 */
export interface DocsConfig {
  /** Configured docs directory, relative to the project root. */
  docsDir: string
}

const DocsConfigContext = createContext<DocsConfig | null>(null)

export function DocsConfigProvider(
  { value, children }: PropsWithChildren<{ value: DocsConfig | null | undefined }>,
) {
  return (
    <DocsConfigContext.Provider value={value ?? null}>
      {children}
    </DocsConfigContext.Provider>
  )
}

/** Returns the ambient {@link DocsConfig}, or `null` when docs are not configured. */
export function useDocsConfig(): DocsConfig | null {
  return useContext(DocsConfigContext)
}
