// SPDX-License-Identifier: MIT
//
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

import { defineConfig, devices } from '@playwright/test'
import { isCI } from 'std-env'

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/docs-nav.spec.ts'],
  forbidOnly: isCI,
  timeout: 20 * 1000,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list'], ['html']] : 'html',

  use: {
    baseURL: 'http://127.0.0.1:5176',
    browserName: 'chromium',
    colorScheme: 'light',
    trace: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome HiDPI'] },
    },
  ],

  webServer: {
    command:
      'OUT=$(mktemp -d /tmp/likec4-docs-nav-XXXXXX) && pnpm likec4 build -o "$OUT" ../examples/docs-as-code && node ./serve-static-build.mjs "$OUT" 5176',
    url: 'http://127.0.0.1:5176',
    stdout: 'pipe',
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'production',
    },
  },
})
