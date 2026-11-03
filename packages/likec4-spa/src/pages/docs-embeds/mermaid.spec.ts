// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import { describe, expect, it } from 'vitest'
import { escapeSequenceMessageSemicolons } from './mermaid'

describe('escapeSequenceMessageSemicolons', () => {
  it('escapes a semicolon inside sequence message text', () => {
    // Regression: mermaid treats a bare `;` as a statement separator, so this
    // line split into an invalid trailing statement and failed the whole render.
    const source = [
      'sequenceDiagram',
      '  participant GW',
      '  participant IAM',
      '  GW->>GW: [AUTO] Verify SigV4 signature; identify IAM principal (Lambda role)',
      '  GW->>IAM: evaluate',
    ].join('\n')
    const result = escapeSequenceMessageSemicolons(source)
    expect(result).toContain('Verify SigV4 signature&#59; identify IAM principal (Lambda role)')
    expect(result).not.toContain('signature; identify')
  })

  it('escapes a semicolon inside note text', () => {
    const source = [
      'sequenceDiagram',
      '  participant A',
      '  note over A: first part; second part',
      '  A->>A: go',
    ].join('\n')
    const result = escapeSequenceMessageSemicolons(source)
    expect(result).toContain('note over A: first part&#59; second part')
  })

  it('leaves structural lines, keywords and <br/> notes untouched', () => {
    const source = [
      'sequenceDiagram',
      '  actor L as BFF Lambda',
      '  participant GW as API Gateway',
      '  note over L: creds as env vars<br/>(AWS_ACCESS_KEY_ID)<br/>via STS',
      '  rect rgb(240,240,240)',
      '  note right of L: Credential Resolution',
      '  L->>L: [AUTO] inject credentials',
      '  end',
      '  alt Allowed',
      '    GW-->>L: 200 OK',
      '  else Denied',
      '    GW-->>L: 403 Forbidden',
      '  end',
    ].join('\n')
    const result = escapeSequenceMessageSemicolons(source)
    // No semicolons anywhere in message/note text here, so nothing changes.
    expect(result).toBe(source)
    expect(result).toContain('rect rgb(240,240,240)')
    expect(result).toContain('<br/>(AWS_ACCESS_KEY_ID)<br/>')
    expect(result).toContain('alt Allowed')
    expect(result).toContain('else Denied')
  })

  it('does not touch an already-escaped semicolon', () => {
    const source = 'sequenceDiagram\n  A->>A: foo \\; bar'
    expect(escapeSequenceMessageSemicolons(source)).toBe(source)
  })

  it('leaves non-sequence diagrams completely untouched', () => {
    const flow = 'flowchart TD\n  A[Block /preview; default BLOCK] --> B'
    expect(escapeSequenceMessageSemicolons(flow)).toBe(flow)
    const graph = 'graph LR\n  A -->|has; semicolon| B'
    expect(escapeSequenceMessageSemicolons(graph)).toBe(graph)
  })
})
