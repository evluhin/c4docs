// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Renders a Mermaid diagram to an SVG string.
 *
 * `mermaid` is reached ONLY through a dynamic `import()` so Vite emits it as its
 * own async chunk and keeps it out of the SPA main bundle (CDN is avoided so the
 * static build stays offline-friendly).
 *
 * @param id unique id for this render (mermaid requires a unique element id)
 * @param source raw mermaid source
 * @param theme current color scheme, mapped to a mermaid built-in theme
 * @returns the rendered SVG markup
 */
export async function renderMermaid(id: string, source: string, theme: 'light' | 'dark'): Promise<string> {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    // `loose` + htmlLabels matches how GitHub and VS Code render mermaid, so
    // diagrams that use `<br/>` HTML labels (common in these docs) render the
    // same way here. The source is already sanitized upstream by rehype-sanitize.
    securityLevel: 'loose',
    flowchart: { htmlLabels: true },
  })
  const { svg } = await mermaid.render(id, source)
  return svg
}
