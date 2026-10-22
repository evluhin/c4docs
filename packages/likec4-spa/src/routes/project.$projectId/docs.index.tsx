import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { ErrorComponent } from '../../components/ErrorComponent'

export const Route = createFileRoute('/project/$projectId/docs/')({
  loader: async ({ params }) => {
    const { $docs } = await loadDocs(params.projectId)
    const docs = $docs.get()
    if (docs.entry == null) {
      throw notFound()
    }
    throw redirect({
      to: '/project/$projectId/docs/$/',
      params: { projectId: params.projectId, _splat: docs.entry },
      search: true,
    })
  },
  errorComponent: ErrorComponent,
})
