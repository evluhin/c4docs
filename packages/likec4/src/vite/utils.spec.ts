import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyDocsAssets, copyUserPublicDir } from './utils'

describe('copyUserPublicDir', () => {
  let src: string
  let dest: string

  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), 'likec4-public-src-'))
    dest = await mkdtemp(join(tmpdir(), 'likec4-public-dest-'))
  })

  afterEach(async () => {
    await rm(src, { recursive: true, force: true })
    await rm(dest, { recursive: true, force: true })
  })

  it('copies all top-level entries into dest and returns their names', async () => {
    await writeFile(join(src, 'logo.png'), 'fake-png')
    await writeFile(join(src, 'robots.custom.txt'), 'User-agent: *')
    await mkdir(join(src, 'media'))
    await writeFile(join(src, 'media', 'video.mp4'), 'fake-mp4')

    const entries = await copyUserPublicDir(src, dest)

    expect(entries.sort()).toEqual(['logo.png', 'media', 'robots.custom.txt'])
    expect(await readFile(join(dest, 'logo.png'), 'utf8')).toBe('fake-png')
    expect(await readFile(join(dest, 'robots.custom.txt'), 'utf8')).toBe('User-agent: *')
    expect(await readFile(join(dest, 'media', 'video.mp4'), 'utf8')).toBe('fake-mp4')
  })

  it('returns an empty array when source dir is empty', async () => {
    const entries = await copyUserPublicDir(src, dest)
    expect(entries).toEqual([])
    expect(await readdir(dest)).toEqual([])
  })

  it('throws a descriptive error when the source path does not exist', async () => {
    const missing = join(tmpdir(), 'likec4-public-does-not-exist-' + Date.now())
    await expect(copyUserPublicDir(missing, dest)).rejects.toThrow(/does not exist/)
  })

  it('throws a descriptive error when the source path is a file', async () => {
    const file = join(src, 'a-file.txt')
    await writeFile(file, 'hi')
    await expect(copyUserPublicDir(file, dest)).rejects.toThrow(/not a directory/)
  })
})

describe('copyDocsAssets', () => {
  let src: string
  let dest: string

  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), 'likec4-docs-src-'))
    dest = await mkdtemp(join(tmpdir(), 'likec4-docs-dest-'))
  })

  afterEach(async () => {
    await rm(src, { recursive: true, force: true })
    await rm(dest, { recursive: true, force: true })
  })

  it('copies each manifest asset to its output path and returns top-level entries', async () => {
    await mkdir(join(src, 'img'), { recursive: true })
    await writeFile(join(src, 'img', 'a.png'), 'fake-png')

    const entries = await copyDocsAssets(
      [{ sourceAbsPath: join(src, 'img', 'a.png'), outputPath: 'docs/img/a.png' }],
      dest,
    )

    expect(entries).toEqual(['docs'])
    expect(await readFile(join(dest, 'docs', 'img', 'a.png'), 'utf8')).toBe('fake-png')
  })

  it('deduplicates repeated assets and skips missing sources', async () => {
    await writeFile(join(src, 'b.png'), 'b')
    const entries = await copyDocsAssets(
      [
        { sourceAbsPath: join(src, 'b.png'), outputPath: 'docs/b.png' },
        { sourceAbsPath: join(src, 'b.png'), outputPath: 'docs/b.png' },
        { sourceAbsPath: join(src, 'missing.png'), outputPath: 'docs/missing.png' },
      ],
      dest,
    )
    expect(entries).toEqual(['docs'])
    expect(await readdir(join(dest, 'docs'))).toEqual(['b.png'])
  })
})
