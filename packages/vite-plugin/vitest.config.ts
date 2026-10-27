import { resolve } from 'node:path'
import { defineProject } from 'vitest/config'

export default defineProject({
  resolve: {
    conditions: ['sources', 'node'],
    // Seems vitest doesn't resolve conditions
    alias: {
      '@c4docs/likec4-style-preset/defaults': resolve(
        import.meta.dirname,
        '../../styled-system/preset/src/defaults/index.ts',
      ),
      '@c4docs/likec4-core': resolve(import.meta.dirname, '../core/src'),
      '@c4docs/likec4-log': resolve(import.meta.dirname, '../log/src'),
      '@c4docs/likec4-layouts': resolve(import.meta.dirname, '../layouts/src'),
      '@c4docs/likec4-config': resolve(import.meta.dirname, '../config/src'),
      '@c4docs/likec4-language-server': resolve(import.meta.dirname, '../language-server/src'),
      '@c4docs/likec4-language-services': resolve(import.meta.dirname, '../language-services/src'),
      '@c4docs/likec4-generators': resolve(import.meta.dirname, '../generators/src'),
    },
  },
  test: {
    name: 'vite-plugin',
    testTimeout: 10_000,
    chaiConfig: {
      includeStack: true,
      truncateThreshold: 100,
    },
    maxConcurrency: 10,
    sequence: {
      concurrent: true,
    },
    exclude: [
      '**/node_modules/**',
      'dist/**',
      'build/**',
      'lib/**',
    ],
  },
})
