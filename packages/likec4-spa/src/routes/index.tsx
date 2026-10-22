import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadDocs } from 'likec4:docs'
import { projects } from 'likec4:projects'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (projects.length > 1) {
      throw redirect({
        to: '/projects/',
        mask: {
          to: '/',
          unmaskOnReload: true,
        },
      })
    }

    // Opt-in docs-first landing: the single project enables docs.landing and has
    // a resolvable docs entry. Placed before the view-grid / redirect fallback so
    // existing projects are untouched.
    if (projects[0].docsLanding) {
      try {
        const { $docs } = await loadDocs(projects[0].id)
        if ($docs.get().entry != null) {
          throw redirect({
            to: '/docs/',
            mask: {
              to: '/',
              unmaskOnReload: true,
            },
          })
        }
      } catch (err) {
        // A redirect is thrown as an object with isRedirect; re-throw it.
        if (err && typeof err === 'object' && 'isRedirect' in err) {
          throw err
        }
        // Otherwise fall through to the default landing behavior.
      }
    }

    if (projects[0].landingPage && 'redirect' in projects[0].landingPage) {
      throw redirect({
        to: '/view/$viewId/',
        params: { viewId: 'index' },
        mask: {
          to: '/',
          unmaskOnReload: true,
        },
      })
    }

    throw redirect({
      to: '/single-index/',
      mask: {
        to: '/',
        unmaskOnReload: true,
      },
    })
  },
})
