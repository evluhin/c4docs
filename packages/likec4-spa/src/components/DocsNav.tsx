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
  // A small gap separates items so each reads as its own clickable row, not a
  // wall of text. Wrapped lines stay tight *inside* a row (line-height below).
  gap: '[2px]',
  paddingBlock: '2',
  paddingInline: '2',
  '& .mantine-NavLink-root': {
    // Comfortable click target per item, clearly separated from neighbours.
    paddingBlock: '[6px]',
    paddingInline: '[10px]',
    borderRadius: 'sm',
    minHeight: 'unset',
    transition: 'background-color 100ms ease',
    _hover: {
      backgroundColor: '[var(--mantine-color-default-hover)]',
    },
    // Active item: tinted background + left accent bar, like a docs sidebar.
    '&[data-active]': {
      backgroundColor: '[var(--mantine-primary-color-light)]',
      boxShadow: '[inset 3px 0 0 0 var(--mantine-primary-color-filled)]',
    },
    '&[data-active] .mantine-NavLink-label': {
      fontWeight: '[600]',
      color: '[var(--mantine-color-text)]',
    },
  },
  '& .mantine-NavLink-label': {
    fontSize: '[0.8125rem]',
    lineHeight: '[1.25]',
    color: '[var(--mantine-color-text)]',
  },
  '& .mantine-NavLink-children': {
    marginTop: '[2px]',
  },
})

// Folder rows read as section headers: slightly muted, uppercase-ish tracking.
const folderNode = css({
  '& > .mantine-NavLink-label': {
    fontWeight: '[600]',
    fontSize: '[0.75rem]',
    letterSpacing: '[0.02em]',
    color: '[var(--mantine-color-dimmed)]',
  },
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
        className={folderNode}
        label={node.label}
        defaultOpened={active}
        childrenOffset={12}>
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
