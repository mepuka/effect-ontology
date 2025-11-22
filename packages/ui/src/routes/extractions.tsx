import { createFileRoute } from '@tanstack/react-router'
import { useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
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
    header: 'Property',
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
        {row.original.range}
      </span>
    ),
  },
  {
    accessorKey: 'minCardinality',
    header: 'Min',
    cell: ({ row }) => row.original.minCardinality ?? '0',
  },
  {
    accessorKey: 'maxCardinality',
    header: 'Max',
    cell: ({ row }) => row.original.maxCardinality ?? '*',
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
    accessorKey: 'section',
    header: 'Section',
    cell: ({ row }) => (
      <span className="rounded-full bg-secondary px-2 py-1 text-xs">
        {row.original.section}
      </span>
    ),
  },
  {
    accessorKey: 'fragmentType',
    header: 'Type',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.fragmentType}
      </span>
    ),
  },
  {
    accessorKey: 'text',
    header: 'Content',
    cell: ({ row }) => (
      <div className="max-w-md truncate text-sm font-mono">
        {row.original.text}
      </div>
    ),
  },
  {
    accessorKey: 'sourceIri',
    header: 'Source',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.sourceIri.split(/[/#]/).pop()}
      </span>
    ),
  },
  {
    accessorKey: 'tokenCount',
    header: 'Tokens',
    cell: ({ row }) => (
      <span className="text-xs tabular-nums">
        {row.original.tokenCount}
      </span>
    ),
  },
]

function ExtractionsPage() {
  const classesResult = useAtomValue(ontologyClassesTableAtom) as Result.Result<any, any>
  const propertiesResult = useAtomValue(ontologyPropertiesTableAtom) as Result.Result<any, any>
  const triplesResult = useAtomValue(extractedTriplesTableAtom) as Result.Result<any, any>
  const status = useAtomValue(extractionStatusAtom)

  // Calculate stats
  const classCount = Result.match(classesResult, {
    onInitial: () => 0,
    onFailure: () => 0,
    onSuccess: (s) => s.value.length,
  })
  const propertyCount = Result.match(propertiesResult, {
    onInitial: () => 0,
    onFailure: () => 0,
    onSuccess: (s) => s.value.length,
  })
  const tripleCount = Result.match(triplesResult, {
    onInitial: () => 0,
    onFailure: () => 0,
    onSuccess: (s) => s.value.length,
  })

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background">
      {/* Header bar with stats */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">Live Data Viewer</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-depth-2" />
              <span className="text-muted-foreground">Classes:</span>
              <span className="font-mono font-medium">{classCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-depth-4" />
              <span className="text-muted-foreground">Properties:</span>
              <span className="font-mono font-medium">{propertyCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-depth-5" />
              <span className="text-muted-foreground">Triples:</span>
              <span className="font-mono font-medium">{tripleCount}</span>
            </span>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="extract" className="h-full flex flex-col">
          <div className="border-b bg-card/50 px-6">
            <TabsList className="h-10 rounded-none bg-transparent p-0 gap-0">
              <TabsTrigger
                value="extract"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Extract
              </TabsTrigger>
              <TabsTrigger
                value="ontology"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Ontology
              </TabsTrigger>
              <TabsTrigger
                value="triples"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Triples
              </TabsTrigger>
              <TabsTrigger
                value="prompts"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Prompts
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="extract" className="mt-0 h-full">
              <ExtractionView />
            </TabsContent>

            <TabsContent value="ontology" className="mt-0 h-full p-6">
              <div className="grid grid-cols-2 gap-6 h-full">
                <div className="overflow-auto">
                  <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">Classes</h2>
                  {Result.match(classesResult, {
                    onInitial: () => <LoadingState />,
                    onFailure: (failure) => <ErrorState error={String(failure.cause)} />,
                    onSuccess: (success) => (
                      <DataTable columns={classColumns} data={success.value} pageSize={15} />
                    ),
                  })}
                </div>
                <div className="overflow-auto">
                  <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">Properties</h2>
                  {Result.match(propertiesResult, {
                    onInitial: () => <LoadingState />,
                    onFailure: (failure) => <ErrorState error={String(failure.cause)} />,
                    onSuccess: (success) => (
                      <DataTable columns={propertyColumns} data={success.value} pageSize={15} />
                    ),
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="triples" className="mt-0 h-full p-6">
              <div className="h-full overflow-auto">
                <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">RDF Triples</h2>
                {Result.match(triplesResult, {
                  onInitial: () => <LoadingState />,
                  onFailure: (failure) => <ErrorState error={String(failure.cause)} />,
                  onSuccess: (success) => (
                    <DataTable columns={tripleColumns} data={success.value} pageSize={20} />
                  ),
                })}
              </div>
            </TabsContent>

            <TabsContent value="prompts" className="mt-0 h-full p-6">
              <RunningPromptsView />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      Loading...
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 text-destructive py-4">
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm">{error}</span>
    </div>
  )
}


function RunningPromptsView() {
  const result = useAtomValue(runningPromptsTableAtom) as Result.Result<any, any>

  return (
    <div className="h-full overflow-auto">
      <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
        Generated Prompts
      </h2>
      {Result.match(result, {
        onInitial: () => <LoadingState />,
        onFailure: (failure) => <ErrorState error={String(failure.cause)} />,
        onSuccess: (success) => (
          <DataTable columns={promptColumns} data={success.value} pageSize={15} />
        ),
      })}
    </div>
  )
}

function ExtractionView() {
  const [inputText, setInputText] = useAtom(extractionInputAtom)
  const status = useAtomValue(extractionStatusAtom)
  const _extractionResult = useAtomValue(runExtractionAtom)

  return (
    <div className="h-full grid grid-cols-3 gap-0 divide-x">
      {/* Input Panel */}
      <div className="flex flex-col p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Input</h2>
          <button
            disabled={status._tag === 'running' || !inputText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status._tag === 'running' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Running
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Extract
              </>
            )}
          </button>
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter text to extract knowledge from..."
          className="flex-1 p-3 border rounded-md resize-none text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3">
          <ChunkPreviewCompact />
        </div>
      </div>

      {/* Chunk Preview Panel */}
      <div className="p-4 overflow-auto">
        <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">Chunks</h2>
        <ChunkPreview />
      </div>

      {/* Results Panel */}
      <div className="flex flex-col p-4">
        <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">Output</h2>
        <div className="flex-1 overflow-auto">
          {status._tag === 'idle' && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Layers className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No extraction yet</p>
            </div>
          )}
          {status._tag === 'running' && (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Processing...</p>
            </div>
          )}
          {status._tag === 'success' && (
            <div className="h-full flex flex-col">
              <div className="flex items-center gap-2 text-green-600 text-sm mb-3">
                <CheckCircle className="w-4 h-4" />
                <span>Complete</span>
                <span className="ml-auto text-xs text-muted-foreground font-mono">turtle</span>
              </div>
              <pre className="flex-1 text-xs font-mono bg-muted/50 p-3 rounded overflow-auto whitespace-pre-wrap">
                {status.result}
              </pre>
            </div>
          )}
          {status._tag === 'error' && (
            <div className="p-4 bg-destructive/5 border border-destructive/20 rounded text-sm text-destructive">
              <div className="flex items-center gap-2 mb-2 font-medium">
                <AlertCircle className="w-4 h-4" />
                Error
              </div>
              <p className="text-xs">{status.message}</p>
            </div>
          )}
        </div>
      </div>
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
