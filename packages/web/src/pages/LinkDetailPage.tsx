/**
 * LinkDetailPage
 *
 * Displays detailed information about a single ingested link.
 *
 * @since 2.0.0
 * @module pages/LinkDetailPage
 */

import { useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { linkDetailAtom } from "@/atoms/api"
import { linksLink } from "@/lib/routing"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

function formatDate(date: unknown): string {
  if (!date) return "-"
  try {
    return new Date(date as string).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  } catch {
    return "-"
  }
}

export function LinkDetailPage() {
  const { ontologyId = "seattle", id } = useParams<{ ontologyId: string; id: string }>()
  const result = useAtomValue(linkDetailAtom({ ontologyId, id: id! }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={linksLink(ontologyId)}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      {Result.match(result, {
        onInitial: () => <DetailSkeleton />,
        onFailure: (failure) => (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load link: {String(failure.cause)}
            </AlertDescription>
          </Alert>
        ),
        onSuccess: (success) => {
          const link = success.value
          return (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold">
                  {link.headline || "Untitled"}
                </h1>
                {link.description && (
                  <p className="text-muted-foreground mt-1">{link.description}</p>
                )}
                {link.sourceUri && (
                  <a
                    href={link.sourceUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    {link.sourceUri}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge>{link.status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span>{link.sourceType}</span>
                    </div>
                    {link.author && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Author</span>
                        <span>{link.author}</span>
                      </div>
                    )}
                    {link.organization && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Organization</span>
                        <span>{link.organization}</span>
                      </div>
                    )}
                    {link.language && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Language</span>
                        <span>{link.language}</span>
                      </div>
                    )}
                    {link.wordCount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Word Count</span>
                        <span>{link.wordCount.toLocaleString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Timestamps</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Published</span>
                      <span>{formatDate(link.publishedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fetched</span>
                      <span>{formatDate(link.fetchedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Enriched</span>
                      <span>{formatDate(link.enrichedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Processed</span>
                      <span>{formatDate(link.processedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Topics & Entities */}
              {(link.topics.length > 0 || link.keyEntities.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {link.topics.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Topics</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {link.topics.map((topic: string, i: number) => (
                          <Badge key={i} variant="secondary">
                            {topic}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {link.keyEntities.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Key Entities</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {link.keyEntities.map((entity: string, i: number) => (
                          <Badge key={i} variant="outline">
                            {entity}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Storage Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Storage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span>{link.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Content Hash</span>
                    <span className="truncate max-w-xs">{link.contentHash}</span>
                  </div>
                  {link.storageUri && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Storage URI</span>
                      <span className="truncate max-w-xs">{link.storageUri}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Error */}
              {link.errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription>{link.errorMessage}</AlertDescription>
                </Alert>
              )}
            </div>
          )
        }
      })}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
