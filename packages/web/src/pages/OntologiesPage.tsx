import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"

interface OntologySummary {
  id: string
  iri: string
  title: string
  description?: string
  version: string
  classCount: number
  propertyCount: number
  importCount: number
}

interface OntologyListResponse {
  ontologies: OntologySummary[]
}

function OntologyCard({ ontology }: { ontology: OntologySummary }) {
  return (
    <Link
      to={`/ontologies/${ontology.id}`}
      className="group block border-l-2 border-stone-300 hover:border-amber-600
                 bg-stone-50/50 hover:bg-amber-50/30 transition-all duration-200
                 pl-5 pr-6 py-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-xl text-stone-900 group-hover:text-amber-900
                         transition-colors leading-tight">
            {ontology.title}
          </h2>
          <code className="text-xs text-stone-500 font-mono mt-1 block truncate">
            {ontology.iri}
          </code>
        </div>
        <span className="text-xs font-mono text-stone-400 bg-stone-100 px-2 py-1 rounded shrink-0">
          v{ontology.version}
        </span>
      </div>

      {ontology.description && (
        <p className="text-sm text-stone-600 mt-3 leading-relaxed line-clamp-2">
          {ontology.description}
        </p>
      )}

      <div className="flex items-center gap-6 mt-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {ontology.classCount} classes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          {ontology.propertyCount} properties
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          {ontology.importCount} imports
        </span>
      </div>
    </Link>
  )
}

export function OntologiesPage() {
  const { data, isLoading, error } = useQuery<OntologyListResponse>({
    queryKey: ["ontologies"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ontologies")
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
      return res.json()
    }
  })

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-2">
          Schema Registry
        </p>
        <h1 className="font-serif text-3xl text-stone-900 mb-3">
          Ontologies
        </h1>
        <p className="text-stone-600 leading-relaxed">
          Available knowledge graph schemas. Each ontology extends
          W3C standard vocabularies for semantic interoperability.
        </p>
      </header>

      {/* Standards reference */}
      <div className="bg-stone-100/50 border border-stone-200 rounded px-5 py-4 mb-8">
        <p className="text-xs font-mono uppercase tracking-wide text-stone-500 mb-2">
          Based on W3C Standards
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <a href="https://www.w3.org/TR/rdf11-primer/"
             target="_blank" rel="noopener"
             className="text-stone-600 hover:text-amber-700 hover:underline">
            RDF 1.1
          </a>
          <a href="https://www.w3.org/TR/owl2-overview/"
             target="_blank" rel="noopener"
             className="text-stone-600 hover:text-amber-700 hover:underline">
            OWL 2
          </a>
          <a href="https://www.w3.org/TR/shacl/"
             target="_blank" rel="noopener"
             className="text-stone-600 hover:text-amber-700 hover:underline">
            SHACL
          </a>
          <a href="https://www.w3.org/TR/skos-reference/"
             target="_blank" rel="noopener"
             className="text-stone-600 hover:text-amber-700 hover:underline">
            SKOS
          </a>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-stone-500">
          Loading ontologies...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-l-4 border-red-400 bg-red-50 p-4">
          <p className="text-red-800 text-sm">
            {error instanceof Error ? error.message : "Failed to load ontologies"}
          </p>
          <p className="text-red-600 text-xs mt-1">
            Ensure the API server is running at localhost:8080
          </p>
        </div>
      )}

      {/* Ontology list */}
      {data && (
        <div className="space-y-4">
          {data.ontologies.map((ont) => (
            <OntologyCard key={ont.id} ontology={ont} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && data.ontologies.length === 0 && (
        <div className="text-center py-16 text-stone-500">
          No ontologies registered.
        </div>
      )}
    </div>
  )
}
