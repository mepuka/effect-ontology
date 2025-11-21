import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export const Route = createFileRoute('/extractions')({
  component: ExtractionsPage,
})

function ExtractionsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Data Views</h1>
        <p className="text-muted-foreground">
          Browse ontologies, chunked text, extracted triples, and running prompts
        </p>
      </div>

      <Tabs defaultValue="ontology" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ontology">Ontology</TabsTrigger>
          <TabsTrigger value="chunks">Chunks</TabsTrigger>
          <TabsTrigger value="triples">Triples</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        <TabsContent value="ontology" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Ontology Classes & Properties</CardTitle>
              <CardDescription>
                View classes, properties, and relationships in the ontology
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Table view coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chunks" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Chunked Text</CardTitle>
              <CardDescription>
                View text chunks with metadata and embeddings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Table view coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triples" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Triples</CardTitle>
              <CardDescription>
                View subject-predicate-object triples from extractions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Table view coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Running Prompts</CardTitle>
              <CardDescription>
                Monitor prompt execution in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Real-time view coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
