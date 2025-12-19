import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"

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

// Extract local name from IRI
function localName(iri: string): string {
  const match = iri.match(/[#/]([^#/]+)$/)
  return match ? match[1] : iri
}

// Make IRI URL-safe for routing
function encodeIri(iri: string): string {
  return encodeURIComponent(iri)
}

// Format to human-readable label
function toLabel(iri: string): string {
  return localName(iri)
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
}

// Format date for display
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Format time
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Group claims by date
function groupByDate(claims: ClaimWithRank[]): Map<string, ClaimWithRank[]> {
  const groups = new Map<string, ClaimWithRank[]>()
  for (const claim of claims) {
    const date = claim.assertedAt?.split("T")[0] || "unknown"
    const existing = groups.get(date) || []
    existing.push(claim)
    groups.set(date, existing)
  }
  return groups
}

// ClaimCard component
function ClaimCard({ claim }: { claim: ClaimWithRank }) {
  const [expanded, setExpanded] = useState(false)

  const rankStyles = {
    preferred: "border-l-green-500",
    normal: "border-l-gray-300",
    deprecated: "border-l-red-400 opacity-60",
  }

  const rankLabel = {
    preferred: "current",
    normal: "",
    deprecated: "superseded",
  }

  return (
    <div
      className={`
        border border-gray-200 border-l-4 ${rankStyles[claim.rank]}
        bg-white p-4 hover:bg-gray-50 transition-colors
      `}
    >
      {/* Subject -> Predicate -> Object */}
      <div className={`flex items-baseline gap-2 flex-wrap ${claim.rank === "deprecated" ? "line-through" : ""}`}>
        <Link
          to={`/ontology/${encodeIri(claim.subjectIri)}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {toLabel(claim.subjectIri)}
        </Link>
        <span className="text-gray-500 text-sm">
          {toLabel(claim.predicateIri)}
        </span>
        {claim.objectType === "iri" ? (
          <Link
            to={`/ontology/${encodeIri(claim.objectValue)}`}
            className="text-blue-600 hover:underline"
          >
            {toLabel(claim.objectValue)}
          </Link>
        ) : (
          <span className="text-gray-800 font-mono text-sm">{claim.objectValue}</span>
        )}
      </div>

      {/* Metadata line */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        {rankLabel[claim.rank] && (
          <span className={claim.rank === "preferred" ? "text-green-600" : "text-red-500"}>
            {rankLabel[claim.rank]}
          </span>
        )}
        {claim.confidence !== null && (
          <span>{Math.round(claim.confidence * 100)}% confident</span>
        )}
        {claim.validFrom && (
          <span>
            valid: {formatDate(claim.validFrom)}
            {claim.validTo ? ` – ${formatDate(claim.validTo)}` : " – present"}
          </span>
        )}
        <span className="text-gray-400">
          {formatTime(claim.assertedAt)}
        </span>
      </div>

      {/* Source info */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-sm text-gray-600">
          <span className="text-gray-400">from: </span>
          {claim.source.headline ? (
            <a
              href={claim.source.uri}
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {claim.source.headline}
            </a>
          ) : (
            <a
              href={claim.source.uri}
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {claim.source.uri}
            </a>
          )}
          {claim.source.sourceName && (
            <span className="text-gray-400 ml-1">({claim.source.sourceName})</span>
          )}
        </div>

        {/* Evidence (expandable) */}
        {claim.evidenceText && (
          <div className="mt-2">
            <button
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "− hide evidence" : "+ show evidence"}
            </button>
            {expanded && (
              <blockquote className="mt-2 text-sm text-gray-600 italic border-l-2 border-gray-200 pl-3">
                "{claim.evidenceText}"
              </blockquote>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Date divider component
function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <span className="text-sm text-gray-500 font-medium whitespace-nowrap">
        {date === "unknown" ? "Unknown date" : formatDate(date)}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

// Filter dropdown
function FilterDropdown({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="all">All facts</option>
      <option value="preferred">Current facts only</option>
      <option value="deprecated">Superseded facts only</option>
    </select>
  )
}

// Main TimelinePage component
export function TimelinePage() {
  const [filter, setFilter] = useState("all")

  const { data, isLoading, error } = useQuery<TimelineClaimsResponse>({
    queryKey: ["timeline", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" })
      if (filter !== "all") {
        params.set("rank", filter)
      }
      const res = await fetch(`/api/v1/timeline/claims?${params}`)
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
      return res.json()
    },
  })

  const claims = data?.claims || []
  const groupedClaims = groupByDate(claims)
  const sortedDates = Array.from(groupedClaims.keys()).sort().reverse()

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-gray-900">
            Timeline
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Facts as they were extracted from source documents
          </p>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <span className="text-sm text-gray-500">
              {data.total} facts
            </span>
          )}
          <FilterDropdown value={filter} onChange={setFilter} />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="border-l-4 border-red-500 bg-red-50 p-4">
          <h3 className="font-semibold text-red-800">Failed to load timeline</h3>
          <p className="text-red-600 text-sm mt-1">
            {(error as Error).message}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && claims.length === 0 && (
        <div className="border border-gray-200 rounded p-12 text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">No facts found</h3>
          <p className="text-gray-500 text-sm">
            {filter !== "all"
              ? "Try changing the filter"
              : "The knowledge graph is empty"}
          </p>
        </div>
      )}

      {/* Claims list grouped by date */}
      {!isLoading && !error && claims.length > 0 && (
        <div className="space-y-1">
          {sortedDates.map((date) => (
            <div key={date}>
              <DateDivider date={date} />
              <div className="space-y-3">
                {groupedClaims.get(date)?.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
