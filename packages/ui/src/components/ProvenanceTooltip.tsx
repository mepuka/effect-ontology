/**
 * ProvenanceTooltip - Interactive tooltip showing prompt fragment metadata
 *
 * Displays provenance information when hovering over prompt fragments:
 * - Source class IRI and label
 * - Property information (if fragment is a property)
 * - Hierarchy depth with color coding
 * - Inheritance status
 * - Token count
 *
 * Based on design: PROVENANCE_VISUALIZATION_DESIGN.md
 */

import * as Tooltip from "@radix-ui/react-tooltip"
import { Info, Hash, Layers, ArrowRightCircle } from "lucide-react"
import type { PromptFragment } from "@effect-ontology/core/Prompt/Fragment"
import { Option } from "effect"
import { getDepthColor, getDepthBgColor, getDepthBorderColor, getDepthLabel } from "../utils/depth-colors"

export interface ProvenanceTooltipProps {
  /** The prompt fragment with provenance metadata */
  fragment: PromptFragment
  /** Child element to attach tooltip to */
  children: React.ReactNode
  /** Maximum depth in current ontology (for color scaling) */
  maxDepth?: number
  /** Callback when user clicks to navigate to source node */
  onNavigateToSource?: (sourceIri: string) => void
}

/**
 * ProvenanceTooltip component
 *
 * Wraps a prompt fragment element with an interactive tooltip showing metadata
 */
export const ProvenanceTooltip = ({
  fragment,
  children,
  maxDepth = 3,
  onNavigateToSource
}: ProvenanceTooltipProps): React.ReactElement => {
  const depth = Option.getOrElse(fragment.metadata.classDepth, () => 0)
  const classLabel = Option.getOrElse(fragment.metadata.classLabel, () => "Unknown")
  const sourceIri = Option.getOrNull(fragment.sourceIri)
  const propertyLabel = Option.getOrNull(fragment.metadata.propertyLabel)
  const propertyRange = Option.getOrNull(fragment.metadata.propertyRange)
  const isInherited = fragment.metadata.isInherited
  const tokenCount = fragment.metadata.tokenCount

  const depthColor = getDepthColor(depth, maxDepth)
  const depthBgColor = getDepthBgColor(depth, maxDepth)
  const depthBorderColor = getDepthBorderColor(depth, maxDepth)
  const depthLabelText = getDepthLabel(depth, maxDepth)

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="start"
            sideOffset={5}
            className="z-50 w-80 rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl animate-in fade-in-0 zoom-in-95"
          >
            {/* Header with class info */}
            <div className="mb-3 pb-3 border-b border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center gap-2 font-semibold ${depthColor}`}>
                  <Layers className="w-4 h-4" />
                  <span className="text-sm">{classLabel}</span>
                </div>
                <div className={`px-2 py-0.5 rounded text-xs font-mono ${depthBgColor} ${depthColor} border ${depthBorderColor}`}>
                  {depthLabelText} (D{depth})
                </div>
              </div>
              {sourceIri && (
                <div className="text-xs text-slate-400 font-mono break-all">
                  {sourceIri}
                </div>
              )}
            </div>

            {/* Property information (if applicable) */}
            {propertyLabel && (
              <div className="mb-3 pb-3 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300">Property</span>
                </div>
                <div className="text-sm text-slate-200 mb-1">
                  {propertyLabel}
                  {propertyRange && (
                    <span className="text-slate-400"> → {propertyRange}</span>
                  )}
                </div>
                {isInherited && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500 text-blue-400 text-xs">
                    <ArrowRightCircle className="w-3 h-3" />
                    Inherited
                  </div>
                )}
              </div>
            )}

            {/* Fragment metadata */}
            <div className="space-y-2">
              <MetadataRow
                label="Fragment Type"
                value={fragment.fragmentType.replace(/_/g, " ")}
              />
              <MetadataRow
                label="Token Count"
                value={`~${tokenCount} tokens`}
              />
            </div>

            {/* Navigation hint */}
            {sourceIri && onNavigateToSource && (
              <button
                onClick={() => onNavigateToSource(sourceIri)}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-blue-500/10 border border-blue-500 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition-colors"
              >
                <ArrowRightCircle className="w-3 h-3" />
                View in Graph
              </button>
            )}

            <Tooltip.Arrow className="fill-slate-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

/**
 * Metadata row component
 */
const MetadataRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-400 flex items-center gap-1">
      <Info className="w-3 h-3" />
      {label}
    </span>
    <span className="text-slate-200 font-mono">{value}</span>
  </div>
)
