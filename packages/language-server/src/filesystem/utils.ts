import { LikeC4LanguageMetaData } from '../generated/module'

export function hasLikeC4Ext(path: string) {
  return LikeC4LanguageMetaData.fileExtensions.some((ext) => path !== ext && path.endsWith(ext))
}

/**
 * Whether the given path is a Markdown documentation file.
 * Matches `.md` files (not directories, not a bare `.md` name).
 */
export function isMarkdownFile(path: string, isDirectory = false): boolean {
  if (isDirectory) {
    return false
  }
  return path !== '.md' && path.toLowerCase().endsWith('.md')
}

const nodeModulesOrRepo = ['node_modules', '.git', '.svn', '.yarn', '.pnpm']
/**
 * Check if the given directory name is a node_modules or repository directory
 */
export function isNodeModulesOrRepo(basename: string) {
  return nodeModulesOrRepo.includes(basename)
}

export function insideNodeModulesOrRepo(path: string) {
  for (const dir of nodeModulesOrRepo) {
    if (path.includes(dir)) {
      return true
    }
  }
  return false
}
