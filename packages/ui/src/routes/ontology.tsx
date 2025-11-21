import { createFileRoute } from '@tanstack/react-router'
import { App } from '@/App'

export const Route = createFileRoute('/ontology')({
  component: OntologyPage,
})

function OntologyPage() {
  // For now, render the existing App component
  // Later we'll refactor this to be a proper ontology editor page
  return <App />
}
