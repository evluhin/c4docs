// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.

/**
 * Doc-referenced assets are modeled with root-absolute `src`/`href` values
 * (leading `/`, e.g. `/docs/img/overview.png`) that match where the build copies
 * them. The app may be served under a non-root base, so prefix those root-absolute
 * doc URLs with the configured base path — this is the only place the base is known.
 *
 * Only root-absolute URLs (`/path`) are rewritten; protocol-relative (`//host`),
 * absolute (`https://`), anchor (`#`), and `data:` URLs are left untouched.
 */
export function applyBaseToDocHtml(html: string, basepath: string): string {
  const base = basepath.endsWith('/') ? basepath.slice(0, -1) : basepath
  if (base === '') {
    return html
  }
  return html.replace(/(\b(?:src|href)=")\/(?!\/)/g, `$1${base}/`)
}
