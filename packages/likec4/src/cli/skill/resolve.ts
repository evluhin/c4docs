import { fdir } from 'fdir'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import picomatch from 'picomatch'
import { satisfies, validRange } from 'semver'
import { parse } from 'yaml'

/** Documented allowlist of agent skill directories searched when no explicit --skill is given. */
const SKILL_SEARCH_GLOBS = [
  '.claude/skills/*/SKILL.md',
  '.agents/skills/*/SKILL.md',
  '.cursor/**/SKILL.md',
  '.windsurf/skills/*/SKILL.md',
  '.kiro/skills/*/SKILL.md',
  'skills/likec4-dsl/SKILL.md',
] as const

/**
 * Parse the `metadata.likec4` semver range from a materialized SKILL.md.
 * Returns the validated range, or a clear error when the frontmatter is missing,
 * the field is absent, or the range is unparseable.
 */
export function parseSkillRange(skillMd: string): { range: string } | { error: string } {
  const parts = skillMd.split('---')
  if (parts.length < 3) {
    return { error: 'SKILL.md has no YAML frontmatter (expected a leading --- ... --- block)' }
  }
  const frontmatter = parts[1]!
  let data: unknown
  try {
    data = parse(frontmatter)
  } catch (e) {
    return { error: `failed to parse SKILL.md frontmatter: ${e instanceof Error ? e.message : String(e)}` }
  }
  const likec4 = (data as { metadata?: { likec4?: unknown } } | null)?.metadata?.likec4
  if (typeof likec4 !== 'string' || likec4.trim() === '') {
    return { error: 'SKILL.md frontmatter has no metadata.likec4 range' }
  }
  if (validRange(likec4) === null) {
    return { error: `SKILL.md metadata.likec4 is not a valid semver range: '${likec4}'` }
  }
  return { range: likec4 }
}

/**
 * Compare the running CLI version against the skill's declared range.
 * On mismatch, name both the current version and the range and point to the re-install command.
 */
export function checkCompatibility(currentVersion: string, range: string): { ok: boolean; message: string } {
  if (satisfies(currentVersion, range)) {
    return {
      ok: true,
      message: `likec4 ${currentVersion} satisfies the skill range ${range}`,
    }
  }
  return {
    ok: false,
    message: [
      `likec4 ${currentVersion} does not satisfy the skill range ${range}.`,
      `Update the skill and the likec4 dependency, then re-run:`,
      `  npx skills add evluhin/likec4 --agent <type>`,
    ].join('\n'),
  }
}

/**
 * Resolve a SKILL.md path. Returns the explicit --skill path when provided,
 * else best-effort searches the documented agent-dir allowlist under cwd.
 * Returns null when nothing is found.
 */
export function findSkillMd(cwd: string, explicitPath?: string): string | null {
  if (explicitPath) {
    return explicitPath
  }
  for (const glob of SKILL_SEARCH_GLOBS) {
    if (!glob.includes('*')) {
      const candidate = resolve(cwd, glob)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  const matchers = SKILL_SEARCH_GLOBS.filter(g => g.includes('*')).map(g => picomatch(g))
  const found = new fdir()
    .withRelativePaths()
    .filter((path) => matchers.some(m => m(path.split('\\').join('/'))))
    .crawl(cwd)
    .sync()
  if (found.length > 0) {
    return resolve(cwd, found[0]!)
  }
  return null
}
