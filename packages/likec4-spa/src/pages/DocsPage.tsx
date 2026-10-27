// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { Fqn } from '@c4docs/likec4-core'
import type { OnInitialized } from '@c4docs/likec4-diagram'
import { css } from '@c4docs/likec4-styles/css'
import {
  Alert,
  AppShell,
  Box,
  Burger,
  Button,
  Group,
  ScrollArea,
  Text,
  useComputedColorScheme,
} from '@mantine/core'
import { useDisclosure, useDocumentTitle } from '@mantine/hooks'
import { useStore } from '@nanostores/react'
import { IconHierarchy2 } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { basepath, pageTitle } from 'likec4:app-config'
import type { DocsModel } from 'likec4:docs'
import { LikeC4View } from 'likec4:react'
import type { Atom } from 'nanostores'
import type { MouseEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DocsNav } from '../components/DocsNav'
import { applyBaseToDocHtml } from './doc-html-base'
import type { EmbedResolution, EmbedViewProps } from './docs-embeds/embed'
import { resolveEmbed } from './docs-embeds/embed'
import { renderMermaid } from './docs-embeds/mermaid'

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

/**
 * Internal in-app route prefixes that the click interceptor routes through
 * TanStack Router. A pathname is internal when it equals one of these exactly
 * (e.g. `/docs`) or starts with one followed by a `/` (e.g. `/docs/architecture`).
 */
const INTERNAL_ROUTE_PREFIXES = ['/docs', '/view', '/project'] as const

/**
 * Resolves a clicked anchor to an in-app navigation target, or `null` when the
 * click must fall through to default browser behavior.
 *
 * The rewritten doc hrefs (produced during docs modeling and base-prefixed by
 * {@link applyBaseToDocHtml}) are plain root-absolute `<a>`, so a click would
 * otherwise trigger a full page reload. Returns `{ to, search }` only for
 * same-origin internal app routes (`/docs/...`, `/view/...`, `/project/<id>/...`);
 * external links, bare anchors, `target=_blank`, and `mailto:`/other schemes
 * return `null`.
 */
function resolveInternalDocNavigation(
  anchor: HTMLAnchorElement,
  basepath: string,
): { to: string; search: Record<string, string> } | null {
  if (anchor.target && anchor.target !== '_self') {
    return null
  }
  if (anchor.hasAttribute('download')) {
    return null
  }
  // `anchor.href` is the fully-resolved absolute URL; comparing origins filters
  // out external links and bare `#anchor` jumps (which keep the current path).
  if (anchor.origin !== window.location.origin) {
    return null
  }

  const base = basepath.endsWith('/') ? basepath.slice(0, -1) : basepath
  let pathname = anchor.pathname
  if (base !== '') {
    if (pathname === base) {
      pathname = '/'
    } else if (pathname.startsWith(base + '/')) {
      pathname = pathname.slice(base.length)
    } else {
      // Outside the configured base — not an in-app route.
      return null
    }
  }

  const isInternal = INTERNAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
  if (!isInternal) {
    return null
  }

  const search: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(anchor.search)) {
    search[key] = value
  }
  return { to: pathname, search }
}

/** A doc embed placeholder paired with its resolved hydration decision. */
interface EmbedPortal {
  node: HTMLElement
  resolution: EmbedResolution
}

export function DocsPage({ $docs, path, projectId }: DocsPageProps) {
  const docs = useStore($docs)
  const [opened, { toggle, close }] = useDisclosure()
  const page = docs.pages[path]
  const navigate = useNavigate()
  const colorScheme = useComputedColorScheme('light')

  const contentRef = useRef<HTMLDivElement | null>(null)
  const [embedPortals, setEmbedPortals] = useState<EmbedPortal[]>([])

  useDocumentTitle(page ? `${page.title} — ${pageTitle}` : pageTitle)

  // Intercept clicks on rewritten internal links so they navigate as SPA
  // transitions instead of full page reloads. Modifier/middle clicks,
  // target=_blank, downloads, external links, and bare #anchors fall through
  // to the browser.
  const onContentClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return
    }
    // Left click only; let the browser handle modified and non-primary clicks.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return
    }
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    if (!anchor) {
      return
    }
    const target = resolveInternalDocNavigation(anchor, basepath)
    if (!target) {
      return
    }
    event.preventDefault()
    navigate({ to: target.to, search: target.search }).catch(console.error)
  }, [navigate])

  // Hydrate the sanitizer-safe placeholders FEAT-001 emits into the doc HTML.
  // Placeholders are empty `<div>`s, so everything rendered into them is managed
  // by React portals — we never mutate a node we also portal into, which keeps
  // the top-level prose div (and its click interceptor) untouched.
  const refs = page?.refs
  const html = page?.html

  // Embeds depend only on the rendered DOM + refs, NOT on the color scheme: a
  // theme toggle re-renders the mounted LikeC4View in place rather than tearing
  // the portals down. Portals are cleared on cleanup so they unmount before the
  // host nodes are replaced (e.g. navigating to another doc).
  useEffect(() => {
    const container = contentRef.current
    if (!container) {
      setEmbedPortals([])
      return
    }
    const embedNodes = container.querySelectorAll<HTMLElement>('[data-likec4-view-embed]')
    const portals: EmbedPortal[] = []
    embedNodes.forEach((node) => {
      const index = Number.parseInt(node.getAttribute('data-likec4-view-embed') ?? '', 10)
      portals.push({ node, resolution: resolveEmbed(refs ?? [], index) })
    })
    setEmbedPortals(portals)
    return () => setEmbedPortals([])
  }, [html, refs])

  // Mermaid blocks are never portaled, so rendering their SVG via innerHTML is
  // safe. Re-runs when the computed color scheme changes so diagrams re-theme.
  useEffect(() => {
    const container = contentRef.current
    if (!container) {
      return
    }
    let cancelled = false
    const mermaidNodes = [...container.querySelectorAll<HTMLElement>('[data-mermaid]')]
    const slug = path.replace(/[^\w-]/g, '_')
    // Render blocks sequentially: mermaid relies on global state + a shared DOM
    // id while rendering, so concurrent renders on the same page race.
    void (async () => {
      for (let i = 0; i < mermaidNodes.length; i++) {
        const node = mermaidNodes[i]!
        const source = node.textContent ?? ''
        if (source.trim() === '') {
          continue
        }
        try {
          const svg = await renderMermaid(`docs-mermaid-${slug}-${i}`, source, colorScheme)
          if (cancelled) return
          node.innerHTML = svg
        } catch {
          if (cancelled) return
          node.replaceChildren(inlineNotice('Failed to render Mermaid diagram'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [html, path, colorScheme])

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
          <DiagramsButton projectId={projectId} />
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
              <div
                ref={contentRef}
                className={prose}
                onClick={onContentClick}
                dangerouslySetInnerHTML={{ __html: applyBaseToDocHtml(page.html, basepath) }}
              />
            )
            : <DocNotFound path={path} />}
          {embedPortals.map(({ node, resolution }, i) => {
            const content = <EmbedContent resolution={resolution} />
            return createPortal(content, node, `embed-${path}-${i}`)
          })}
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}

const inlineNoticeClass = css({
  borderWidth: '[1px]',
  borderStyle: 'solid',
  borderColor: '[var(--mantine-color-orange-outline)]',
  borderRadius: 'sm',
  paddingInline: 'sm',
  paddingBlock: 'xs',
  marginBlock: 'xs',
  fontSize: '[0.85rem]',
  color: '[var(--mantine-color-orange-text)]',
  backgroundColor: '[var(--mantine-color-orange-light)]',
})

/**
 * Builds a non-fatal inline notice as a detached DOM node, used by the mermaid
 * hydration path which renders into placeholder nodes directly (not via React).
 */
function inlineNotice(message: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('role', 'note')
  el.className = inlineNoticeClass
  el.textContent = message
  return el
}

/** Renders an embed placeholder's content: either the view or a notice. */
function EmbedContent({ resolution }: { resolution: EmbedResolution }) {
  if (resolution.kind === 'notice') {
    return <InlineNotice message={resolution.message} />
  }
  return <EmbeddedView props={resolution.props} />
}

/** Non-fatal inline notice rendered into an embed placeholder via a portal. */
function InlineNotice({ message }: { message: string }) {
  return <div role="note" className={inlineNoticeClass}>{message}</div>
}

/**
 * The interactive LikeC4View mounted into an embed placeholder.
 *
 * `focus` has no corresponding LikeC4View prop; it is applied through the
 * diagram runtime once initialized. We use the `onInitialized` callback (which
 * hands us the owning diagram's {@link DiagramApi}) rather than a hook, so focus
 * works regardless of which `@c4docs/likec4-diagram` module instance owns the embedded
 * view — the hooks exported from this app bind to a different instance.
 */
function EmbeddedView({ props }: { props: EmbedViewProps }) {
  const focus = props.focus
  const onInitialized: OnInitialized | undefined = focus
    ? ({ diagram }) => {
      try {
        diagram.focusOnElement(focus as Fqn)
      } catch (error) {
        console.error('focusOnElement failed:', error)
      }
    }
    : undefined
  return (
    <LikeC4View
      viewId={props.viewId}
      {...props.colorScheme && { colorScheme: props.colorScheme }}
      {...props.dynamicViewVariant && { dynamicViewVariant: props.dynamicViewVariant }}
      {...props.fitViewPadding !== undefined && { fitViewPadding: props.fitViewPadding }}
      {
        // `onInitialized` is not declared on LikeC4ViewProps but is forwarded to the
        // underlying LikeC4Diagram, which gives us the owning diagram's API.
        ...onInitialized && ({ onInitialized } as { onInitialized: OnInitialized })
      }
    />
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

function DiagramsButton({ projectId }: { projectId?: string | undefined }) {
  return (
    <Button
      size="xs"
      variant="subtle"
      color="dimmed"
      leftSection={<IconHierarchy2 size={14} />}
      renderRoot={(props) =>
        projectId
          ? <Link to="/project/$projectId/view/$viewId/" params={{ projectId, viewId: 'index' }} {...props} />
          : <Link to="/view/$viewId/" params={{ viewId: 'index' }} {...props} />}>
      Diagrams
    </Button>
  )
}
