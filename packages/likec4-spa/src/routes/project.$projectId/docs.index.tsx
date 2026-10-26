import { createFileRoute, notFound } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { ErrorComponent } from '../../components/ErrorComponent'
import { DocsPage } from '../../pages/DocsPage'

export const Route = createFileRoute('/project/$projectId/docs/')({
  loader: async ({ params }) => {
    const { $docs } = await loadDocs(params.projectId)
    const docs = $docs.get()
    if (docs.entry == null) {
      throw notFound()
    }
    // Render the entry doc directly. The root index.md resolves to the empty
    // route path (""), which cannot be expressed as a /docs/$ splat, so we render
    // here instead of redirecting to an unroutable empty splat.
    return { $docs, entry: docs.entry, projectId: params.projectId }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { $docs, entry, projectId } = Route.useLoaderData()
  return <DocsPage $docs={$docs} path={entry} projectId={projectId} />
}
