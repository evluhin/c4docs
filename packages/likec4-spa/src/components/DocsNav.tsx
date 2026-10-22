// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { css } from '@likec4/styles/css'
import { Box, NavLink } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import type { DocTreeNode } from 'likec4:docs'
import { memo } from 'react'

export interface DocsNavProps {
  tree: readonly DocTreeNode[]
  /** route path of the currently open doc */
  currentPath: string
  /** project id for project-scoped routes; omit for single-project */
  projectId?: string | undefined
}

const navRoot = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: 'sm',
})

export const DocsNav = memo<DocsNavProps>(({ tree, currentPath, projectId }) => {
  return (
    <Box className={navRoot}>
      {tree.map((node) => (
        <DocsNavNode
          key={node.path + ':' + node.kind}
          node={node}
          currentPath={currentPath}
          projectId={projectId}
        />
      ))}
    </Box>
  )
})
DocsNav.displayName = 'DocsNav'

function DocsNavNode({
  node,
  currentPath,
  projectId,
}: {
  node: DocTreeNode
  currentPath: string
  projectId?: string | undefined
}) {
  if (node.kind === 'folder') {
    const active = currentPath === node.path || currentPath.startsWith(node.path + '/')
    return (
      <NavLink
        label={node.label}
        defaultOpened={active}
        childrenOffset={14}>
        {node.children?.map((child) => (
          <DocsNavNode
            key={child.path + ':' + child.kind}
            node={child}
            currentPath={currentPath}
            projectId={projectId}
          />
        ))}
      </NavLink>
    )
  }
  return <DocLink node={node} active={currentPath === node.path} projectId={projectId} />
}

function DocLink({
  node,
  active,
  projectId,
}: {
  node: DocTreeNode
  active: boolean
  projectId?: string | undefined
}) {
  const label = node.label
  if (projectId) {
    return (
      <NavLink
        active={active}
        label={label}
        renderRoot={(props) => (
          <Link
            to="/project/$projectId/docs/$/"
            params={{ projectId, _splat: node.path }}
            search
            {...props}
          />
        )}
      />
    )
  }
  return (
    <NavLink
      active={active}
      label={label}
      renderRoot={(props) => (
        <Link
          to="/docs/$/"
          params={{ _splat: node.path }}
          search
          {...props}
        />
      )}
    />
  )
}
