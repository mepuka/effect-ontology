import { createFileRoute } from '@tanstack/react-router'
import { useAtomValue } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/DataTable'
import { ColumnDef } from '@tanstack/react-table'
import {
  ontologyClassesTableAtom,
  ontologyPropertiesTableAtom,
  extractedTriplesTableAtom,
  runningPromptsTableAtom
} from '@/state/tableData'

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
        <h1 className="text-3xl font-bold mb-2">Data Views</h1>
        <p className="text-muted-foreground">
          Browse ontology classes, properties, extracted triples, and generated prompts
        </p>
      </div>

      <Tabs defaultValue="classes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="triples">Triples</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

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
