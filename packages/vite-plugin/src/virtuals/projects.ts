// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { LikeC4ProjectConfig, RelationshipBrowserScope, WebappExportFormat } from '@c4docs/likec4-config'
import type { NonEmptyArray } from '@c4docs/likec4-core'
import JSON5 from 'json5'
import { map } from 'remeda'
import { logGenerating } from '../logger'
import type { VirtualModule } from './_shared'
import { effectiveWebappExportFormats } from './export-formats'

type ProjectData = {
  id: string
  title: string | undefined
  path: string
  landingPage: LikeC4ProjectConfig['landingPage']
  relationshipBrowserDefaultScope: RelationshipBrowserScope
  exportFormats: WebappExportFormat[]
  /** Whether this project opts in to docs as the default landing page */
  docsLanding: boolean
}

const code = (projects: NonEmptyArray<ProjectData>) => `
import { atom, useStore } from '@c4docs/likec4/vite-plugin/internal'

export const isSingleProject = ${projects.length === 1};
export const projects = ${JSON5.stringify(projects, null, 2)};

export const $projects = atom([...projects])

export function useLikeC4Projects() {
  return useStore($projects)
}

if (import.meta.hot) {
  import.meta.hot.accept(md => {
    if (!import.meta.hot.data.$projects) {
      import.meta.hot.data.$projects = $projects
    }
    if (!import.meta.hot.data.projects) {
      import.meta.hot.data.projects = projects
    }      
    const update = md.projects
    if (update) {
      import.meta.hot.data.projects.length = 0
      import.meta.hot.data.projects.push(...update)
      import.meta.hot.data.$projects.set(update)
    } else {
      import.meta.hot.invalidate()
    }
  })
}
`

export const projectsModule = {
  id: 'likec4:projects',
  virtualId: 'likec4:plugin/projects.js',
  async load({ projects }) {
    logGenerating('projects')
    return {
      code: code(map(projects, p => ({
        id: p.id,
        title: p.title,
        path: p.path,
        landingPage: p.config.landingPage,
        relationshipBrowserDefaultScope: p.config.webapp?.relationshipsBrowser?.defaultScope ?? 'view',
        exportFormats: effectiveWebappExportFormats(p.config),
        docsLanding: p.config.docs?.landing === true,
      }))),
      moduleType: 'js',
    }
  },
} satisfies VirtualModule
