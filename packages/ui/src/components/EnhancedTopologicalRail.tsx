import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { ontologyGraphAtom, selectedNodeAtom, topologicalOrderAtom } from "../state/store"
import { motion } from "framer-motion"
import { ArrowRight, GitBranch, Loader2 } from "lucide-react"

/**
 * EnhancedTopologicalRail - Improved visualization with better UX
 *
 * Improvements:
 * - Animated loading states
 * - Better visual hierarchy
 * - Enhanced hover effects
 * - Connection indicators
 * - Smooth transitions
 * - Better typography and spacing
 */
export const EnhancedTopologicalRail = (): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const topologicalOrderResult = useAtomValue(topologicalOrderAtom) as Result.Result<string[], any>
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-50 to-white">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Loader2 className="w-8 h-8 text-blue-500" />
          </motion.div>
          <div className="text-sm text-slate-600 font-medium">Loading ontology...</div>
          <div className="text-xs text-slate-400 mt-1">Parsing RDF/Turtle</div>
        </div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-center max-w-md p-6">
          <div className="text-5xl mb-4">⚠️</div>
          <div className="text-sm font-semibold text-red-700 mb-2">
            Error parsing ontology
          </div>
          <div className="text-xs text-red-600 bg-red-100 p-3 rounded font-mono max-h-32 overflow-auto">
            {String(failure.cause)}
          </div>
          <div className="text-xs text-red-500 mt-3">
            Check your Turtle syntax and try again
          </div>
        </div>
      </div>
    ),
    onSuccess: (graphSuccess) => {
      const { context } = graphSuccess.value

      return Result.match(topologicalOrderResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="inline-block mb-4"
              >
                <GitBranch className="w-8 h-8 text-blue-500" />
              </motion.div>
              <div className="text-sm text-slate-600 font-medium">Computing topology...</div>
              <div className="text-xs text-slate-400 mt-1">Analyzing dependencies</div>
            </div>
          </div>
        ),
        onFailure: () => (
          <div className="flex items-center justify-center h-full bg-red-50">
            <div className="text-red-600 text-sm font-medium">Error computing topology</div>
          </div>
        ),
        onSuccess: (topoSuccess) => {
          const topologicalOrder = topoSuccess.value

          return (
            <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-blue-600" />
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                        Class Hierarchy
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Topological order: children → parents
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {topologicalOrder.length}
                    </div>
                    <div className="text-xs text-slate-500">classes</div>
                  </div>
                </div>
              </div>

              {/* Visualization Rail */}
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
                {topologicalOrder.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-slate-400">
                      <div className="text-4xl mb-2">📦</div>
                      <div className="text-sm">No classes found</div>
                      <div className="text-xs mt-1">Add some OWL classes to get started</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center space-x-12 min-w-max">
                    {topologicalOrder.map((nodeId, index) => {
                      const nodeOption = HashMap.get(context.nodes, nodeId)
                      if (nodeOption._tag !== "Some") return null

                      const node = nodeOption.value
                      if (node._tag !== "Class") return null

                      const isSelected =
                        Option.isSome(selectedNode) && selectedNode.value === nodeId

                      return (
                        <div key={nodeId} className="relative group flex items-center">
                          {/* Connection Arrow */}
                          {index > 0 && (
                            <motion.div
                              className="absolute -left-10 top-1/2 -translate-y-1/2 flex items-center"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                            >
                              <div className="w-6 h-0.5 bg-gradient-to-r from-blue-300 to-blue-400" />
                              <ArrowRight className="w-4 h-4 text-blue-400 -ml-1" />
                            </motion.div>
                          )}

                          {/* Node Circle */}
                          <motion.button
                            onClick={() => setSelectedNode(Option.some(nodeId))}
                            className={`
                              relative w-20 h-20 rounded-full border-3 shadow-md
                              flex flex-col items-center justify-center
                              text-xs font-bold font-mono
                              transition-all
                              ${
                              isSelected
                                ? "bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700 text-white scale-110 shadow-2xl ring-4 ring-blue-300/50"
                                : "bg-white border-blue-400 text-blue-700 hover:shadow-xl hover:scale-105"
                            }
                            `}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 20,
                              delay: index * 0.1
                            }}
                            whileHover={{ scale: isSelected ? 1.15 : 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {/* Property count badge */}
                            <motion.div
                              className={`
                                absolute -top-2 -right-2 w-6 h-6 rounded-full
                                flex items-center justify-center text-[10px] font-bold
                                ${isSelected
                                  ? 'bg-white text-blue-600 ring-2 ring-blue-500'
                                  : 'bg-blue-100 text-blue-700'
                                }
                              `}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: index * 0.1 + 0.2, type: "spring" }}
                            >
                              {node.properties.length}
                            </motion.div>

                            {/* Label abbreviation */}
                            <div className="text-lg font-extrabold tracking-tight">
                              {node.label.substring(0, 3).toUpperCase()}
                            </div>

                            {/* Decorative underline */}
                            <div className={`
                              w-8 h-0.5 mt-1 rounded-full
                              ${isSelected ? 'bg-white/60' : 'bg-blue-400/40'}
                            `} />
                          </motion.button>

                          {/* Hover tooltip */}
                          <motion.div
                            className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                            initial={{ y: -10 }}
                            whileHover={{ y: 0 }}
                          >
                            <div className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-xs whitespace-nowrap">
                              <div className="font-bold text-sm mb-1">{node.label}</div>
                              <div className="text-slate-400 mb-2">
                                {node.properties.length} {node.properties.length === 1 ? 'property' : 'properties'}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono max-w-xs truncate border-t border-slate-700 pt-2">
                                {nodeId}
                              </div>
                              {/* Tooltip arrow */}
                              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                            </div>
                          </motion.div>

                          {/* Index indicator */}
                          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-mono text-slate-400">
                            {index + 1}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Universal Properties Footer Badge */}
              {context.universalProperties.length > 0 && (
                <motion.div
                  className="px-6 py-3 border-t border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-violet-700">
                      <span className="font-bold text-sm">{context.universalProperties.length}</span>{" "}
                      universal properties available to all classes
                    </div>
                    <div className="text-xs text-violet-500 italic">
                      Domain-agnostic metadata
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )
        }
      })
    }
  })
}
