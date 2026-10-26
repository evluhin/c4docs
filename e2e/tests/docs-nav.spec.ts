// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

import { expect, test } from '@playwright/test'
import { canvas } from '../helpers/selectors'
import { TIMEOUT_CANVAS } from '../helpers/timeouts'

/**
 * E2E over the fully-static build of examples/docs-as-code:
 *
 * 1. A rewritten inter-doc link (`[architecture](./architecture.md)` -> `/docs/architecture`)
 *    is intercepted by DocsPage and navigates as an SPA transition (NOT a full
 *    page reload). A window sentinel set before the click proves the document
 *    was never reloaded.
 * 2. A rewritten `likec4://view/shop` link navigates to the `/view/shop/`
 *    diagram route and the canvas renders.
 */

test('inter-doc link navigates client-side without a full reload', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/docs/')

  const interDoc = page.getByRole('link', { name: 'architecture', exact: true })
  await expect(interDoc).toBeVisible()

  // Sentinel on the live window; a full page reload would wipe it.
  await page.evaluate(() => {
    ;(window as unknown as { __likec4NavSentinel?: boolean }).__likec4NavSentinel = true
  })

  await interDoc.click()

  await expect(page).toHaveURL(/\/docs\/architecture\/?$/)
  // The architecture doc content is now rendered.
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible()

  const sentinelSurvived = await page.evaluate(
    () => (window as unknown as { __likec4NavSentinel?: boolean }).__likec4NavSentinel === true,
  )
  expect(sentinelSurvived).toBe(true)
})

test('likec4:// link navigates to the diagram route and renders the canvas', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/docs/')

  const viewLink = page.getByRole('link', { name: 'shop diagram' })
  await expect(viewLink).toBeVisible()

  await viewLink.click()

  await expect(page).toHaveURL(/\/view\/shop\/$/)
  await expect(canvas(page)).toBeVisible({ timeout: TIMEOUT_CANVAS })
})
