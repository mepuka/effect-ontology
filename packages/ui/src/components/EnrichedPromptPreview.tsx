/**
 * EnrichedPromptPreview - Prompt preview with provenance tooltips
 *
 * Displays enriched prompts with interactive provenance metadata.
 * Each fragment is wrapped with ProvenanceTooltip showing source info.
 *
 * Based on design: PROVENANCE_VISUALIZATION_DESIGN.md
 */

import { useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom-react"
import { Atom } from "@effect-atom/atom"
import { motion } from "framer-motion"
import { Sparkles, Code2, FileText, Layers } from "lucide-react"
import type { PromptFragment } from "@effect-ontology/core/Prompt/Fragment"
import { enrichedPromptsAtom, selectedNodeAtom, metadataAtom } from "../state/store"
import { ProvenanceTooltip } from "./ProvenanceTooltip"
import { Option } from "effect"

/**
 * EnrichedPromptPreview - Main component
 */
export const EnrichedPromptPreview = (): React.ReactElement => {
  const enrichedResult = useAtomValue(enrichedPromptsAtom) as Result.Result<any, any>
  const metadataResult = useAtomValue(metadataAtom) as Result.Result<any, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  // Show loading if not ready
  if (Result.isInitial(enrichedResult) || Result.isInitial(metadataResult)) {
    return (
      <div className="flex items-center justify-center h-full bg-linear-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Sparkles className="w-8 h-8 text-slate-400" />
          </motion.div>
          <div className="text-sm text-slate-500">Generating enriched prompts...</div>
        </div>
      </div>
    )
  }

  // Show error if either failed
  if (Result.isFailure(enrichedResult) || Result.isFailure(metadataResult)) {
    const failure = Result.isFailure(enrichedResult) ? enrichedResult : metadataResult
    return (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">Enriched Prompt Generation Failed</div>
          <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
            {String((failure as any).failure?.cause || "Unknown error")}
          </div>
        </div>
      </div>
    )
  }

  // Both succeeded - render enriched prompts
  return Result.match(enrichedResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-linear-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Sparkles className="w-8 h-8 text-slate-400" />
          </motion.div>
          <div className="text-sm text-slate-500">Generating enriched prompts...</div>
        </div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">Enriched Prompt Generation Failed</div>
          <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
            {String(failure.cause)}
          </div>
        </div>
      </div>
    ),
    onSuccess: (enrichedSuccess) => {
      const metadata = Result.match(metadataResult, {
        onInitial: () => null,
        onFailure: () => null,
        onSuccess: (s) => s.value
      })

      const maxDepth = metadata?.hierarchyTree.maxDepth ?? 3
      const enrichedPrompt = enrichedSuccess.value

      // Get selected IRI for highlighting (don't filter, show all)
      const selectedIri = Option.getOrNull(selectedNode)
      const allFragments = enrichedPrompt.system

      // Navigation callback: fragment → graph node
      const handleNavigateToSource = (sourceIri: string) => {
        Atom.set(selectedNodeAtom, Option.some(sourceIri))
      }

      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-full flex flex-col bg-slate-900 text-slate-100"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-700 bg-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Enriched Ontology Prompt
              </h2>
            </div>
            <div className="text-xs text-slate-400">
              {selectedIri
                ? `${enrichedPrompt.system.length} fragments • Selected node highlighted`
                : `${enrichedPrompt.system.length} fragments with full provenance tracking`}
            </div>
          </div>

          {/* Prompt Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-sm">
            <PromptSection
              title="SYSTEM"
              icon={<Layers className="w-4 h-4" />}
              color="purple"
              fragments={allFragments}
              maxDepth={maxDepth}
              selectedIri={selectedIri}
              onNavigateToSource={handleNavigateToSource}
            />
          </div>

          {/* Footer Stats */}
          <div className="px-6 py-3 border-t border-slate-700 bg-slate-800 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>
                {enrichedPrompt.system.length} fragments · ~
                {enrichedPrompt.system.reduce((sum: number, f: PromptFragment) => sum + f.metadata.tokenCount, 0)}{" "}
                tokens
              </span>
              <span className="text-blue-400">
                {selectedIri ? "Selected fragments highlighted • Click another node" : "Select a node to highlight"}
              </span>
            </div>
          </div>
        </motion.div>
      )
    }
  })
}

/**
 * Reusable prompt section component with provenance tooltips
 */
const PromptSection = ({
  title,
  icon,
  color,
  fragments,
  maxDepth,
  selectedIri,
  onNavigateToSource
}: {
  title: string
  icon: React.ReactNode
  color: "purple" | "green" | "amber" | "violet" | "blue"
  fragments: PromptFragment[]
  maxDepth: number
  selectedIri: string | null
  onNavigateToSource?: (sourceIri: string) => void
}) => {
  const colorMap = {
    purple: "border-purple-500 bg-purple-500/10",
    green: "border-green-500 bg-green-500/10",
    amber: "border-amber-500 bg-amber-500/10",
    violet: "border-violet-500 bg-violet-500/10",
    blue: "border-blue-500 bg-blue-500/10"
  }

  const headerColorMap = {
    purple: "text-purple-400",
    green: "text-green-400",
    amber: "text-amber-400",
    violet: "text-violet-400",
    blue: "text-blue-400"
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border-l-4 ${colorMap[color]} p-4 rounded-r`}
    >
      <div className={`flex items-center gap-2 mb-3 ${headerColorMap[color]} font-semibold`}>
        {icon}
        <h3>### {title} ###</h3>
      </div>
      <div className="space-y-1 text-slate-300">
        {fragments.map((fragment, i) => {
          const fragmentSourceIri = Option.getOrNull(fragment.sourceIri)
          const isSelected = selectedIri && fragmentSourceIri === selectedIri

          return (
            <ProvenanceTooltip
              key={i}
              fragment={fragment}
              maxDepth={maxDepth}
              onNavigateToSource={onNavigateToSource}
            >
              <div
                className={`${
                  fragment.text === ""
                    ? "h-2"
                    : `px-2 py-1 rounded cursor-help transition-colors ${
                        isSelected
                          ? "bg-blue-500/20 border-l-2 border-blue-400 hover:bg-blue-500/30"
                          : "hover:bg-slate-800"
                      }`
                }`}
              >
                {fragment.text}
              </div>
            </ProvenanceTooltip>
          )
        })}
      </div>
    </motion.section>
  )
}
