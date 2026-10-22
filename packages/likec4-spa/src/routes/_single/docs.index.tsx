import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { ErrorComponent } from '../../components/ErrorComponent'

export const Route = createFileRoute('/_single/docs/')({
  loader: async ({ context }) => {
    const { $docs } = await loadDocs(context.projectId)
    const docs = $docs.get()
    if (docs.entry == null) {
      throw notFound()
    }
    throw redirect({
      to: '/docs/$/',
      params: { _splat: docs.entry },
      search: true,
    })
  },
  errorComponent: ErrorComponent,
})
