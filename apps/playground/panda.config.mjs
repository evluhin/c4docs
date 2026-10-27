import { defineConfig } from '@c4docs/likec4-styles/dev'

export default defineConfig({
  clean: true,
  include: [
    '../../packages/diagram/src/**/*.{ts,tsx}',
    'src/**/*.{ts,tsx}',
  ],
  outdir: 'styled-system',
})
