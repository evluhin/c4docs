import { describe, expect, it } from 'vitest'
import { checkCompatibility, findSkillMd, parseSkillRange } from './resolve'

const SKILL_IN_RANGE = `---
name: likec4-dsl
description: x
metadata:
  likec4: '>=1.60.0 <2.0.0'
---
body
`

const SKILL_WITHOUT_METADATA = `---
name: likec4-dsl
description: x
---
body
`

const SKILL_WITH_GARBAGE_RANGE = `---
name: likec4-dsl
description: x
metadata:
  likec4: 'not-a-range'
---
body
`

describe('checkCompatibility', () => {
  it('in-range version is compatible', () => {
    expect(checkCompatibility('1.60.0', '>=1.60.0 <2.0.0').ok).toBe(true)
  })

  it('out-of-range version is incompatible and names both version and range', () => {
    const result = checkCompatibility('1.59.0', '>=1.60.0 <2.0.0')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('1.59.0')
    expect(result.message).toContain('>=1.60.0 <2.0.0')
  })
})

describe('parseSkillRange', () => {
  it('reads metadata.likec4 range from valid frontmatter', () => {
    expect(parseSkillRange(SKILL_IN_RANGE)).toEqual({ range: '>=1.60.0 <2.0.0' })
  })

  it('returns an error when metadata.likec4 is missing', () => {
    expect(parseSkillRange(SKILL_WITHOUT_METADATA)).toHaveProperty('error')
  })

  it('returns an error when the range is unparseable', () => {
    expect(parseSkillRange(SKILL_WITH_GARBAGE_RANGE)).toHaveProperty('error')
  })
})

describe('findSkillMd', () => {
  it('returns the explicit --skill path without auto-detection', () => {
    expect(findSkillMd('/some/cwd', '/explicit/SKILL.md')).toBe('/explicit/SKILL.md')
  })
})
