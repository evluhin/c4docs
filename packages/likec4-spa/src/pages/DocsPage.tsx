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

const contentContainer = css({
  maxWidth: '[820px]',
  marginInline: 'auto',
  padding: 'lg',
})

const prose = css({
  lineHeight: '[1.6]',
  '& h1, & h2, & h3, & h4': {
    fontWeight: '[600]',
    lineHeight: '[1.25]',
    marginTop: 'lg',
    marginBottom: 'sm',
  },
  '& h1': { fontSize: '[1.9rem]' },
  '& h2': { fontSize: '[1.5rem]' },
  '& h3': { fontSize: '[1.25rem]' },
  '& p, & ul, & ol, & blockquote, & pre, & table': {
    marginBottom: 'md',
  },
  '& ul, & ol': {
    paddingLeft: 'lg',
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
      header={{ height: 48 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle docs navigation" />
          <Button component={Link} to="/" search size="xs" variant="subtle" color="dimmed">
            Overview
          </Button>
          <Text fw={600} size="sm">Documentation</Text>
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
