// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * The resolved state of a ```likec4-view embed, parsed from its directive body.
 * Every field is optional except that `view` is surfaced separately via
 * {@link ParsedViewBlock.viewId}.
 */
export interface ParsedViewBlockState {
  focus?: string
  dynamic?: 'diagram' | 'sequence'
  theme?: 'light' | 'dark' | 'auto'
  padding?: number
}

/** A single lenient parse error with the 1-based line index within the block body. */
export interface ParsedViewBlockError {
  message: string
  /** 1-based line index within the block body */
  line: number
}

/**
 * The result of {@link parseLikeC4ViewBlock}: the required `view` id (when
 * present and unique), the resolved optional state, and any lenient errors.
 */
export interface ParsedViewBlock {
  viewId?: string
  state: ParsedViewBlockState
  errors: ParsedViewBlockError[]
}

const ALLOWED_KEYS = ['view', 'focus', 'dynamic', 'theme', 'padding'] as const

/**
 * Parses the body of a ```likec4-view embed into a structured reference.
 *
 * Grammar: one `key: value` directive per line. Allowlisted keys are exactly
 * `view`, `focus`, `dynamic`, `theme`, and `padding`. `view` is REQUIRED and must
 * appear exactly once (missing or duplicate is an error). An unknown key is an
 * error (so typos surface). Value domains are validated: `dynamic` in
 * {diagram, sequence}; `theme` in {light, dark, auto}; `padding` must be a
 * non-negative integer. Blank and whitespace-only lines are skipped. CRLF is
 * tolerated.
 *
 * Each error carries a 1-based `line` index within the block body.
 *
 * Pure: no model access, no I/O, never throws.
 */
export function parseLikeC4ViewBlock(body: string): ParsedViewBlock {
  const errors: ParsedViewBlockError[] = []
  const state: ParsedViewBlockState = {}
  let viewId: string | undefined
  let viewCount = 0

  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1
    const raw = lines[i]!.replace(/\r$/, '')
    const trimmed = raw.trim()
    if (trimmed === '') {
      continue
    }
    const colon = trimmed.indexOf(':')
    if (colon < 0) {
      errors.push({ message: `Invalid directive, expected "key: value": "${trimmed}"`, line })
      continue
    }
    const key = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      errors.push({ message: `Unknown key "${key}"`, line })
      continue
    }
    if (value === '') {
      errors.push({ message: `Missing value for "${key}"`, line })
      continue
    }
    switch (key) {
      case 'view': {
        viewCount++
        if (viewCount > 1) {
          errors.push({ message: 'Duplicate "view" directive', line })
          continue
        }
        viewId = value
        break
      }
      case 'focus': {
        state.focus = value
        break
      }
      case 'dynamic': {
        if (value !== 'diagram' && value !== 'sequence') {
          errors.push({ message: `Invalid "dynamic" value "${value}", expected "diagram" or "sequence"`, line })
          continue
        }
        state.dynamic = value
        break
      }
      case 'theme': {
        if (value !== 'light' && value !== 'dark' && value !== 'auto') {
          errors.push({ message: `Invalid "theme" value "${value}", expected "light", "dark" or "auto"`, line })
          continue
        }
        state.theme = value
        break
      }
      case 'padding': {
        if (!/^\d+$/.test(value)) {
          errors.push({ message: `Invalid "padding" value "${value}", expected a non-negative integer`, line })
          continue
        }
        state.padding = Number.parseInt(value, 10)
        break
      }
    }
  }

  if (viewCount === 0) {
    errors.push({ message: 'Missing required "view" directive', line: 1 })
  }

  const result: ParsedViewBlock = { state, errors }
  if (viewId !== undefined) {
    result.viewId = viewId
  }
  return result
}
