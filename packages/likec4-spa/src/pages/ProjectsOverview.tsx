import { LikeC4ProjectsOverview, useChangeLikeC4Project } from '@c4docs/likec4-diagram'
import { useLikeC4ProjectsOverview } from 'likec4:projects-overview'

export function ProjectsOverviewPage() {
  const changeProject = useChangeLikeC4Project()
  const projectsOverview = useLikeC4ProjectsOverview()
  return (
    <LikeC4ProjectsOverview
      view={projectsOverview}
      onNavigateToProject={changeProject}
    />
  )
}
