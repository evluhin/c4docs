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
  // Subtle sticky header: a translucent body wash + backdrop blur keeps it
  // readable over scrolling content in both themes without a heavy bar.
  '& .mantine-AppShell-header': {
    backgroundColor: '[color-mix(in srgb, var(--mantine-color-body) 80%, transparent)]',
    borderBottomColor: '[var(--mantine-color-default-border)]',
    backdropFilter: '[saturate(180%) blur(8px)]',
  },
})

// Breakout container: caps the overall reading column at ~960px while the prose
// recipe constrains the TEXT measure to ~68ch (item 1). Wide blocks (tables,
// code, images, embeds) break out to the full container width.
const contentContainer = css({
  maxWidth: '[1100px]',
  marginInline: 'auto',
  paddingInline: 'lg',
  paddingBlock: 'xl',
})

const prose = css({
  fontSize: '[1rem]',
  lineHeight: '[1.65]',
  color: '[var(--mantine-color-text)]',

  // Vertical rhythm: uniform spacing between flow blocks (owl selector); the
  // first block never adds a top margin.
  '& > * + *': { marginTop: 'md' },
  '& > *:first-child': { marginTop: '0' },

  // Width: text and wide blocks share the FULL content-column width (no narrow
  // ch-based measure cap), so headings, paragraphs, tables, code, and diagrams
  // all align to the same left and right edges — one consistent column (the
  // Backstage/MkDocs look). The reading width is governed by `contentContainer`
  // (maxWidth above), not a per-block ch cap. Left-aligned, no per-block centering.
  '& > *': {
    maxWidth: '[100%]',
    marginInline: '0',
  },

  // Heading hierarchy: clear size contrast, semibold, more space above than
  // below, subtle h2 rule, scroll-margin so anchors clear the sticky header.
  '& :is(h1, h2, h3, h4)': {
    fontWeight: '[600]',
    lineHeight: '[1.25]',
    color: '[var(--mantine-color-text)]',
    marginTop: '8',
    marginBottom: '3',
    scrollMarginTop: '[60px]',
  },
  '& h1': { fontSize: '[2rem]', marginTop: '0' },
  '& h2': {
    fontSize: '[1.5rem]',
    paddingBottom: '2',
    borderBottom: 'subtle',
  },
  '& h3': { fontSize: '[1.25rem]' },
  '& h4': { fontSize: '[1.05rem]' },

  // Links: accent color, underline only on hover (not every link raw-underlined).
  '& a': {
    color: 'text.link',
    textDecoration: 'none',
    textUnderlineOffset: '[2px]',
    _hover: { textDecoration: 'underline' },
  },

  // Lists: comfortable indentation + item spacing; readable nesting.
  '& ul, & ol': { paddingLeft: '6' },
  '& li': { marginBottom: '1' },
  '& li > ul, & li > ol': { marginTop: '1', marginBottom: '0' },

  // Inline code (not inside <pre>): subtle chip.
  '& :not(pre) > code': {
    fontFamily: '[var(--mantine-font-family-monospace)]',
    fontSize: '[0.875em]',
    backgroundColor: 'surface.code',
    paddingInline: '1.5',
    paddingBlock: '0.5',
    borderRadius: 'sm',
    border: 'subtle',
  },

  // Code blocks: soft bordered box with horizontal scroll; reset inner <code>
  // so it does not inherit the inline-code chrome. Prism owns token colors.
  '& pre': {
    backgroundColor: 'surface.code',
    border: 'subtle',
    borderRadius: 'md',
    padding: 'md',
    overflowX: 'auto',
    fontSize: '[0.875rem]',
    lineHeight: '[1.5]',
  },
  '& pre code': {
    background: 'transparent',
    border: 'none',
    padding: '0',
    fontSize: '[inherit]',
  },

  // Tables (docs are table-heavy): full-width, header shading, zebra striping,
  // rounded outer corners (border-separate keeps the radius clean).
  '& table': {
    width: '[100%]',
    borderCollapse: 'separate',
    borderSpacing: '[0]',
    fontSize: '[0.9375rem]',
    border: 'subtle',
    borderRadius: 'md',
    overflow: 'hidden',
  },
  '& thead': {
    backgroundColor: 'surface.sunken',
  },
  '& th': {
    textAlign: 'left',
    fontWeight: '[600]',
    padding: '[8px 12px]',
    borderBottom: 'default',
  },
  '& td': {
    padding: '[8px 12px]',
    borderTop: 'subtle',
  },
  '& tbody tr:nth-child(even)': {
    backgroundColor: 'surface.sunken',
  },

  // Plain blockquotes (no [!...] alert class): left accent bar + muted wash.
  '& blockquote': {
    borderLeftWidth: 'extra',
    borderLeftStyle: 'solid',
    borderLeftColor: 'border.default',
    paddingLeft: 'md',
    paddingBlock: '2',
    backgroundColor: 'surface.sunken',
    borderRadius: 'sm',
    color: 'text.dimmed',
  },
  '& blockquote > *:first-child': { marginTop: '0' },
  '& blockquote > *:last-child': { marginBottom: '0' },

  // Images: contained, rounded, subtle lift, centered with breathing room.
  '& img': {
    maxWidth: '[100%]',
    height: 'auto',
    display: 'block',
    marginInline: 'auto',
    marginBlock: '4',
    borderRadius: 'md',
    border: 'subtle',
    boxShadow: 'xs',
  },
  // Live diagram embeds / mermaid manage their own chrome — just give them room.
  '& [data-likec4-view-embed], & [data-mermaid]': {
    marginBlock: '6',
    overflow: 'auto',
  },
  // Clamp the injected child <svg> (mermaid output / error graphic) the same way
  // `& img` is clamped, so an oversized diagram cannot overflow into the nav gutter.
  '& [data-likec4-view-embed] svg, & [data-mermaid] svg': {
    maxWidth: '[100%]',
    height: 'auto',
  },

  // GitHub alert callouts (<div class="markdown-alert markdown-alert-*">).
  // Colored left border + tinted bg + title color per type; octicon follows
  // the title color via currentColor. Mantine color-scale vars keep both
  // themes legible.
  '& .markdown-alert': {
    borderRadius: 'md',
    padding: 'md',
    borderLeftWidth: 'extra',
    borderLeftStyle: 'solid',
  },
  '& .markdown-alert > *:first-child': { marginTop: '0' },
  '& .markdown-alert > *:last-child': { marginBottom: '0' },
  '& .markdown-alert-title': {
    display: 'flex',
    alignItems: 'center',
    gap: '2',
    fontWeight: '[600]',
    marginTop: '0',
    marginBottom: '2',
  },
  '& .markdown-alert-title svg': {
    width: '[16px]',
    height: '[16px]',
    fill: 'currentColor',
  },
  '& .markdown-alert-note': {
    borderLeftColor: '[var(--mantine-color-blue-filled)]',
    backgroundColor: '[var(--mantine-color-blue-light)]',
  },
  '& .markdown-alert-note .markdown-alert-title': {
    color: '[var(--mantine-color-blue-text)]',
  },
  '& .markdown-alert-tip': {
    borderLeftColor: '[var(--mantine-color-green-filled)]',
    backgroundColor: '[var(--mantine-color-green-light)]',
  },
  '& .markdown-alert-tip .markdown-alert-title': {
    color: '[var(--mantine-color-green-text)]',
  },
  '& .markdown-alert-important': {
    borderLeftColor: '[var(--mantine-color-violet-filled)]',
    backgroundColor: '[var(--mantine-color-violet-light)]',
  },
  '& .markdown-alert-important .markdown-alert-title': {
    color: '[var(--mantine-color-violet-text)]',
  },
  '& .markdown-alert-warning': {
    borderLeftColor: '[var(--mantine-color-yellow-filled)]',
    backgroundColor: '[var(--mantine-color-yellow-light)]',
  },
  '& .markdown-alert-warning .markdown-alert-title': {
    color: '[var(--mantine-color-yellow-text)]',
  },
  '& .markdown-alert-caution': {
    borderLeftColor: '[var(--mantine-color-red-filled)]',
    backgroundColor: '[var(--mantine-color-red-light)]',
  },
  '& .markdown-alert-caution .markdown-alert-title': {
    color: '[var(--mantine-color-red-text)]',
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
        // The raw mermaid source is carried base64-encoded on `data-mermaid-src`
        // (see extractMermaidBlocks): a single-line attribute survives markdown
        // without having its indented lines re-parsed as an indented code block.
        // Fall back to textContent for safety, but the attribute is canonical.
        const source = decodeMermaidSource(node)
        if (source.trim() === '') {
          continue
        }
        const renderId = `docs-mermaid-${slug}-${i}`
        try {
          const svg = await renderMermaid(renderId, source, colorScheme)
          if (cancelled) return
          node.innerHTML = svg
        } catch {
          if (cancelled) return
          node.replaceChildren(inlineNotice('Failed to render Mermaid diagram'))
          // On a parse error mermaid leaves its error graphic as an orphan
          // `<div id="d{renderId}">` attached to <body>, which otherwise floats
          // over the nav gutter. Remove it; the inline notice above is the UI.
          document.getElementById(`d${renderId}`)?.remove()
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
 * Recovers the raw mermaid source carried on a `[data-mermaid]` placeholder.
 *
 * The docs modeling pass base64-encodes the source onto `data-mermaid-src` so
 * markdown cannot split indented mermaid lines into a separate code block. We
 * base64-decode it here (UTF-8 safe via `atob` + `TextDecoder`). Falls
 * back to `textContent` for resilience against any legacy/un-encoded placeholder.
 */
function decodeMermaidSource(node: HTMLElement): string {
  const encoded = node.getAttribute('data-mermaid-src')
  if (encoded) {
    try {
      // atob yields a binary (Latin1) string; reinterpret the bytes as UTF-8 so
      // non-ASCII diagram labels round-trip exactly.
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    } catch {
      // Malformed payload: fall through to textContent below.
    }
  }
  return node.textContent ?? ''
}

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
