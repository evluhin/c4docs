import { createFileRoute, notFound } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { ErrorComponent } from '../../components/ErrorComponent'
import { DocsPage } from '../../pages/DocsPage'

export const Route = createFileRoute('/_single/docs/$')({
  staleTime: Infinity,
  loader: async ({ context }) => {
    const { $docs } = await loadDocs(context.projectId)
    if (!$docs.get()) {
      throw notFound()
    }
    return { $docs }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { $docs } = Route.useLoaderData()
  const { _splat } = Route.useParams()
  return <DocsPage $docs={$docs} path={_splat ?? ''} />
}
