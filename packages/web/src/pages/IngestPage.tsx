/**
 * IngestPage
 *
 * Form for ingesting new URLs via Jina Reader.
 *
 * @since 2.0.0
 * @module pages/IngestPage
 */

import { useState, useEffect } from "react"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { useNavigate, Link, useParams } from "react-router-dom"
import { ArrowLeft, Eye, Upload } from "lucide-react"
import { toast } from "sonner"
import { ingestAtom, previewAtom } from "@/atoms/api"
import { linksLink, linkLink } from "@/lib/routing"
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

export function IngestPage() {
  const { ontologyId = "seattle" } = useParams<{ ontologyId: string }>()
  const [url, setUrl] = useState("")
  const navigate = useNavigate()

  // Function atoms - trigger with set, observe result
  const ingest = useAtomSet(ingestAtom)
  const ingestResult = useAtomValue(ingestAtom)

  const preview = useAtomSet(previewAtom)
  const previewResult = useAtomValue(previewAtom)

  const handlePreview = () => {
    if (url.trim()) {
      preview(url.trim())
    }
  }

  const handleIngest = () => {
    if (url.trim()) {
      ingest({ url: url.trim(), ontologyId })
    }
  }

  // React to ingest success
  useEffect(() => {
    if (Result.isSuccess(ingestResult)) {
      const data = ingestResult.value
      if (data.duplicate) {
        toast.info("Content already exists (duplicate)")
      } else {
        toast.success("Link ingested successfully")
      }
      navigate(linkLink(ontologyId, data.id))
    }
  }, [ingestResult, navigate, ontologyId])

  const isLoading = ingestResult.waiting || previewResult.waiting
  const isValidUrl = url.trim().match(/^https?:\/\/.+/)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to={linksLink(ontologyId)}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingest URL</CardTitle>
          <CardDescription>
            Fetch and store content from a URL using Jina Reader
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">URL</label>
            <Input
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValidUrl) {
                  handleIngest()
                }
              }}
            />
            {url && !isValidUrl && (
              <p className="text-sm text-destructive">
                Please enter a valid URL starting with http:// or https://
              </p>
            )}
          </div>

          {/* Preview Result */}
          {previewResult.waiting && (
            <Card className="bg-muted/50">
              <CardContent className="py-4">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4 mt-2" />
              </CardContent>
            </Card>
          )}

          {Result.isSuccess(previewResult) && (
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <pre className="whitespace-pre-wrap overflow-auto max-h-64 text-xs">
                  {JSON.stringify(previewResult.value, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {Result.isFailure(previewResult) && (
            <Alert variant="destructive">
              <AlertDescription>
                Preview failed: {String(previewResult.cause)}
              </AlertDescription>
            </Alert>
          )}

          {Result.isFailure(ingestResult) && (
            <Alert variant="destructive">
              <AlertDescription>
                Ingestion failed: {String(ingestResult.cause)}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!isValidUrl || isLoading}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button onClick={handleIngest} disabled={!isValidUrl || isLoading}>
            <Upload className="h-4 w-4" />
            {ingestResult.waiting ? "Ingesting..." : "Ingest"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
