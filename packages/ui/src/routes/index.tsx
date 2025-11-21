import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Welcome to Effect Ontology</h1>
        <p className="text-muted-foreground">
          A powerful tool for ontology editing, knowledge graph extraction, and semantic analysis.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ontology Editor</CardTitle>
            <CardDescription>
              Edit and visualize RDF ontologies with topological sorting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/ontology">Open Editor</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knowledge Extraction</CardTitle>
            <CardDescription>
              Extract structured data from text using LLMs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/extractions">View Extractions</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Views</CardTitle>
            <CardDescription>
              Browse ontologies, chunks, triples, and prompts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
