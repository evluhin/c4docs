import { createFileRoute, notFound } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { ErrorComponent } from '../../components/ErrorComponent'
import { DocsPage } from '../../pages/DocsPage'

export const Route = createFileRoute('/project/$projectId/docs/$')({
  staleTime: Infinity,
  loader: async ({ params }) => {
    const { $docs } = await loadDocs(params.projectId)
    if (!$docs.get()) {
      throw notFound()
    }
    return { $docs, projectId: params.projectId }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { $docs, projectId } = Route.useLoaderData()
  const { _splat } = Route.useParams()
  return <DocsPage $docs={$docs} path={_splat ?? ''} projectId={projectId} />
}
