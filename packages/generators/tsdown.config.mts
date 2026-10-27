import { defineConfig } from '@c4docs/likec4-devops/tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/likec4/index.ts',
  ],
  unbundle: true,
  minify: false,
})
