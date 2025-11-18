import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { ontologyGraphAtom, selectedNodeAtom } from "../state/store"
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
  const selectedNode = useAtomValue(selectedNodeAtom)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100">
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
    onSuccess: (graphSuccess) => {
      const { context, graph } = graphSuccess.value

      // If a node is selected, show its specific prompt
      if (Option.isSome(selectedNode)) {
        const nodeOption = HashMap.get(context.nodes, selectedNode.value)
        if (nodeOption._tag === "Some" && nodeOption.value._tag === "Class") {
          const node = nodeOption.value
          return <SelectedNodePrompt node={node} />
        }
      }

      // Otherwise show the full ontology overview
      return <FullOntologyPrompt context={context} />
    }
  })
}

/**
 * Display prompt for a selected class node
 */
const SelectedNodePrompt = ({ node }: { node: any }) => {
  return (
    <motion.div
      key={node.id}
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
          Generated from: <span className="text-blue-400 font-semibold">{node.label}</span>
        </div>
      </div>

      {/* Prompt Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-sm">
        {/* System Section */}
        <PromptSection
          title="SYSTEM"
          icon={<Layers className="w-4 h-4" />}
          color="purple"
          lines={[
            `# Class: ${node.label}`,
            `# IRI: ${node.id}`,
            `# Properties: ${node.properties.length}`,
            "",
            "This class represents:",
            `- ${node.label}`,
            "",
            "Available properties:",
            ...node.properties.map((p: any) => `  - ${p.label} (${extractLabel(p.range)})`)
          ]}
        />

        {/* User Context Section */}
        <PromptSection
          title="USER CONTEXT"
          icon={<FileText className="w-4 h-4" />}
          color="green"
          lines={[
            "When creating instances of this class, ensure:",
            ...node.properties.map((p: any) =>
              `- ${p.label} is of type: ${extractLabel(p.range)}`
            )
          ]}
        />

        {/* Examples Section */}
        {node.properties.length > 0 && (
          <PromptSection
            title="EXAMPLE"
            icon={<Sparkles className="w-4 h-4" />}
            color="amber"
            lines={[
              "Example instance:",
              "{",
              `  "type": "${node.label}",`,
              ...node.properties.slice(0, 3).map((p: any, idx: number) =>
                `  "${p.label}": "<${extractLabel(p.range)}>"${idx < Math.min(node.properties.length, 3) - 1 ? ',' : ''}`
              ),
              "}"
            ]}
          />
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>{node.properties.length} properties defined</span>
          <span className="text-blue-400">Click another node to compare</span>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Display full ontology overview
 */
const FullOntologyPrompt = ({ context }: { context: any }) => {
  const classCount = Array.from(context.nodes).filter(
    ([_, node]: any) => node._tag === "Class"
  ).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100"
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
        {/* System Section */}
        <PromptSection
          title="ONTOLOGY METADATA"
          icon={<Layers className="w-4 h-4" />}
          color="purple"
          lines={[
            "# Ontology Structure",
            "",
            `Total Classes: ${classCount}`,
            `Universal Properties: ${context.universalProperties.length}`,
            "",
            "This ontology defines a hierarchical class structure",
            "for domain modeling and knowledge representation."
          ]}
        />

        {/* Universal Properties */}
        {context.universalProperties.length > 0 && (
          <PromptSection
            title="UNIVERSAL PROPERTIES"
            icon={<Sparkles className="w-4 h-4" />}
            color="violet"
            lines={[
              "Domain-agnostic properties available to all classes:",
              "",
              ...context.universalProperties.map((p: any) =>
                `- ${p.label} (${extractLabel(p.range)}): ${p.iri}`
              )
            ]}
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
          <span>{classCount} classes ready for prompt generation</span>
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

/**
 * Extract readable label from IRI
 */
function extractLabel(iri: string): string {
  return iri.split('#').pop() || iri.split('/').pop() || iri
}
