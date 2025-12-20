/**
 * LinksPage
 *
 * Lists ingested links with filtering and pagination.
 *
 * @since 2.0.0
 * @module pages/LinksPage
 */

import { useAtomValue, useAtomSet } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { Link, useParams } from "react-router-dom"
import { Plus, RefreshCw } from "lucide-react"
import { linksAtom, linksFiltersAtom } from "@/atoms/api"
import { ingestLink, linkLink } from "@/lib/routing"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

function getStatusVariant(status: string) {
  switch (status) {
    case "enriched":
      return "default" as const
    case "processed":
      return "secondary" as const
    case "failed":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

export function LinksPage() {
  const { ontologyId = "seattle" } = useParams<{ ontologyId: string }>()
  const result = useAtomValue(linksAtom(ontologyId))
  const setFilters = useAtomSet(linksFiltersAtom)

  const handleRefresh = () => {
    // Trigger re-fetch by updating filters with same values
    setFilters((prev) => ({ ...prev }))
  }

  const isLoading = result.waiting

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ingested Links</h1>
          <p className="text-muted-foreground">
            Manage documents fetched via Jina Reader
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link to={ingestLink(ontologyId)}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Ingest URL
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {Result.isSuccess(result)
                ? `${result.value.links.length} links`
                : "Loading..."}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {Result.match(result, {
            onInitial: () => (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ),
            onFailure: (failure) => (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load links: {String(failure.cause)}
                </AlertDescription>
              </Alert>
            ),
            onSuccess: (success) =>
              success.value.links.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No links ingested yet.{" "}
                  <Link to={ingestLink(ontologyId)} className="text-primary underline">
                    Ingest your first URL
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Headline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Words</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {success.value.links.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <Link
                            to={linkLink(ontologyId, link.id)}
                            className="hover:underline text-foreground"
                          >
                            {link.headline || link.sourceUri || link.id}
                          </Link>
                          {link.organization && (
                            <div className="text-xs text-muted-foreground">
                              {link.organization}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(link.status)}>
                            {link.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {link.sourceType}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {link.wordCount?.toLocaleString() ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
