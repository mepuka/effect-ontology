import { createFileRoute } from '@tanstack/react-router'
import { useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/DataTable'
import { ColumnDef } from '@tanstack/react-table'
import { Loader2, Play, AlertCircle, CheckCircle, Layers } from 'lucide-react'
import { ChunkPreview, ChunkPreviewCompact } from '@/components/ChunkPreview'
import {
  ontologyClassesTableAtom,
  ontologyPropertiesTableAtom,
  extractedTriplesTableAtom,
  runningPromptsTableAtom
} from '@/state/tableData'
import {
  extractionInputAtom,
  extractionStatusAtom,
  runExtractionAtom,
  type ExtractionStatus
} from '@/state/extraction'

export const Route = createFileRoute('/extractions')({
  component: ExtractionsPage,
})

// Column definitions for each table
const classColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'label',
    header: 'Label',
  },
  {
    accessorKey: 'id',
    header: 'IRI',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.id}
      </span>
    ),
  },
  {
    accessorKey: 'propertiesCount',
    header: 'Properties',
  },
  {
    accessorKey: 'hasExpressions',
    header: 'Has Expressions',
    cell: ({ row }) => (row.original.hasExpressions ? 'Yes' : 'No'),
  },
]

const propertyColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'propertyIri',
    header: 'Property IRI',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.propertyIri.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'domain',
    header: 'Domain',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.domain.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'range',
    header: 'Range',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.range.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'minCount',
    header: 'Min',
    cell: ({ row }) => row.original.minCount ?? '—',
  },
  {
    accessorKey: 'maxCount',
    header: 'Max',
    cell: ({ row }) => row.original.maxCount ?? '—',
  },
]

const tripleColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'subject',
    header: 'Subject',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.subject.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'predicate',
    header: 'Predicate',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-depth-3">
        {row.original.predicate}
      </span>
    ),
  },
  {
    accessorKey: 'object',
    header: 'Object',
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.object}
      </span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className="rounded-full bg-secondary px-2 py-1 text-xs">
        {row.original.type}
      </span>
    ),
  },
]

const promptColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'classId',
    header: 'Class',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.classId.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'sectionType',
    header: 'Section',
  },
  {
    accessorKey: 'text',
    header: 'Prompt Text',
    cell: ({ row }) => (
      <div className="max-w-md truncate text-sm">
        {row.original.text}
      </div>
    ),
  },
  {
    accessorKey: 'fragmentCount',
    header: 'Fragments',
  },
  {
    accessorKey: 'sources',
    header: 'Sources',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.sources}
      </span>
    ),
  },
]

function ExtractionsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Extractions</h1>
        <p className="text-muted-foreground">
          Extract knowledge from text and browse ontology data
        </p>
      </div>

      <Tabs defaultValue="extract" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="extract">Extract</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="triples">Triples</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        <TabsContent value="extract" className="mt-6">
          <ExtractionView />
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <OntologyClassesView />
        </TabsContent>

        <TabsContent value="properties" className="mt-6">
          <OntologyPropertiesView />
        </TabsContent>

        <TabsContent value="triples" className="mt-6">
          <ExtractedTriplesView />
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <RunningPromptsView />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OntologyClassesView() {
  const result = useAtomValue(ontologyClassesTableAtom) as Result.Result<any, any>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ontology Classes</CardTitle>
        <CardDescription>
          Classes defined in the ontology with property counts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Result.match(result, {
          onInitial: () => <div className="text-muted-foreground">Loading...</div>,
          onFailure: (failure) => (
            <div className="text-destructive">Error: {String(failure.cause)}</div>
          ),
          onSuccess: (success) => (
            <DataTable
              columns={classColumns}
              data={success.value}
              pageSize={20}
            />
          ),
        })}
      </CardContent>
    </Card>
  )
}

function OntologyPropertiesView() {
  const result = useAtomValue(ontologyPropertiesTableAtom) as Result.Result<any, any>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ontology Properties</CardTitle>
        <CardDescription>
          Properties with domain, range, and cardinality constraints
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Result.match(result, {
          onInitial: () => <div className="text-muted-foreground">Loading...</div>,
          onFailure: (failure) => (
            <div className="text-destructive">Error: {String(failure.cause)}</div>
          ),
          onSuccess: (success) => (
            <DataTable
              columns={propertyColumns}
              data={success.value}
              pageSize={20}
            />
          ),
        })}
      </CardContent>
    </Card>
  )
}

function ExtractedTriplesView() {
  const result = useAtomValue(extractedTriplesTableAtom) as Result.Result<any, any>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extracted RDF Triples</CardTitle>
        <CardDescription>
          Subject-predicate-object triples derived from the ontology
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Result.match(result, {
          onInitial: () => <div className="text-muted-foreground">Loading...</div>,
          onFailure: (failure) => (
            <div className="text-destructive">Error: {String(failure.cause)}</div>
          ),
          onSuccess: (success) => (
            <DataTable
              columns={tripleColumns}
              data={success.value}
              pageSize={20}
            />
          ),
        })}
      </CardContent>
    </Card>
  )
}

function RunningPromptsView() {
  const result = useAtomValue(runningPromptsTableAtom) as Result.Result<any, any>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated Prompts</CardTitle>
        <CardDescription>
          Prompts generated from the ontology with provenance tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Result.match(result, {
          onInitial: () => <div className="text-muted-foreground">Loading...</div>,
          onFailure: (failure) => (
            <div className="text-destructive">Error: {String(failure.cause)}</div>
          ),
          onSuccess: (success) => (
            <DataTable
              columns={promptColumns}
              data={success.value}
              pageSize={10}
            />
          ),
        })}
      </CardContent>
    </Card>
  )
}

function ExtractionView() {
  const [inputText, setInputText] = useAtom(extractionInputAtom)
  const status = useAtomValue(extractionStatusAtom)
  const extractionResult = useAtomValue(runExtractionAtom)

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Input Panel */}
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Input Text</CardTitle>
          <CardDescription>
            Enter text to extract knowledge from
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to extract knowledge from...

Example: Alice is a software engineer at Acme Corp. She knows Bob, who works as a designer. They are both members of the Design Team."
            className="w-full h-64 p-3 border rounded-md resize-none text-sm font-mono"
          />

          {/* Compact chunk stats */}
          <ChunkPreviewCompact />

          <div className="flex items-center justify-between pt-2">
            <StatusBadge status={status} />
            <button
              disabled={status._tag === 'running' || !inputText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {status._tag === 'running' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Extract
                </>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Chunk Preview Panel */}
      <div className="col-span-1">
        <ChunkPreview />
      </div>

      {/* Results Panel */}
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Extraction Results</CardTitle>
          <CardDescription>
            Structured knowledge graph from input text
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status._tag === 'idle' && (
            <div className="text-muted-foreground text-sm text-center py-8">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Enter text and click Extract to see results
            </div>
          )}
          {status._tag === 'running' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Processing chunks...</span>
            </div>
          )}
          {status._tag === 'success' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                Extraction complete
              </div>
              <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-auto max-h-80">
                {JSON.stringify(status.result, null, 2)}
              </pre>
            </div>
          )}
          {status._tag === 'error' && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-sm text-destructive">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" />
                Extraction failed
              </div>
              {status.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: ExtractionStatus }) {
  switch (status._tag) {
    case 'idle':
      return <span className="text-xs text-muted-foreground">Ready</span>
    case 'running':
      return (
        <span className="text-xs text-blue-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      )
    case 'success':
      return (
        <span className="text-xs text-green-500 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Done
        </span>
      )
    case 'error':
      return (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      )
  }
}
