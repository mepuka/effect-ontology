import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { entityLink } from "../lib/routing"
import { localName } from "@/lib/namespace"

// Types matching backend API
interface ClaimWithRank {
  id: string
  subjectIri: string
  predicateIri: string
  objectValue: string
  objectType?: "iri" | "literal" | "typed_literal"
  rank: "preferred" | "normal" | "deprecated"
  source: {
    id: string
    uri: string
    headline: string | null
    sourceName: string | null
    publishedAt: string
    ingestedAt: string
  }
  validFrom: string | null
  validTo: string | null
  assertedAt: string
  confidence: number | null
  evidenceText: string | null
}

interface TimelineClaimsResponse {
  claims: ClaimWithRank[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

interface EntitySummary {
  iri: string
  localName: string
  label: string
  types: string[]
  claimCount: number
  latestClaim: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Derive entities from claims
function deriveEntities(claims: ClaimWithRank[]): EntitySummary[] {
  const entityMap = new Map<string, {
    iri: string
    claimCount: number
    types: Set<string>
    latestClaim: string
  }>()

  for (const claim of claims) {
    if (!entityMap.has(claim.subjectIri)) {
      entityMap.set(claim.subjectIri, {
        iri: claim.subjectIri,
        claimCount: 0,
        types: new Set(),
        latestClaim: claim.assertedAt
      })
    }

    const entry = entityMap.get(claim.subjectIri)!
    entry.claimCount++

    if (claim.assertedAt > entry.latestClaim) {
      entry.latestClaim = claim.assertedAt
    }

    if (claim.predicateIri.includes("type") || claim.predicateIri.includes("Type")) {
      entry.types.add(localName(claim.objectValue))
    }
  }

  return Array.from(entityMap.values())
    .map((e) => ({
      iri: e.iri,
      localName: localName(e.iri),
      label: localName(e.iri).replace(/([A-Z])/g, " $1").trim(),
      types: Array.from(e.types),
      claimCount: e.claimCount,
      latestClaim: e.latestClaim
    }))
    .sort((a, b) => b.latestClaim.localeCompare(a.latestClaim))
}

// Stats card
function StatsCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  )
}

// Entity row
function EntityRow({ entity, ontologyId }: { entity: EntitySummary; ontologyId: string }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/50">
      <td className="py-3 pr-4">
        <Link
          to={entityLink(ontologyId, entity.iri)}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {entity.label}
        </Link>
        <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
          {entity.iri}
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {entity.types.length > 0 ? (
            entity.types.slice(0, 3).map((type) => (
              <span
                key={type}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
              >
                {type}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 text-gray-600 text-sm text-right tabular-nums">
        {entity.claimCount}
      </td>
      <td className="py-3 text-gray-500 text-sm text-right whitespace-nowrap">
        {formatDate(entity.latestClaim)}
      </td>
    </tr>
  )
}

// Search box
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search entities..."
        className="w-full border border-gray-300 rounded px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <svg
        className="absolute right-3 top-2.5 h-4 w-4 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </div>
  )
}

export function OntologyIndex() {
  const { ontologyId = "seattle" } = useParams<{ ontologyId: string }>()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const { data: claimsData, isLoading, error } = useQuery<TimelineClaimsResponse>({
    queryKey: ["claims-for-entities", ontologyId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/ontologies/${ontologyId}/claims?limit=500`)
      if (!res.ok) {
        throw new Error(`Failed to fetch claims: ${res.status}`)
      }
      return res.json()
    },
  })

  const allEntities = claimsData ? deriveEntities(claimsData.claims) : []
  const allTypes = [...new Set(allEntities.flatMap(e => e.types))].sort()
  const uniqueSources = new Set(claimsData?.claims.map(c => c.source.sourceName).filter(Boolean))

  let entities = allEntities
  if (search) {
    const q = search.toLowerCase()
    entities = entities.filter(e =>
      e.label.toLowerCase().includes(q) ||
      e.localName.toLowerCase().includes(q) ||
      e.iri.toLowerCase().includes(q)
    )
  }
  if (typeFilter) {
    entities = entities.filter(e => e.types.includes(typeFilter))
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-serif text-gray-900 mb-2">
          {ontologyId.charAt(0).toUpperCase() + ontologyId.slice(1)} Knowledge Graph
        </h1>
        <p className="text-gray-600">
          Structured facts extracted from source documents.
        </p>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatsCard label="Entities" value={allEntities.length} />
        <StatsCard label="Facts" value={claimsData?.total ?? 0} />
        <StatsCard label="Sources" value={uniqueSources.size} />
        <StatsCard label="Types" value={allTypes.length} />
      </div>

      {/* Search and filter */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <SearchBox value={search} onChange={setSearch} />
        </div>
        <select
          value={typeFilter || ""}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {allTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="border border-gray-200 rounded p-8 text-center text-gray-500">
          Loading knowledge graph...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-4 mb-6">
          <h3 className="font-semibold text-amber-800">Could not load data</h3>
          <p className="text-amber-700 text-sm mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <p className="text-amber-600 text-sm mt-2">
            Make sure the API server is running at <code className="bg-amber-100 px-1 rounded">localhost:8080</code>
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && entities.length === 0 && (
        <div className="border border-gray-200 rounded p-12 text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">No entities found</h3>
          <p className="text-gray-500 text-sm">
            {search || typeFilter
              ? "Try adjusting your search or filter"
              : "The knowledge graph is empty. Add some source documents to extract facts."}
          </p>
        </div>
      )}

      {/* Entities table */}
      {!isLoading && !error && entities.length > 0 && (
        <div className="border border-gray-200 rounded">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                  Entity
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                  Types
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                  Facts
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <EntityRow key={entity.iri} entity={entity} ontologyId={ontologyId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
