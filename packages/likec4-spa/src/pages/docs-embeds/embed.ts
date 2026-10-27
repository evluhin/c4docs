// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

import type { DiagramRef } from '@c4docs/likec4-core'

/**
 * Props passed to the embedded `<LikeC4View>` when a ref resolves.
 * `focus` has no corresponding prop on LikeC4View and is applied through the
 * diagram runtime (see FocusEmbeddedView in DocsPage).
 */
export interface EmbedViewProps {
  viewId: string
  focus?: string | undefined
  dynamicViewVariant?: 'diagram' | 'sequence' | undefined
  colorScheme?: 'light' | 'dark' | undefined
  fitViewPadding?: number | undefined
}

/** A resolved embed: mount a LikeC4View with these props. */
export interface EmbedMount {
  kind: 'mount'
  props: EmbedViewProps
}

/** An unresolved / missing embed: render a non-fatal inline notice. */
export interface EmbedNotice {
  kind: 'notice'
  message: string
}

export type EmbedResolution = EmbedMount | EmbedNotice

/**
 * Decides how to hydrate a single `data-likec4-view-embed` placeholder from the
 * doc's refs. Pure so the mount-vs-notice choice and the ref→props mapping are
 * unit-testable without a DOM or a model.
 *
 * - A missing ref (index out of range) or `resolved === false` yields a notice.
 * - A resolved ref maps its `state` onto LikeC4View props: `theme` → colorScheme
 *   ('auto'/absent omitted so it follows the app), `dynamic` → dynamicViewVariant,
 *   `padding` → fitViewPadding, `focus` → applied via the diagram runtime.
 */
export function resolveEmbed(refs: readonly DiagramRef[], index: number): EmbedResolution {
  const ref = refs[index]
  if (!ref) {
    return { kind: 'notice', message: `Cannot embed view: reference #${index} not found` }
  }
  if (!ref.resolved) {
    const viewId = ref.viewId || '(missing view)'
    const reason = ref.error ?? 'unresolved reference'
    return { kind: 'notice', message: `Cannot embed view: ${viewId} — ${reason}` }
  }

  const props: EmbedViewProps = { viewId: ref.viewId }
  if (ref.state.focus !== undefined) {
    props.focus = ref.state.focus
  }
  if (ref.state.dynamic !== undefined) {
    props.dynamicViewVariant = ref.state.dynamic
  }
  // 'auto' (or absent) follows the app's scheme: omit the prop.
  if (ref.state.theme === 'light' || ref.state.theme === 'dark') {
    props.colorScheme = ref.state.theme
  }
  if (ref.state.padding !== undefined) {
    props.fitViewPadding = ref.state.padding
  }
  return { kind: 'mount', props }
}
