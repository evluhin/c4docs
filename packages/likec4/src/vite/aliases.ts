import { resolve } from 'node:path'
import { findPkgRoot } from './utils'

export function viteAliases() {
  const pkg = findPkgRoot()
  return {
    '@c4docs/likec4/react': resolve(pkg, 'react/index.mjs'),
    '@c4docs/likec4/model': resolve(pkg, 'dist/model/index.mjs'),
    '@c4docs/likec4/vite-plugin/internal': resolve(pkg, 'dist/vite-plugin/internal/index.mjs'),
  }
}
