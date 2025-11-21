/**
 * ChunkPreview Component
 *
 * Displays text chunking configuration and preview.
 * Shows how input text will be split into chunks before extraction.
 */

import * as React from "react"
import { useAtom, useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  chunkingConfigAtom,
  chunksPreviewAtom,
  chunkStatsAtom,
  setChunkingStrategy
} from "@/state/chunking"
import { Layers, FileText, ChevronDown, ChevronUp, Settings2 } from "lucide-react"

/**
 * Chunk configuration panel
 */
function ChunkingConfig() {
  // Type assertion to work around @effect-atom version mismatch between atom and atom-react
  const [config] = useAtom(chunkingConfigAtom as any) as [
    import("@effect-ontology/core/Services/ChunkingStrategy").ChunkingConfig,
    (value: import("@effect-ontology/core/Services/ChunkingStrategy").ChunkingConfig) => void
  ]
  const [isExpanded, setIsExpanded] = React.useState(false)

  const handleStrategyChange = (strategy: "semantic" | "character") => {
    const windowSize = config.windowSize
    const overlap = config.overlap
    setChunkingStrategy(strategy, windowSize, overlap)
  }

  const handleWindowSizeChange = (value: number) => {
    setChunkingStrategy(config.strategy, value, Math.min(config.overlap, value - 1))
  }

  const handleOverlapChange = (value: number) => {
    setChunkingStrategy(config.strategy, config.windowSize, value)
  }

  return (
    <div className="space-y-3">
      {/* Strategy selector */}
      <div className="flex items-center gap-2">
        <Button
          variant={config.strategy === "semantic" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStrategyChange("semantic")}
          className="flex-1"
        >
          <Layers className="w-4 h-4 mr-1" />
          Semantic
        </Button>
        <Button
          variant={config.strategy === "character" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStrategyChange("character")}
          className="flex-1"
        >
          <FileText className="w-4 h-4 mr-1" />
          Character
        </Button>
      </div>

      {/* Advanced settings toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="w-3 h-3" />
        Advanced settings
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Advanced settings */}
      {isExpanded && (
        <div className="space-y-3 pt-2 border-t">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Window Size ({config.strategy === "semantic" ? "sentences" : "characters"})
            </label>
            <input
              type="range"
              min={config.strategy === "semantic" ? 1 : 100}
              max={config.strategy === "semantic" ? 20 : 5000}
              step={config.strategy === "semantic" ? 1 : 100}
              value={config.windowSize}
              onChange={(e) => handleWindowSizeChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-right text-muted-foreground">{config.windowSize}</div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Overlap ({config.strategy === "semantic" ? "sentences" : "characters"})
            </label>
            <input
              type="range"
              min={0}
              max={config.windowSize - 1}
              step={config.strategy === "semantic" ? 1 : 50}
              value={config.overlap}
              onChange={(e) => handleOverlapChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-right text-muted-foreground">{config.overlap}</div>
          </div>
        </div>
      )}

      {/* Strategy description */}
      <p className="text-xs text-muted-foreground">
        {config.description}
      </p>
    </div>
  )
}

/**
 * Single chunk display
 */
function ChunkCard({
  chunk,
  isSelected,
  onClick
}: {
  chunk: { index: number; text: string }
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`
        p-2 rounded-md border cursor-pointer transition-colors text-xs
        ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-muted-foreground">
          Chunk {chunk.index + 1}
        </span>
        <span className="text-muted-foreground">
          {chunk.text.length} chars
        </span>
      </div>
      <p className="text-foreground line-clamp-3">
        {chunk.text}
      </p>
    </div>
  )
}

/**
 * Chunk list with virtualization for large counts
 */
function ChunkList() {
  const chunksResult = useAtomValue(chunksPreviewAtom as any) as Result.Result<{ index: number; text: string }[], Error>
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const [showAll, setShowAll] = React.useState(false)

  return Result.match(chunksResult, {
    onInitial: () => (
      <div className="text-center text-muted-foreground text-sm py-4">
        Enter text to see chunk preview
      </div>
    ),
    onFailure: (failure) => (
      <div className="text-center text-destructive text-sm py-4">
        Error: {String(failure.cause)}
      </div>
    ),
    onSuccess: (success) => {
      const chunks = success.value
      if (chunks.length === 0) {
        return (
          <div className="text-center text-muted-foreground text-sm py-4">
            No chunks generated
          </div>
        )
      }

      const displayedChunks = showAll ? chunks : chunks.slice(0, 5)
      const hasMore = chunks.length > 5

      return (
        <div className="space-y-2">
          {displayedChunks.map((chunk) => (
            <ChunkCard
              key={chunk.index}
              chunk={chunk}
              isSelected={selectedIndex === chunk.index}
              onClick={() => setSelectedIndex(chunk.index === selectedIndex ? null : chunk.index)}
            />
          ))}

          {hasMore && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(true)}
              className="w-full text-muted-foreground"
            >
              Show {chunks.length - 5} more chunks
            </Button>
          )}

          {showAll && hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(false)}
              className="w-full text-muted-foreground"
            >
              Show less
            </Button>
          )}
        </div>
      )
    }
  })
}

/**
 * Chunk statistics display
 */
function ChunkStats() {
  const statsResult = useAtomValue(chunkStatsAtom as any) as Result.Result<
    { totalChunks: number; avgLength: number; totalLength: number },
    Error
  >

  return Result.match(statsResult, {
    onInitial: () => null,
    onFailure: () => null,
    onSuccess: (success) => {
      const stats = success.value
      if (stats.totalChunks === 0) return null

      return (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3 mt-3">
          <div>
            <span className="font-medium text-foreground">{stats.totalChunks}</span> chunks
          </div>
          <div>
            <span className="font-medium text-foreground">{stats.avgLength}</span> avg chars
          </div>
          <div>
            <span className="font-medium text-foreground">{stats.totalLength}</span> total chars
          </div>
        </div>
      )
    }
  })
}

/**
 * Main ChunkPreview component
 *
 * Combines configuration, preview list, and statistics.
 */
export function ChunkPreview() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Chunking Preview
        </CardTitle>
        <CardDescription>
          Configure how text is split into chunks for extraction
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChunkingConfig />
        <div className="border-t pt-4">
          <ChunkList />
        </div>
        <ChunkStats />
      </CardContent>
    </Card>
  )
}

/**
 * Compact version for sidebar use
 */
export function ChunkPreviewCompact() {
  const statsResult = useAtomValue(chunkStatsAtom as any) as Result.Result<
    { totalChunks: number; avgLength: number; totalLength: number },
    Error
  >
  const config = useAtomValue(chunkingConfigAtom as any) as import("@effect-ontology/core/Services/ChunkingStrategy").ChunkingConfig

  return (
    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1">
          <Layers className="w-3 h-3" />
          Chunking
        </span>
        <span className="text-xs text-muted-foreground">
          {config.strategy === "semantic" ? "Semantic" : "Character"}
        </span>
      </div>

      {Result.match(statsResult, {
        onInitial: () => null,
        onFailure: () => null,
        onSuccess: (success) => {
          const stats = success.value
          return (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                {stats.totalChunks} chunks
              </span>
              <span className="text-muted-foreground">
                ~{stats.avgLength} chars/chunk
              </span>
            </div>
          )
        }
      })}
    </div>
  )
}
