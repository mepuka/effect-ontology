import { useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { KnowledgeIndex } from "@effect-ontology/core/Prompt"
import { ontologyGraphAtom, selectedNodeAtom, knowledgeIndexAtom } from "../state/store"
import { PropertyInheritanceCard } from "./PropertyInheritanceCard"
import { motion } from "framer-motion"
import { MousePointer2 } from "lucide-react"

/**
 * EnhancedNodeInspector - Shows detailed property inheritance visualization
 *
 * Improvements over basic inspector:
 * - Uses PropertyInheritanceCard for rich visualization
 * - Shows inherited properties from parent classes
 * - Displays universal properties
 * - Better empty states
 * - Smooth animations
 */
export const EnhancedNodeInspector = (): React.ReactElement | null => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const indexResult = useAtomValue(knowledgeIndexAtom) as Result.Result<any, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  // Handle no selection first
  if (Option.isNone(selectedNode)) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-white to-slate-50">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.div
            className="text-6xl mb-4"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            👆
          </motion.div>
          <div className="flex items-center gap-2 justify-center text-slate-600 mb-2">
            <MousePointer2 className="w-4 h-4" />
            <span className="text-sm font-medium">Select a node to inspect</span>
          </div>
          <div className="text-xs text-slate-400">
            Click any class in the hierarchy above
          </div>
        </motion.div>
      </div>
    )
  }

  // Handle graph and index Result states
  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    ),
    onFailure: () => null,
    onSuccess: (graphSuccess) => {
      return Result.match(indexResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-slate-400 text-sm">Building knowledge index...</div>
          </div>
        ),
        onFailure: () => null,
        onSuccess: (indexSuccess) => {
          const { context } = graphSuccess.value
          const index = indexSuccess.value

          // Get ClassNode from context for validation
          const nodeOption = HashMap.get(context.nodes, selectedNode.value)

          if (Option.isNone(nodeOption)) {
            return (
              <div className="flex items-center justify-center h-full bg-white">
                <div className="text-red-500 text-sm">Node not found</div>
              </div>
            )
          }

          const node = nodeOption.value
          if (!isClassNode(node)) {
            return (
              <div className="flex items-center justify-center h-full bg-white">
                <div className="text-slate-400 text-sm">Not a class node</div>
              </div>
            )
          }

          // Get KnowledgeUnit from index (has inheritedProperties computed)
          const unitOption = KnowledgeIndex.get(index, selectedNode.value)

          if (Option.isNone(unitOption)) {
            return (
              <div className="flex items-center justify-center h-full bg-white">
                <div className="text-red-500 text-sm">Knowledge unit not found</div>
              </div>
            )
          }

          const unit = unitOption.value

          return (
            <motion.div
              className="h-full bg-white overflow-y-auto p-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <PropertyInheritanceCard
                unit={unit}
                universalProperties={context.universalProperties}
              />
            </motion.div>
          )
        }
      })
    }
  })
}
