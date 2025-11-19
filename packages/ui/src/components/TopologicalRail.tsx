import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { ontologyGraphAtom, selectedNodeAtom, topologicalOrderAtom } from "../state/store"

export const TopologicalRail = (): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const topologicalOrderResult = useAtomValue(topologicalOrderAtom) as Result.Result<string[], any>
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading ontology...</div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">
          Error parsing ontology: {String(failure.cause)}
        </div>
      </div>
    ),
    onSuccess: (graphSuccess) => {
      const { context } = graphSuccess.value

      return Result.match(topologicalOrderResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400 text-sm">Computing topology...</div>
          </div>
        ),
        onFailure: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 text-sm">Error computing topology</div>
          </div>
        ),
        onSuccess: (topoSuccess) => {
          const topologicalOrder = topoSuccess.value

          return (
            <div className="flex flex-col h-full bg-slate-50">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Topological Order
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Classes ordered by dependency (children → parents)
                </p>
              </div>

              <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
                <div className="flex items-center space-x-8 min-w-max">
                  {topologicalOrder.map((nodeId, index) => {
                    const nodeOption = HashMap.get(context.nodes, nodeId)
                    if (Option.isNone(nodeOption)) return null

                    const node = nodeOption.value
                    if (!isClassNode(node)) return null

                    const isSelected =
                      Option.isSome(selectedNode) && selectedNode.value === nodeId

                    return (
                      <div key={nodeId} className="relative group flex items-center">
                        {/* Connection Line */}
                        {index > 0 && (
                          <div className="absolute -left-8 top-1/2 w-8 h-0.5 bg-slate-300" />
                        )}

                        {/* Node Circle */}
                        <button
                          onClick={() => setSelectedNode(Option.some(nodeId))}
                          className={`
                            w-16 h-16 rounded-full border-2 shadow-sm
                            flex flex-col items-center justify-center
                            text-xs font-bold font-mono
                            transition-all hover:scale-110 hover:shadow-md
                            ${
                            isSelected
                              ? "bg-blue-500 border-blue-600 text-white scale-110 shadow-lg"
                              : "bg-white border-blue-500 text-blue-600"
                          }
                          `}
                        >
                          <div className="text-[10px] opacity-60">
                            {node.properties.length}
                          </div>
                          <div>{node.label.substring(0, 3).toUpperCase()}</div>
                        </button>

                        {/* Hover Label */}
                        <div className="absolute top-20 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-xs text-slate-600 whitespace-nowrap pointer-events-none transition-opacity bg-white px-2 py-1 rounded shadow-sm">
                          {node.label}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {node.properties.length} properties
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {topologicalOrder.length === 0 && (
                    <div className="text-slate-400 text-sm">No classes found</div>
                  )}
                </div>
              </div>

              {/* Universal Properties Badge */}
              {context.universalProperties.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-violet-50">
                  <div className="text-xs text-violet-700">
                    <span className="font-semibold">{context.universalProperties.length}</span>{" "}
                    universal properties (domain-agnostic)
                  </div>
                </div>
              )}
            </div>
          )
        }
      })
    }
  })
}
