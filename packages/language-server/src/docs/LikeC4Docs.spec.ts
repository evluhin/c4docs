import { describe, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { createLanguageServices } from '../module'

describe('LikeC4Docs', () => {
  async function createTestServices(docsConfig?: { dir?: string; entry?: string; landing?: boolean }) {
    const services = createLanguageServices().likec4

    const fs = services.shared.workspace.FileSystemProvider
    vi.spyOn(fs, 'scanDirectory')
    vi.spyOn(fs, 'readFile')
    vi.spyOn(fs, 'exists')

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
    fs: { scanDirectory: unknown; readFile: unknown; exists: unknown },
    docsDir: string,
    files: Record<string, string>,
    nav?: string,
  ) {
    const prefix = `${docsDir}/`
    const navPath = `${docsDir}/nav.yaml`
    // scanDirectory only returns markdown files (the real filter is isMarkdownFile).
    vi.mocked(fs.scanDirectory as any).mockResolvedValue(
      Object.keys(files).map((rel) => ({
        uri: URI.file(`${docsDir}/${rel}`),
        isFile: true,
        isDirectory: false,
      })),
    )
    vi.mocked(fs.exists as any).mockImplementation(async (uri: URI) => uri.fsPath === navPath && nav != null)
    vi.mocked(fs.readFile as any).mockImplementation(async (uri: URI) => {
      if (uri.fsPath === navPath) {
        return nav ?? ''
      }
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

  it('rewrites inter-doc links and leaves unknown view links untouched (logged)', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(fs, docsDir, {
      'index.md': '# Home\n\nSee [Architecture](./architecture.md).',
      'architecture.md': '# Architecture\n\nBack [home](./index.md) and [diagram](likec4://view/ghost).',
    })

    const model = await docs.docsModel(projectId)

    // inter-doc links resolve against the discovered known paths
    expect(model.pages['']!.html).toContain('/docs/architecture')
    expect(model.pages['architecture']!.html).toContain('/docs/')
    // no model/view registered -> unknown view link is not rewritten to a route
    expect(model.pages['architecture']!.html).not.toContain('/view/ghost/')
    expect(model.pages['architecture']!.links).toEqual([])
    // raw stays byte-for-byte
    expect(model.pages['architecture']!.raw).toBe(
      '# Architecture\n\nBack [home](./index.md) and [diagram](likec4://view/ghost).',
    )
  })

  it('builds tree order, nesting, and labels from nav.yaml and hides unlisted files', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(
      fs,
      docsDir,
      {
        'index.md': '# Home',
        'architecture.md': '# Architecture',
        'adr/0001-use-event-bus.md': '# Use an event bus',
        'orphan.md': '# Orphan',
      },
      [
        'nav:',
        '  - Overview: architecture.md',
        '  - Home: index.md',
        '  - Decisions:',
        '    - adr/0001-use-event-bus.md',
      ].join('\n'),
    )

    const model = await docs.docsModel(projectId)

    // order and nesting come entirely from nav.yaml
    expect(model.tree.map((n) => ({ label: n.label, path: n.path }))).toEqual([
      { label: 'Overview', path: 'architecture' },
      { label: 'Home', path: '' },
      { label: 'Decisions', path: '' },
    ])
    const decisions = model.tree[2]!
    expect(decisions.kind).toBe('folder')
    expect(decisions.children?.map((c) => c.path)).toEqual(['adr/0001-use-event-bus'])

    // unlisted orphan.md is hidden from the tree but still present in pages
    expect(model.tree.some((n) => n.path === 'orphan')).toBe(false)
    expect(Object.keys(model.pages)).toContain('orphan')

    // entry defaults to the first nav entry
    expect(model.entry).toBe('architecture')
  })

  it('falls back to the convention tree when nav.yaml is absent', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(fs, docsDir, {
      'index.md': '---\ntitle: Home\n---\n# Home',
      'adr/index.md': '---\ntitle: Decisions\n---\n# ADRs',
      'adr/0001-use-event-bus.md': '# Use an event bus',
    })

    const model = await docs.docsModel(projectId)
    const adr = model.tree.find((n) => n.path === 'adr')
    expect(adr?.kind).toBe('folder')
    expect(adr?.label).toBe('Decisions')
    expect(model.entry).toBe('')
  })

  it('falls back to the convention tree when nav.yaml is malformed', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(
      fs,
      docsDir,
      {
        'index.md': '# Home',
        'architecture.md': '# Architecture',
      },
      'nav: not-a-list\n',
    )

    const model = await docs.docsModel(projectId)
    // convention: alphabetical top-level docs, no hiding
    expect(model.tree.map((n) => n.path).sort()).toEqual(['architecture'])
    expect(Object.keys(model.pages).sort()).toEqual(['', 'architecture'])
  })

  it('rebuilds when nav.yaml changes', async ({ expect }) => {
    const { fs, projectId, docs } = await createTestServices()
    mockDocs(
      fs,
      docsDir,
      { 'index.md': '# Home', 'architecture.md': '# Architecture' },
      'nav:\n  - Home: index.md\n',
    )
    let model = await docs.docsModel(projectId)
    expect(model.tree.map((n) => n.path)).toEqual([''])

    const events: string[] = []
    docs.onDocsUpdate((e) => events.push(e.projectId))

    mockDocs(
      fs,
      docsDir,
      { 'index.md': '# Home', 'architecture.md': '# Architecture' },
      'nav:\n  - Home: index.md\n  - Arch: architecture.md\n',
    )
    await docs.handleFileSystemUpdate({ update: URI.file(`${docsDir}/nav.yaml`) })

    expect(events).toContain(projectId)
    model = await docs.docsModel(projectId)
    expect(model.tree.map((n) => n.path)).toEqual(['', 'architecture'])
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
