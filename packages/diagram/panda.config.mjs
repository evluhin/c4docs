import { defineConfig } from '@c4docs/likec4-styles/dev'

export default defineConfig({
  include: [
    'src/**/*.{ts,tsx}',
  ],
  clean: false,
  outdir: '../../styled-system/styles/dist',
})
