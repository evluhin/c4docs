// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DocsModel } from '@c4docs/likec4-core/types'
import JSON5 from 'json5'
import { logGenerating } from '../logger'
import { type ProjectVirtualModule, generateCombinedProjects, generateMatches } from './_shared'

const projectDocsCode = (docs: DocsModel) => `
import { atom } from '@c4docs/likec4/vite-plugin/internal'

export let $docs = atom(${JSON5.stringify(docs)})

if (import.meta.hot) {
  import.meta.hot.accept(md => {
    if (!import.meta.hot.data.$docs) {
      import.meta.hot.data.$docs = $docs
    }
    const update = md.$docs?.get()
    if (update) {
      import.meta.hot.data.$docs.set(update)
    } else {
      import.meta.hot.invalidate()
    }
  })
}
`

export const projectDocsModule: ProjectVirtualModule = {
  ...generateMatches('docs'),
  async load({ likec4, project }) {
    logGenerating('docs', project.id)
    const docs = await likec4.docsModel(project.id)
    return {
      code: projectDocsCode(docs),
      moduleType: 'js',
    }
  },
}

export const docsModule = generateCombinedProjects('docs', 'loadDocs')
