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
  const { svg } = await mermaid.render(id, escapeSequenceMessageSemicolons(source))
  return svg
}

/**
 * In a `sequenceDiagram`, mermaid's grammar treats a bare `;` as a statement
 * separator (equivalent to a newline). A `;` written inside message or note
 * text therefore splits the line and the trailing fragment is parsed as an
 * invalid statement, so the whole diagram fails with a parse error — even
 * though the same source renders in other viewers that escape it first.
 *
 * We replace each unescaped `;` in the label portion of message and note lines
 * with the `&#59;` HTML entity, which mermaid's htmlLabels rendering shows as a
 * literal `;`. Only the text after the message arrow's `:` (or after a note's
 * `:`) is touched, so structural lines, `rect`/`alt`/`end` keywords, and
 * participant declarations are left byte-for-byte unchanged. Diagrams that are
 * not `sequenceDiagram` are returned untouched.
 */
export function escapeSequenceMessageSemicolons(source: string): string {
  // The diagram type is the first non-empty, non-directive line.
  const firstMeaningful = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('%%'))
  if (firstMeaningful === undefined || !/^sequenceDiagram\b/.test(firstMeaningful)) {
    return source
  }

  // A message line: `A->>B: text`, `A-->>B: text`, `A-)B: text`, etc. The arrow
  // forms mermaid accepts, kept loose on purpose — the colon anchors the label.
  const messageLine = /^(\s*[^:\n]*?(?:--?>>?|--?[)x]|<<-->>|<<->>|->|-->>?)[^:\n]*?:\s*)(.*)$/
  // A note line carries its text after the first `:` as well.
  const noteLine = /^(\s*note\s+[^:\n]*?:\s*)(.*)$/i

  const escapeLabel = (label: string): string => label.replace(/(?<!\\);/g, '&#59;')

  return source
    .split('\n')
    .map((line) => {
      const note = noteLine.exec(line)
      if (note) {
        return `${note[1]}${escapeLabel(note[2]!)}`
      }
      const message = messageLine.exec(line)
      if (message) {
        return `${message[1]}${escapeLabel(message[2]!)}`
      }
      return line
    })
    .join('\n')
}
