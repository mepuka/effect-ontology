import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { entityLink, entitiesLink } from "@/lib/routing"
import { toLabel } from "@/lib/namespace"

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
  deprecatedAt: string | null
  confidence: number | null
  evidenceText: string | null
}

interface TimelineEntityResponse {
  iri: string
  asOf: string | null
  claims: ClaimWithRank[]
  corrections: unknown[]
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// Confidence badge
function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const pct = Math.round(value * 100)
  const color = pct >= 90 ? "text-green-700 bg-green-50" : pct >= 70 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`} title={`Confidence: ${pct}%`}>
      {pct}%
    </span>
  )
}

// Rank indicator
function RankIndicator({ rank }: { rank: ClaimWithRank["rank"] }) {
  if (rank === "preferred") {
    return <span className="text-green-600" title="Preferred rank (current best)">★</span>
  }
  if (rank === "deprecated") {
    return <span className="text-red-500" title="Deprecated (superseded)">⊘</span>
  }
  return null
}

// Object value display - links to entity if it's an IRI
function ObjectValue({ claim, ontologyId }: { claim: ClaimWithRank; ontologyId: string }) {
  if (claim.objectType === "iri") {
    return (
      <Link
        to={entityLink(ontologyId, claim.objectValue)}
        className="text-blue-600 hover:text-blue-800 hover:underline"
      >
        {toLabel(claim.objectValue)}
      </Link>
    )
  }
  return <span className="font-mono text-gray-800">{claim.objectValue}</span>
}

// Source citation
function SourceCitation({ claim }: { claim: ClaimWithRank }) {
  const source = claim.source
  return (
    <div className="text-sm border-l-2 border-gray-200 pl-3 py-2">
      <div className="text-gray-700">
        {source.headline ? (
          <a
            href={source.uri}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.headline}
          </a>
        ) : (
          <span className="italic text-gray-500">Untitled source</span>
        )}
        {source.sourceName && (
          <span className="text-gray-500 text-xs ml-2">
            ({source.sourceName})
          </span>
        )}
        {source.publishedAt && (
          <span className="text-gray-400 text-xs ml-2">
            {formatDate(source.publishedAt)}
          </span>
        )}
      </div>
      {claim.evidenceText && (
        <blockquote className="mt-1 text-gray-600 italic text-sm leading-relaxed">
          "{claim.evidenceText}"
        </blockquote>
      )}
    </div>
  )
}

// Facts table row with expandable source
function FactRow({ claim, ontologyId }: { claim: ClaimWithRank; ontologyId: string }) {
  const [showSource, setShowSource] = useState(false)
  const deprecated = claim.rank === "deprecated"

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 ${deprecated ? "opacity-50" : ""}`}>
        <td className="py-3 pr-4 text-gray-600 align-top whitespace-nowrap">
          <span className={deprecated ? "line-through" : ""}>
            {toLabel(claim.predicateIri)}
          </span>
        </td>
        <td className={`py-3 pr-4 align-top ${deprecated ? "line-through" : ""}`}>
          <ObjectValue claim={claim} ontologyId={ontologyId} />
          {claim.validFrom && (
            <div className="text-xs text-gray-500 mt-0.5">
              {formatDate(claim.validFrom)} – {claim.validTo ? formatDate(claim.validTo) : "present"}
            </div>
          )}
        </td>
        <td className="py-3 pr-2 align-top w-12">
          <ConfidenceBadge value={claim.confidence} />
        </td>
        <td className="py-3 pr-2 align-top w-6">
          <RankIndicator rank={claim.rank} />
        </td>
        <td className="py-3 align-top w-20">
          <button
            onClick={() => setShowSource(!showSource)}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            {showSource ? "hide" : "source"}
          </button>
        </td>
      </tr>
      {showSource && (
        <tr className="bg-blue-50/50">
          <td colSpan={5} className="py-2 px-4">
            <SourceCitation claim={claim} />
          </td>
        </tr>
      )}
    </>
  )
}

// Infobox component (Wikipedia-style)
function Infobox({ iri, claims, ontologyId }: { iri: string; claims: ClaimWithRank[]; ontologyId: string }) {
  const label = toLabel(iri)
  const preferredClaims = claims.filter(c => c.rank === "preferred").slice(0, 6)

  // Derive types from claims
  const types = claims
    .filter(c => c.predicateIri.includes("type") || c.predicateIri.includes("Type"))
    .map(c => toLabel(c.objectValue))

  return (
    <div className="border border-gray-300 bg-gray-50 w-72 float-right ml-6 mb-4">
      <div className="bg-gray-200 px-3 py-2 border-b border-gray-300">
        <h2 className="font-semibold text-gray-800 text-center">{label}</h2>
      </div>
      <div className="p-3">
        {/* Types as badges */}
        {types.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3 justify-center">
            {types.map((type, i) => (
              <span
                key={i}
                className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded"
              >
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Key facts */}
        {preferredClaims.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {preferredClaims
                .filter(c => !c.predicateIri.includes("type"))
                .slice(0, 5)
                .map((claim) => (
                  <tr key={claim.id} className="border-t border-gray-200">
                    <th className="py-1.5 pr-2 text-left text-gray-600 font-normal align-top">
                      {toLabel(claim.predicateIri)}
                    </th>
                    <td className="py-1.5 text-gray-800">
                      {claim.objectType === "iri" ? (
                        <Link
                          to={entityLink(ontologyId, claim.objectValue)}
                          className="text-blue-600 hover:underline"
                        >
                          {toLabel(claim.objectValue)}
                        </Link>
                      ) : (
                        claim.objectValue
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* IRI footer */}
      <div className="bg-gray-100 px-3 py-2 border-t border-gray-300">
        <div className="text-xs text-gray-500 break-all font-mono">
          {iri}
        </div>
      </div>
    </div>
  )
}

// Main page component
export function OntologyPage() {
  const { ontologyId = "seattle", entityId } = useParams<{ ontologyId: string; entityId: string }>()

  // Decode the IRI from URL
  const iri = entityId ? decodeURIComponent(entityId) : ""

  const { data, isLoading, error } = useQuery<TimelineEntityResponse>({
    queryKey: ["entity", ontologyId, iri],
    queryFn: async () => {
      const res = await fetch(`/api/v1/ontologies/${ontologyId}/timeline/entities/${encodeURIComponent(iri)}`)
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Entity not found")
        }
        throw new Error(`Failed to fetch entity: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!iri,
  })

  const claims = data?.claims ?? []
  const label = toLabel(iri)

  // Group claims by predicate
  const claimsByPredicate = new Map<string, ClaimWithRank[]>()
  for (const claim of claims) {
    const pred = claim.predicateIri
    if (!claimsByPredicate.has(pred)) {
      claimsByPredicate.set(pred, [])
    }
    claimsByPredicate.get(pred)!.push(claim)
  }

  // Collect unique sources
  const uniqueSources = [...new Map(claims.map(c => [c.source.id, c.source])).values()]

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 w-64 mb-4 rounded" />
          <div className="h-4 bg-gray-200 w-96 mb-8 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="border-l-4 border-red-500 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-800">Entity Not Found</h1>
          <p className="text-red-600 mt-1">
            The entity could not be found in the knowledge base.
          </p>
          <p className="text-red-500 text-sm mt-2 font-mono">{iri}</p>
          <Link to={entitiesLink(ontologyId)} className="text-blue-600 hover:underline mt-4 inline-block">
            ← Back to entity browser
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to={entitiesLink(ontologyId)} className="hover:text-blue-600">Entities</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-700">{label}</span>
      </nav>

      {/* Main content area */}
      <article className="clearfix">
        {/* Infobox - floats right */}
        {claims.length > 0 && <Infobox iri={iri} claims={claims} ontologyId={ontologyId} />}

        {/* Title */}
        <header className="mb-6">
          <h1 className="text-3xl font-serif text-gray-900 mb-2">
            {label}
          </h1>
        </header>

        {/* No claims state */}
        {claims.length === 0 && (
          <div className="border border-gray-200 rounded p-8 text-center">
            <h3 className="text-lg font-medium text-gray-700 mb-2">No facts recorded</h3>
            <p className="text-gray-500 text-sm">
              This entity exists in the knowledge graph but has no claims yet.
            </p>
          </div>
        )}

        {/* All Facts section */}
        {claims.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Facts ({claims.length})
            </h2>
            <table className="w-full">
              <tbody>
                {claims.map((claim) => (
                  <FactRow key={claim.id} claim={claim} ontologyId={ontologyId} />
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Sources section */}
        {uniqueSources.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Sources ({uniqueSources.length})
            </h2>
            <div className="space-y-4">
              {uniqueSources.map((source, i) => (
                <div key={source.id} className="text-sm border-l-2 border-gray-200 pl-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 font-mono text-xs">[{i + 1}]</span>
                    <div className="flex-1">
                      <div className="text-gray-700">
                        {source.headline ? (
                          <a
                            href={source.uri}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.headline}
                          </a>
                        ) : (
                          <a
                            href={source.uri}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.uri}
                          </a>
                        )}
                        {source.sourceName && (
                          <span className="text-gray-500 text-xs ml-2">
                            ({source.sourceName})
                          </span>
                        )}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        Published: {formatDate(source.publishedAt)} · Ingested: {formatDate(source.ingestedAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </article>

      {/* Footer metadata */}
      <footer className="border-t border-gray-200 pt-4 mt-8 text-sm text-gray-500">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-xs">{iri}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>★ = preferred (current)</span>
            <span>⊘ = deprecated</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
