import { describe, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { createLanguageServices } from '../module'

describe('LikeC4Docs', () => {
  async function createTestServices(docsConfig?: { dir?: string; entry?: string; landing?: boolean }) {
    const services = createLanguageServices().likec4

    const fs = services.shared.workspace.FileSystemProvider
    vi.spyOn(fs, 'scanDirectory')
    vi.spyOn(fs, 'readFile')

    const projectData = await services.shared.workspace.ProjectsManager.registerProject({
      config: {
        name: 'test-project',
        ...(docsConfig ? { docs: docsConfig } : {}),
      },
      folderUri: URI.file('/test/workspace/test-project'),
    })

    const docs = services.shared.workspace.Docs
    return { services, fs, projectId: projectData.id, docs }
  }

  function mockDocs(
    fs: { scanDirectory: unknown; readFile: unknown },
    docsDir: string,
    files: Record<string, string>,
  ) {
    vi.mocked(fs.scanDirectory as any).mockResolvedValue(
      Object.keys(files).map((rel) => ({
        uri: URI.file(`${docsDir}/${rel}`),
        isFile: true,
        isDirectory: false,
      })),
    )
    const prefix = `${docsDir}/`
    vi.mocked(fs.readFile as any).mockImplementation(async (uri: URI) => {
      const rel = uri.fsPath.startsWith(prefix) ? uri.fsPath.slice(prefix.length) : uri.fsPath
      return files[rel] ?? ''
    })
  }

  const docsDir = '/test/workspace/test-project/docs'

  it('returns an empty model for a project with no docs', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    vi.mocked(fs.scanDirectory as any).mockResolvedValue([])
    const model = await docs.docsModel(projectId)
    expect(model.pages).toEqual({})
    expect(model.tree).toEqual([])
    expect(model.entry).toBeNull()
  })

  it('discovers, models, and assembles a docs tree from a fixture', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(fs, docsDir, {
      'index.md': '---\ntitle: Home\n---\n# Home\n\nwelcome',
      'adr/index.md': '---\ntitle: Decisions\n---\n# ADRs',
      'adr/0001-use-event-bus.md': '# Use an event bus\n\ntext',
    })

    const model = await docs.docsModel(projectId)

    expect(Object.keys(model.pages).sort()).toEqual(['', 'adr', 'adr/0001-use-event-bus'])
    expect(model.pages['']!.title).toBe('Home')
    expect(model.pages['']!.html).toContain('welcome')
    // raw byte-for-byte
    expect(model.pages['adr/0001-use-event-bus']!.raw).toBe('# Use an event bus\n\ntext')

    const adr = model.tree.find((n) => n.path === 'adr')
    expect(adr?.kind).toBe('folder')
    expect(adr?.label).toBe('Decisions')
    expect(adr?.children?.map((c) => c.path)).toEqual(['adr/0001-use-event-bus'])

    // entry resolves to the root index
    expect(model.entry).toBe('')
  })

  it('honors the docs.entry config', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices({ entry: 'guide' })
    mockDocs(fs, docsDir, {
      'guide.md': '# Guide',
      'index.md': '# Home',
    })
    const model = await docs.docsModel(projectId)
    expect(model.entry).toBe('guide')
  })

  it('isDocsFile recognizes files under the docs dir', async ({ expect }) => {
    const { fs, docs } = await createTestServices()
    vi.mocked(fs.scanDirectory as any).mockResolvedValue([])
    expect(docs.isDocsFile(URI.file(`${docsDir}/adr/0001.md`))).toBe(true)
    expect(docs.isDocsFile(URI.file('/test/workspace/test-project/src/model.c4'))).toBe(false)
    expect(docs.isDocsFile(URI.file(`${docsDir}/readme.txt`))).toBe(false)
  })

  it('handleFileSystemUpdate invalidates the cache and notifies listeners', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(fs, docsDir, { 'index.md': '# A' })
    await docs.docsModel(projectId)

    const events: string[] = []
    docs.onDocsUpdate((e) => events.push(e.projectId))

    mockDocs(fs, docsDir, { 'index.md': '# B' })
    await docs.handleFileSystemUpdate({ update: URI.file(`${docsDir}/index.md`) })

    expect(events).toContain(projectId)
    const model = await docs.docsModel(projectId)
    expect(model.pages['']!.html).toContain('B')
  })
})
