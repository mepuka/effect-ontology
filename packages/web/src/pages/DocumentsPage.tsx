import { useAtomValue, useAtomSet } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { Link, useParams } from "react-router-dom"
import { documentsAtom, documentsFiltersAtom } from "@/atoms/api"
import { documentLink } from "@/lib/routing"
import type { DocumentsFilter } from "@/services/ApiClient"
import { Schema } from "@effect-ontology/core-v2/Domain"

type ArticleSearchResult = typeof Schema.ArticleSearchResult.Type

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  })
}

function DocumentCard({ result, ontologyId }: { result: ArticleSearchResult; ontologyId: string }) {
  const { article, claimCount, conflictCount } = result
  // Article from schema uses DateTime type - convert to string for display
  const publishedAt = typeof article.publishedAt === "string"
    ? article.publishedAt
    : article.publishedAt.toString()

  return (
    <Link
      to={documentLink(ontologyId, article.id)}
      className="group block border-l-2 border-stone-300 hover:border-amber-600
                 bg-stone-50/50 hover:bg-amber-50/30 transition-all duration-200
                 pl-5 pr-6 py-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-lg text-stone-900 group-hover:text-amber-900
                         transition-colors leading-tight line-clamp-2">
            {article.headline || "Untitled Document"}
          </h2>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-stone-500">
            {article.sourceName && (
              <>
                <span className="font-medium">{article.sourceName}</span>
                <span>·</span>
              </>
            )}
            <span>{formatDate(publishedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 mt-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {claimCount} {claimCount === 1 ? "claim" : "claims"}
        </span>
        {conflictCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
          </span>
        )}
      </div>
    </Link>
  )
}

function DocumentFiltersBar({
  filters,
  onChange
}: {
  filters: DocumentsFilter
  onChange: (updater: (prev: DocumentsFilter) => DocumentsFilter) => void
}) {
  const currentSource = filters.sources?.[0] ?? ""

  return (
    <div className="flex items-center gap-4 text-sm">
      <select
        value={currentSource}
        onChange={(e) => onChange((prev) => ({
          ...prev,
          sources: e.target.value ? [e.target.value] : undefined,
          offset: 0
        }))}
        className="border border-stone-300 rounded px-3 py-1.5 bg-white text-stone-700
                   focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
      >
        <option value="">All sources</option>
        <option value="seattletimes.com">Seattle Times</option>
        <option value="kuow.org">KUOW</option>
        <option value="seattle.gov">Seattle.gov</option>
      </select>
    </div>
  )
}

function Pagination({
  total,
  offset,
  limit,
  hasMore,
  onPageChange
}: {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  onPageChange: (newOffset: number) => void
}) {
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-200">
      <span className="text-sm text-stone-500">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1.5 text-sm border border-stone-300 rounded
                     hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-sm text-stone-600 px-2">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(offset + limit)}
          disabled={!hasMore}
          className="px-3 py-1.5 text-sm border border-stone-300 rounded
                     hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function DocumentsPage() {
  const { ontologyId = "seattle" } = useParams<{ ontologyId: string }>()
  const result = useAtomValue(documentsAtom(ontologyId))
  const setFilters = useAtomSet(documentsFiltersAtom(ontologyId))
  const limit = 20

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-2">
          Source Documents
        </p>
        <h1 className="font-serif text-3xl text-stone-900 mb-3">
          Documents
        </h1>
        <p className="text-stone-600 leading-relaxed">
          Source articles and documents from which claims have been extracted.
          Click a document to view its extracted knowledge.
        </p>
      </header>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <DocumentFiltersBar
          filters={Result.isSuccess(result) ? { limit, offset: 0 } : { limit, offset: 0 }}
          onChange={setFilters}
        />
        {Result.isSuccess(result) && (
          <span className="text-sm text-stone-500">
            {result.value.total} {result.value.total === 1 ? "document" : "documents"}
          </span>
        )}
      </div>

      {Result.match(result, {
        onInitial: () => (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-stone-100 rounded animate-pulse" />
            ))}
          </div>
        ),
        onFailure: (failure) => (
          <div className="border-l-4 border-red-400 bg-red-50 p-4">
            <p className="text-red-800 text-sm">
              {String(failure.cause)}
            </p>
            <p className="text-red-600 text-xs mt-1">
              Ensure the API server is running at localhost:8080
            </p>
          </div>
        ),
        onSuccess: (success) => {
          const data = success.value

          if (data.articles.length === 0) {
            return (
              <div className="text-center py-16 border border-stone-200 rounded">
                <h3 className="text-lg font-medium text-stone-700 mb-2">No documents found</h3>
                <p className="text-stone-500 text-sm">
                  No documents have been ingested yet
                </p>
              </div>
            )
          }

          return (
            <>
              <div className="space-y-3">
                {data.articles.map((article) => (
                  <DocumentCard key={article.article.id} result={article} ontologyId={ontologyId} />
                ))}
              </div>
              <Pagination
                total={data.total}
                offset={data.offset}
                limit={limit}
                hasMore={data.hasMore}
                onPageChange={(newOffset) => setFilters((prev) => ({ ...prev, offset: newOffset }))}
              />
            </>
          )
        }
      })}
    </div>
  )
}
