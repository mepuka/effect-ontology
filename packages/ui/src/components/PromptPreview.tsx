import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import type { StructuredPrompt } from "@effect-ontology/core/Prompt"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import type { OntologyNode } from "@effect-ontology/core/Graph/Types"
import { generatedPromptsAtom, ontologyGraphAtom, selectedNodeAtom } from "../state/store"
import { Result } from "@effect-atom/atom-react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Code2, FileText, Layers } from "lucide-react"

/**
 * PromptPreview - Right panel component that shows generated prompts
 *
 * Features:
 * - Displays class-specific prompt sections when a node is selected
 * - Shows the full ontology context
 * - Visualizes how properties accumulate
 * - Bidirectional linking ready (highlight source on click)
 */
export const PromptPreview = (): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const promptsResult = useAtomValue(generatedPromptsAtom) as Result.Result<any, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  // Show loading if either graph or prompts are loading
  if (Result.isInitial(graphResult) || Result.isInitial(promptsResult)) {
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
          <div className="text-sm text-slate-500">Generating prompts...</div>
        </div>
      </div>
    )
  }

  // Show error if either failed
  if (Result.isFailure(graphResult) || Result.isFailure(promptsResult)) {
    const failure = Result.isFailure(graphResult) ? graphResult : promptsResult
    return (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">Prompt Generation Failed</div>
          <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
            {String((failure as any).failure?.cause || "Unknown error")}
          </div>
        </div>
      </div>
    )
  }

  // Both succeeded - render prompts
  return Result.match(promptsResult, {
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
          <div className="text-sm text-slate-500">Generating prompts...</div>
        </div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">Prompt Generation Failed</div>
          <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
            {String(failure.cause)}
          </div>
        </div>
      </div>
    ),
    onSuccess: (promptsSuccess) => {
      const { nodePrompts, universalPrompt, context } = promptsSuccess.value

      // If a node is selected, show its generated prompt
      if (Option.isSome(selectedNode)) {
        const promptOption = HashMap.get(nodePrompts, selectedNode.value)
        if (Option.isSome(promptOption)) {
          const contextNodes = context.nodes as HashMap.HashMap<string, OntologyNode>
          const nodeOption = HashMap.get(contextNodes, selectedNode.value)
          const nodeName = Option.match(nodeOption, {
            onNone: () => selectedNode.value,
            onSome: (node) => (isClassNode(node) ? node.label : selectedNode.value)
          })

          return <SelectedNodePrompt
            nodeId={selectedNode.value}
            nodeName={nodeName}
            prompt={promptOption.value as StructuredPrompt}
          />
        }
      }

      // Otherwise show the full ontology overview
      return <FullOntologyPrompt
        nodePrompts={nodePrompts}
        universalPrompt={universalPrompt}
        context={context}
      />
    }
  })
}

/**
 * Display prompt for a selected class node
 */
const SelectedNodePrompt = ({
  nodeId,
  nodeName,
  prompt
}: {
  nodeId: string
  nodeName: string
  prompt: StructuredPrompt
}) => {
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
          <Code2 className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Prompt Fragment
          </h2>
        </div>
        <div className="text-xs text-slate-400">
          Generated from: <span className="text-blue-400 font-semibold">{nodeName}</span>
        </div>
      </div>

      {/* Prompt Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-sm">
        {/* System Section */}
        {prompt.system.length > 0 && (
          <PromptSection
            title="SYSTEM"
            icon={<Layers className="w-4 h-4" />}
            color="purple"
            lines={[...prompt.system]}
          />
        )}

        {/* User Context Section */}
        {prompt.user.length > 0 && (
          <PromptSection
            title="USER CONTEXT"
            icon={<FileText className="w-4 h-4" />}
            color="green"
            lines={[...prompt.user]}
          />
        )}

        {/* Examples Section */}
        {prompt.examples.length > 0 && (
          <PromptSection
            title="EXAMPLES"
            icon={<Sparkles className="w-4 h-4" />}
            color="amber"
            lines={[...prompt.examples]}
          />
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>
            {prompt.system.length} system · {prompt.user.length} user · {prompt.examples.length} examples
          </span>
          <span className="text-blue-400">Click another node to compare</span>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Display full ontology overview
 */
const FullOntologyPrompt = ({
  nodePrompts,
  universalPrompt,
  context
}: {
  nodePrompts: HashMap.HashMap<string, StructuredPrompt>
  universalPrompt: StructuredPrompt
  context: any
}) => {
  const classCount = HashMap.size(nodePrompts)

  // Combine all node prompts for overview
  const allNodePrompts = Array.from(HashMap.values(nodePrompts))
  const combinedSystemLines = allNodePrompts.flatMap(p => p.system)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col bg-linear-to-br from-slate-900 to-slate-800 text-slate-100"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Ontology Overview
          </h2>
        </div>
        <div className="text-xs text-slate-400">
          Complete system prompt for this ontology
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-sm">
        {/* Universal Properties */}
        {universalPrompt.system.length > 0 && (
          <PromptSection
            title="UNIVERSAL PROPERTIES"
            icon={<Sparkles className="w-4 h-4" />}
            color="violet"
            lines={[...universalPrompt.system]}
          />
        )}

        {/* Combined Class Definitions */}
        {combinedSystemLines.length > 0 && (
          <PromptSection
            title="CLASS HIERARCHY"
            icon={<Layers className="w-4 h-4" />}
            color="purple"
            lines={combinedSystemLines}
          />
        )}

        {/* Guidance Section */}
        <PromptSection
          title="USAGE GUIDANCE"
          icon={<FileText className="w-4 h-4" />}
          color="blue"
          lines={[
            "To explore specific classes:",
            "1. Click on a node in the Topological Rail",
            "2. View its properties in the inspector",
            "3. See its generated prompt here",
            "",
            "The prompt fragments combine to form complete",
            "context for language model interactions."
          ]}
        />
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>{classCount} classes with generated prompts</span>
          <span className="text-violet-400">Select a node to see details</span>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Reusable prompt section component
 */
const PromptSection = ({
  title,
  icon,
  color,
  lines
}: {
  title: string
  icon: React.ReactNode
  color: 'purple' | 'green' | 'amber' | 'violet' | 'blue'
  lines: string[]
}) => {
  const colorMap = {
    purple: 'border-purple-500 bg-purple-500/10',
    green: 'border-green-500 bg-green-500/10',
    amber: 'border-amber-500 bg-amber-500/10',
    violet: 'border-violet-500 bg-violet-500/10',
    blue: 'border-blue-500 bg-blue-500/10',
  }

  const headerColorMap = {
    purple: 'text-purple-400',
    green: 'text-green-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
    blue: 'text-blue-400',
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
        {lines.map((line, i) => (
          <div key={i} className={line === "" ? "h-2" : ""}>
            {line}
          </div>
        ))}
      </div>
    </motion.section>
  )
}

