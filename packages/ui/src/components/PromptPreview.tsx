import { useAtomValue, Result } from "@effect-atom/atom-react"
import { Option } from "effect"
import { fullPromptAtom, nodePromptMapAtom, selectedNodeAtom } from "../state/store"
import type { PromptPackage, PromptFragment } from "../types/PromptTypes"
import { renderPrompt } from "../types/PromptTypes"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  Code2,
  FileText,
  Layers,
  Loader2,
  Workflow,
  Binary,
  Zap
} from "lucide-react"

/**
 * PromptPreview - Right panel showing generated prompts
 *
 * UPDATED: Now uses real StructuredPrompt from prompt generation service
 * Visualizes the monoid structure and fragment composition
 *
 * Features:
 * - Shows PromptFragments with source metadata
 * - Visualizes monoid combination (fragments stack/combine)
 * - Displays metadata about prompt generation
 * - Evidence pattern badges
 */
export const PromptPreview = (): React.ReactElement => {
  const fullPromptResult = useAtomValue(fullPromptAtom) as Result.Result<PromptPackage, any>
  const nodePromptMapResult = useAtomValue(nodePromptMapAtom) as Result.Result<Map<string, PromptPackage>, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  return Result.match(fullPromptResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Workflow className="w-8 h-8 text-blue-500" />
          </motion.div>
          <div className="text-sm text-slate-600 font-medium">Generating prompts...</div>
          <div className="text-xs text-slate-400 mt-1">Folding ontology structure</div>
        </div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">
            Prompt Generation Failed
          </div>
          <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
            {String(failure.cause)}
          </div>
        </div>
      </div>
    ),
    onSuccess: (fullPromptSuccess) => {
      const fullPackage = fullPromptSuccess.value

      // If a node is selected, show its specific prompt
      if (Option.isSome(selectedNode)) {
        return Result.match(nodePromptMapResult, {
          onInitial: () => <LoadingState />,
          onFailure: () => <FullOntologyView promptPackage={fullPackage} />,
          onSuccess: (mapSuccess) => {
            const promptMap = mapSuccess.value
            const nodePackage = promptMap.get(selectedNode.value)

            if (nodePackage) {
              return <NodeSpecificView promptPackage={nodePackage} nodeId={selectedNode.value} />
            }

            return <FullOntologyView promptPackage={fullPackage} />
          }
        })
      }

      return <FullOntologyView promptPackage={fullPackage} />
    }
  })
}

/**
 * Loading state component
 */
const LoadingState = () => (
  <div className="flex items-center justify-center h-full bg-slate-900">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    >
      <Loader2 className="w-6 h-6 text-blue-400" />
    </motion.div>
  </div>
)

/**
 * Node-specific prompt view
 */
const NodeSpecificView = ({
  promptPackage,
  nodeId
}: {
  promptPackage: PromptPackage
  nodeId: string
}) => {
  const { prompt, metadata } = promptPackage
  const rendered = renderPrompt(prompt)

  return (
    <motion.div
      key={nodeId}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col bg-slate-900 text-slate-100"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Binary className="w-4 h-4 text-green-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Prompt Fragment
          </h2>
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
            Monoid Element
          </span>
        </div>
        <div className="text-xs text-slate-400">
          {metadata.fragmentCount} fragments • {metadata.characterCount} chars
        </div>
      </div>

      {/* Fragment Sections */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* System Fragments */}
        {prompt.systemFragments.length > 0 && (
          <FragmentSection
            title="System Context"
            icon={<Layers className="w-4 h-4" />}
            color="purple"
            fragments={prompt.systemFragments}
          />
        )}

        {/* User Fragments */}
        {prompt.userFragments.length > 0 && (
          <FragmentSection
            title="User Instructions"
            icon={<FileText className="w-4 h-4" />}
            color="blue"
            fragments={prompt.userFragments}
          />
        )}

        {/* Example Fragments */}
        {prompt.exampleFragments.length > 0 && (
          <FragmentSection
            title="Examples"
            icon={<Sparkles className="w-4 h-4" />}
            color="amber"
            fragments={prompt.exampleFragments}
          />
        )}
      </div>

      {/* Footer Metadata */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span>
            {metadata.processedElements.classes} classes •{" "}
            {metadata.processedElements.properties} properties
          </span>
          <span className="text-blue-400">Click another node to compare</span>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Full ontology prompt view
 */
const FullOntologyView = ({ promptPackage }: { promptPackage: PromptPackage }) => {
  const { prompt, metadata } = promptPackage
  const rendered = renderPrompt(prompt)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <Workflow className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Complete Ontology Prompt
          </h2>
          <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">
            Catamorphism Result
          </span>
        </div>
        <div className="text-xs text-slate-400">
          {metadata.fragmentCount} total fragments combined via monoid
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-700">
        <div className="grid grid-cols-3 gap-4 text-center">
          <MetadataCard
            label="Classes"
            value={metadata.processedElements.classes}
            icon={<Layers className="w-4 h-4" />}
          />
          <MetadataCard
            label="Fragments"
            value={metadata.fragmentCount}
            icon={<Binary className="w-4 h-4" />}
          />
          <MetadataCard
            label="Characters"
            value={metadata.characterCount.toLocaleString()}
            icon={<Code2 className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Fragment Sections */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {prompt.systemFragments.length > 0 && (
          <FragmentSection
            title="System Context"
            icon={<Layers className="w-4 h-4" />}
            color="purple"
            fragments={prompt.systemFragments}
            showMonoidBadge
          />
        )}

        {prompt.userFragments.length > 0 && (
          <FragmentSection
            title="User Instructions"
            icon={<FileText className="w-4 h-4" />}
            color="blue"
            fragments={prompt.userFragments}
            showMonoidBadge
          />
        )}

        {prompt.exampleFragments.length > 0 && (
          <FragmentSection
            title="Examples"
            icon={<Sparkles className="w-4 h-4" />}
            color="amber"
            fragments={prompt.exampleFragments}
            showMonoidBadge
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3" />
            <span>Patterns: {metadata.patternsApplied.join(", ")}</span>
          </div>
          <span className="text-violet-400">Select a node for details</span>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Metadata card component
 */
const MetadataCard = ({
  label,
  value,
  icon
}: {
  label: string
  value: number | string
  icon: React.ReactNode
}) => (
  <div className="bg-slate-900/50 rounded-lg p-3">
    <div className="flex items-center justify-center gap-2 text-slate-400 mb-1">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
  </div>
)

/**
 * Fragment section component - shows a collection of fragments
 */
const FragmentSection = ({
  title,
  icon,
  color,
  fragments,
  showMonoidBadge = false
}: {
  title: string
  icon: React.ReactNode
  color: "purple" | "blue" | "amber"
  fragments: ReadonlyArray<PromptFragment>
  showMonoidBadge?: boolean
}) => {
  const colorMap = {
    purple: {
      border: "border-purple-500",
      bg: "bg-purple-500/10",
      text: "text-purple-400",
      badge: "bg-purple-500/20 text-purple-400"
    },
    blue: {
      border: "border-blue-500",
      bg: "bg-blue-500/10",
      text: "text-blue-400",
      badge: "bg-blue-500/20 text-blue-400"
    },
    amber: {
      border: "border-amber-500",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-400"
    }
  }

  const colors = colorMap[color]

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border-l-4 ${colors.border} ${colors.bg} p-4 rounded-r`}
    >
      <div className={`flex items-center justify-between mb-3`}>
        <div className={`flex items-center gap-2 ${colors.text} font-semibold`}>
          {icon}
          <h3>### {title} ###</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${colors.badge} font-semibold`}>
            {fragments.length} {fragments.length === 1 ? "fragment" : "fragments"}
          </span>
          {showMonoidBadge && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 font-semibold">
              ⊕
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {fragments.map((fragment, idx) => (
          <FragmentCard key={idx} fragment={fragment} index={idx} />
        ))}
      </div>
    </motion.section>
  )
}

/**
 * Individual fragment card with metadata
 */
const FragmentCard = ({
  fragment,
  index
}: {
  fragment: PromptFragment
  index: number
}) => {
  const patternColors: Record<string, string> = {
    "schema-context": "bg-blue-500/20 text-blue-300",
    "format-constraint": "bg-green-500/20 text-green-300",
    "example-template": "bg-amber-500/20 text-amber-300",
    "few-shot": "bg-purple-500/20 text-purple-300"
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-slate-800/50 rounded p-3 border border-slate-700/50"
    >
      {/* Fragment metadata */}
      {(fragment.source || fragment.pattern) && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          {fragment.source && (
            <span className="text-slate-400">
              <span className="text-slate-500">from:</span> {fragment.source.label}
            </span>
          )}
          {fragment.pattern && (
            <span
              className={`px-2 py-0.5 rounded font-mono ${patternColors[fragment.pattern] || "bg-slate-700 text-slate-300"}`}
            >
              {fragment.pattern}
            </span>
          )}
        </div>
      )}

      {/* Fragment content */}
      <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
        {fragment.content}
      </div>
    </motion.div>
  )
}
