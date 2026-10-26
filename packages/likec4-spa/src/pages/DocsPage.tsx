// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { css } from '@likec4/styles/css'
import {
  Alert,
  AppShell,
  Box,
  Burger,
  Button,
  Group,
  ScrollArea,
  Text,
} from '@mantine/core'
import { useDisclosure, useDocumentTitle } from '@mantine/hooks'
import { useStore } from '@nanostores/react'
import { IconHierarchy2 } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { basepath, pageTitle } from 'likec4:app-config'
import type { DocsModel } from 'likec4:docs'
import type { Atom } from 'nanostores'
import { DocsNav } from '../components/DocsNav'
import { applyBaseToDocHtml } from './doc-html-base'

export interface DocsPageProps {
  $docs: Atom<DocsModel>
  /** route path of the doc to render */
  path: string
  /** project id for project-scoped routes; omit for single-project */
  projectId?: string | undefined
}

// Light, Backstage-like reading surface. Uses Mantine's body color CSS variable so it
// follows light/dark but renders a bright background rather than the dark app chrome.
const docsShell = css({
  '& .mantine-AppShell-main': {
    backgroundColor: '[var(--mantine-color-body)]',
  },
  '& .mantine-AppShell-navbar': {
    backgroundColor: '[var(--mantine-color-body)]',
    borderInlineEndColor: '[var(--mantine-color-default-border)]',
  },
  '& .mantine-AppShell-header': {
    backgroundColor: '[var(--mantine-color-body)]',
    borderBottomColor: '[var(--mantine-color-default-border)]',
  },
})

const contentContainer = css({
  maxWidth: '[820px]',
  marginInline: 'auto',
  paddingInline: 'md',
  paddingBlock: 'sm',
})

const prose = css({
  lineHeight: '[1.55]',
  fontSize: '[0.9375rem]',
  '& h1, & h2, & h3, & h4': {
    fontWeight: '[600]',
    lineHeight: '[1.25]',
    marginTop: 'md',
    marginBottom: 'xs',
  },
  '& h1': { fontSize: '[1.7rem]', marginTop: '0' },
  '& h2': { fontSize: '[1.35rem]' },
  '& h3': { fontSize: '[1.15rem]' },
  '& p, & ul, & ol, & blockquote, & pre, & table': {
    marginBottom: 'sm',
  },
  '& ul, & ol': {
    paddingLeft: 'lg',
  },
  '& li': {
    marginBottom: '[2px]',
  },
  '& a': {
    textDecoration: 'underline',
  },
  '& code': {
    fontFamily: '[monospace]',
    fontSize: '[0.9em]',
  },
  '& pre': {
    overflowX: 'auto',
    padding: 'md',
    borderRadius: 'sm',
    backgroundColor: 'likec4.panel.bg',
  },
  '& img': {
    maxWidth: '[100%]',
  },
  '& blockquote': {
    borderLeftWidth: '[3px]',
    borderLeftStyle: 'solid',
    paddingLeft: 'md',
    opacity: '[0.8]',
  },
})

export function DocsPage({ $docs, path, projectId }: DocsPageProps) {
  const docs = useStore($docs)
  const [opened, { toggle, close }] = useDisclosure()
  const page = docs.pages[path]

  useDocumentTitle(page ? `${page.title} — ${pageTitle}` : pageTitle)

  return (
    <AppShell
      className={docsShell}
      header={{ height: 44 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle docs navigation" />
          <Text fw={600} size="sm">Documentation</Text>
          <Button
            component={Link}
            to={projectId ? '/project/$projectId/view/$viewId/' : '/view/$viewId/'}
            {...(projectId ? { params: { projectId, viewId: 'index' } } : { params: { viewId: 'index' } })}
            size="xs"
            variant="subtle"
            color="dimmed"
            leftSection={<IconHierarchy2 size={14} />}>
            Diagrams
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        <ScrollArea type="hover" onClick={close}>
          <DocsNav tree={docs.tree} currentPath={path} projectId={projectId} />
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Box className={contentContainer}>
          {page
            ? (
              // HTML is sanitized server-side by markdownToHtml (rehype-sanitize);
              // applyBaseToDocHtml only prefixes the already-safe root-absolute doc URLs.
              <div className={prose} dangerouslySetInnerHTML={{ __html: applyBaseToDocHtml(page.html, basepath) }} />
            )
            : <DocNotFound path={path} />}
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}

function DocNotFound({ path }: { path: string }) {
  return (
    <Alert variant="light" color="orange" title="Document not found">
      <Text fz="md">
        The document <Text span fw={600}>{path || '/'}</Text> does not exist.
      </Text>
      <Button component={Link} to="/" search variant="light" color="orange" mt="lg" size="xs">
        Go to overview
      </Button>
    </Alert>
  )
}
