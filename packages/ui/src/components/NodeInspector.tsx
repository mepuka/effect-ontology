import { useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { ontologyGraphAtom, selectedNodeAtom } from "../state/store"

export const NodeInspector = (): React.ReactElement | null => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  // Handle no selection first
  if (Option.isNone(selectedNode)) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-2">👆</div>
          <div className="text-sm">Select a node to inspect</div>
        </div>
      </div>
    )
  }

  // Handle graph Result states
  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    ),
    onFailure: () => null,
    onSuccess: (graphSuccess) => {
      const { context } = graphSuccess.value
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

      return (
        <div className="h-full bg-white overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{node.label}</h3>
              <div className="text-xs font-mono text-slate-500 break-all">{node.id}</div>
            </div>

            {/* Properties Section */}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">
                  Properties ({node.properties.length})
                </h4>

                {node.properties.length === 0 ? (
                  <div className="text-sm text-slate-400 italic">No properties defined</div>
                ) : (
                  <div className="space-y-3">
                    {node.properties.map((prop, idx) => {
                      const rangeLabel =
                        prop.range.split("#").pop() ||
                        prop.range.split("/").pop() ||
                        prop.range

                      return (
                        <div
                          key={idx}
                          className="border border-slate-200 rounded p-3 hover:border-blue-300 transition-colors"
                        >
                          <div className="font-semibold text-slate-900 mb-1">{prop.label}</div>
                          <div className="text-xs text-slate-500 mb-1">Range: {rangeLabel}</div>
                          <div className="text-xs font-mono text-slate-400 break-all">
                            {prop.iri}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }
  })
}
