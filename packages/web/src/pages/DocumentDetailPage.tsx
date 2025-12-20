import { useState, useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { documentsLink } from "@/lib/routing"
import { documentDetailAtom } from "@/atoms/api"
import { toLabel } from "@/lib/namespace"
import { Schema } from "@effect-ontology/core-v2/Domain"

// =============================================================================
// Types
// =============================================================================

type ClaimWithRank = typeof Schema.ClaimWithRank.Type

// =============================================================================
// Utilities
// =============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })
}


// =============================================================================
// Components
// =============================================================================

function ClaimCard({
  claim,
  isActive,
  onHover,
  onLeave
}: {
  claim: ClaimWithRank
  isActive: boolean
  onHover: () => void
  onLeave: () => void
}) {
  const rankColors = {
    preferred: "border-l-emerald-500 bg-emerald-50/30",
    normal: "border-l-stone-300 bg-white",
    deprecated: "border-l-stone-300 bg-stone-50 opacity-60"
  }

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`
        border-l-2 pl-3 pr-4 py-3 transition-all duration-150
        ${rankColors[claim.rank]}
        ${isActive ? "ring-2 ring-amber-400 ring-inset" : ""}
      `}
    >
      {/* Subject -> Predicate -> Object */}
      <div className={`text-sm ${claim.rank === "deprecated" ? "line-through" : ""}`}>
        <span className="font-medium text-stone-900">
          {toLabel(claim.subjectIri)}
        </span>
        <span className="text-stone-500 mx-1.5">
          {toLabel(claim.predicateIri)}
        </span>
        {claim.objectType === "iri" ? (
          <span className="text-blue-700">{toLabel(claim.objectValue)}</span>
        ) : (
          <span className="font-mono text-stone-700">{claim.objectValue}</span>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 mt-2 text-xs text-stone-500">
        {claim.rank === "preferred" && (
          <span className="text-emerald-600">current</span>
        )}
        {claim.rank === "deprecated" && (
          <span className="text-stone-400">superseded</span>
        )}
        {claim.confidence !== null && (
          <span>{Math.round(claim.confidence * 100)}%</span>
        )}
      </div>

      {/* Evidence text */}
      {claim.evidenceText && (
        <blockquote className="mt-2 text-xs text-stone-600 italic border-l border-stone-200 pl-2 line-clamp-2">
          "{claim.evidenceText}"
        </blockquote>
      )}
    </div>
  )
}

function ClaimsSidebar({
  claims,
  activeClaimId,
  onClaimHover,
  onClaimLeave
}: {
  claims: ReadonlyArray<ClaimWithRank>
  activeClaimId: string | null
  onClaimHover: (id: string) => void
  onClaimLeave: () => void
}) {
  // Group claims by subject
  const groupedClaims = useMemo(() => {
    const groups = new Map<string, ClaimWithRank[]>()
    for (const claim of claims) {
      const existing = groups.get(claim.subjectIri) || []
      existing.push(claim)
      groups.set(claim.subjectIri, existing)
    }
    return groups
  }, [claims])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400">
          Extracted Claims
        </h2>
        <span className="text-xs text-stone-500">{claims.length} total</span>
      </div>

      <div className="space-y-4">
        {Array.from(groupedClaims.entries()).map(([subjectIri, subjectClaims]) => (
          <div key={subjectIri}>
            <h3 className="text-xs font-medium text-stone-700 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {toLabel(subjectIri)}
            </h3>
            <div className="space-y-1.5">
              {subjectClaims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  isActive={claim.id === activeClaimId}
                  onHover={() => onClaimHover(claim.id)}
                  onLeave={onClaimLeave}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export function DocumentDetailPage() {
  const { ontologyId = "seattle", id } = useParams<{ ontologyId: string; id: string }>()
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null)

  const result = useAtomValue(documentDetailAtom({ ontologyId, id: id! }))

  // Check if we have any evidence to show
  const hasEvidence = Result.isSuccess(result) && result.value.claims.some((c) => c.evidenceText)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          to={documentsLink(ontologyId)}
          className="text-sm text-stone-500 hover:text-amber-700 hover:underline"
        >
          ← Documents
        </Link>
      </nav>

      {Result.match(result, {
        onInitial: () => (
          <div className="py-16 text-center text-stone-500">
            Loading document...
          </div>
        ),
        onFailure: (failure) => (
          <>
            <div className="border-l-4 border-red-400 bg-red-50 p-4">
              <p className="text-red-800 text-sm">
                {String(failure.cause)}
              </p>
            </div>
            <Link to={documentsLink(ontologyId)} className="text-sm text-blue-600 hover:underline mt-4 inline-block">
              ← Back to documents
            </Link>
          </>
        ),
        onSuccess: (success) => {
          const data = success.value
          const publishedAt = typeof data.article.publishedAt === "string"
            ? data.article.publishedAt
            : data.article.publishedAt.toString()

          return (
            <>
              {/* Header */}
              <header className="mb-8 border-b border-stone-200 pb-6">
                <h1 className="font-serif text-2xl text-stone-900 mb-2 leading-tight">
                  {data.article.headline || "Untitled Document"}
                </h1>
                <div className="flex items-center gap-4 text-sm text-stone-500">
                  {data.article.sourceName && (
                    <span className="font-medium">{data.article.sourceName}</span>
                  )}
                  <span>{formatDate(publishedAt)}</span>
                  <a
                    href={data.article.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View source →
                  </a>
                </div>
                <div className="flex items-center gap-6 mt-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {data.claims.length} claims
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    {data.entityCount} entities
                  </span>
                  {data.conflictCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      {data.conflictCount} conflicts
                    </span>
                  )}
                </div>
              </header>

              {/* Main content: Article + Claims sidebar */}
              <div className="flex gap-8">
                {/* Article content */}
                <article className="flex-1 min-w-0">
                  <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-4">
                    Evidence Spans
                  </h2>
                  {hasEvidence ? (
                    <div className="prose prose-stone prose-sm max-w-none font-serif leading-relaxed">
                      {data.claims
                        .filter((c) => c.evidenceText)
                        .map((claim) => (
                          <blockquote
                            key={claim.id}
                            onMouseEnter={() => setActiveClaimId(claim.id)}
                            onMouseLeave={() => setActiveClaimId(null)}
                            className={`
                              border-l-2 pl-4 py-2 my-4 transition-all duration-150 cursor-pointer
                              ${claim.id === activeClaimId
                                ? "border-amber-400 bg-amber-50"
                                : "border-stone-200 hover:border-amber-300"
                              }
                              ${claim.rank === "deprecated" ? "opacity-60 line-through" : ""}
                            `}
                          >
                            <p className="text-stone-700 not-italic">"{claim.evidenceText}"</p>
                            <footer className="text-xs text-stone-500 mt-1">
                              → {toLabel(claim.subjectIri)} {toLabel(claim.predicateIri)}{" "}
                              <span className="font-mono">{claim.objectType === "iri" ? toLabel(claim.objectValue) : claim.objectValue}</span>
                            </footer>
                          </blockquote>
                        ))}
                    </div>
                  ) : (
                    <div className="text-stone-500 text-sm py-8 text-center border border-stone-200 rounded">
                      No evidence text available for this document.
                    </div>
                  )}
                </article>

                {/* Claims sidebar */}
                <aside className="w-80 shrink-0">
                  <ClaimsSidebar
                    claims={data.claims}
                    activeClaimId={activeClaimId}
                    onClaimHover={setActiveClaimId}
                    onClaimLeave={() => setActiveClaimId(null)}
                  />
                </aside>
              </div>
            </>
          )
        }
      })}
    </div>
  )
}
