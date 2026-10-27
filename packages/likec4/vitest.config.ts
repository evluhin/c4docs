import { defineVitest } from '@c4docs/likec4-devops/vitest'

export default defineVitest('likec4', {
  test: {
    exclude: ['**/lib/**', '**/node_modules/**'],
  },
})
