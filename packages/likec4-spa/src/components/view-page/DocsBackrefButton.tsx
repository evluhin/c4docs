// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { Button, Menu, MenuDropdown, MenuItem, MenuLabel, MenuTarget } from '@mantine/core'
import { useStore } from '@nanostores/react'
import { IconFileText } from '@tabler/icons-react'
import { Link, useMatches } from '@tanstack/react-router'
import type { DocsModel } from 'likec4:docs'
import { loadDocs } from 'likec4:docs'
import type { Atom } from 'nanostores'
import { useEffect, useMemo, useState } from 'react'
import { useCurrentProject, useCurrentViewId } from '../../hooks'
import { buildDocsByViewId } from '../../pages/docs-backrefs'

/**
 * "Referenced in docs" affordance for the diagram page header.
 *
 * Computes a viewId → docs reverse index client-side from the project's
 * `likec4:docs` atom (no backend) and, when the current view is referenced by
 * one or more docs, renders a compact menu linking to each referencing doc.
 * Renders nothing for non-docs projects, before the docs atom loads, or when no
 * doc references the current view.
 */
export function DocsBackrefButton({ isTablet }: { isTablet: boolean }) {
  const project = useCurrentProject()
  // Only projects that opt into docs can have back-references.
  if (!project.docsLanding) {
    return null
  }
  return <DocsBackrefButtonLoader projectId={project.id} isTablet={isTablet} />
}

function DocsBackrefButtonLoader({ projectId, isTablet }: { projectId: string; isTablet: boolean }) {
  const [$docs, set$docs] = useState<Atom<DocsModel> | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadDocs(projectId)
      .then(({ $docs }) => {
        if (!cancelled) {
          set$docs($docs)
        }
      })
      .catch((error) => {
        console.error('Failed to load docs for back-references:', error)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!$docs) {
    return null
  }
  return <DocsBackrefMenu $docs={$docs} projectId={projectId} isTablet={isTablet} />
}

function DocsBackrefMenu(
  { $docs, projectId, isTablet }: { $docs: Atom<DocsModel>; projectId: string; isTablet: boolean },
) {
  const docs = useStore($docs)
  const viewId = useCurrentViewId()
  const isInsideProject = useMatches({
    select: matches => matches.some(({ routeId }) => routeId === '/project/$projectId'),
  })

  // Reactive to HMR via useStore($docs); recompute only when the model changes.
  const backrefs = useMemo(() => buildDocsByViewId(docs).get(viewId) ?? [], [docs, viewId])

  if (backrefs.length === 0) {
    return null
  }

  return (
    <Menu shadow="md" width={240} trigger="click-hover" openDelay={300}>
      <MenuTarget>
        <Button
          size={isTablet ? 'compact-md' : 'xs'}
          fz={isTablet ? 'sm' : 'xs'}
          variant="subtle"
          color="gray"
          leftSection={<IconFileText size={14} />}>
          Referenced in docs
        </Button>
      </MenuTarget>
      <MenuDropdown>
        <MenuLabel>Referenced in docs</MenuLabel>
        {backrefs.map((doc) => (
          <MenuItem
            key={doc.path}
            renderRoot={(props) =>
              isInsideProject
                ? (
                  <Link
                    to="/project/$projectId/docs/$"
                    params={{ projectId, _splat: doc.path }}
                    {...props} />
                )
                : <Link to="/docs/$" params={{ _splat: doc.path }} {...props} />}>
            {doc.title}
          </MenuItem>
        ))}
      </MenuDropdown>
    </Menu>
  )
}
