import { defineVitest } from '@c4docs/likec4-devops/vitest'

export default defineVitest('language-server', {
  test: {
    testTimeout: 10_000,
    isolate: false,
    exclude: [
      '**/node_modules/**',
      'dist/**',
      'build/**',
      'lib/**',
    ],
  },
})
