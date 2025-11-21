import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react"
import { Graph, HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode, type ClassNode } from "@effect-ontology/core/Graph/Types"
import { ontologyGraphAtom, selectedNodeAtom } from "../state/store"
import { Canvas, Node, Edge, type NodeData, type EdgeData } from "reaflow"
import { Loader2 } from "lucide-react"

/**
 * OntologyGraphViewer - Clean DAG visualization using Reaflow
 *
 * Features:
 * - Automatic ELK layout (no manual positioning)
 * - Clean, minimal node styling
 * - Selection state with subtle highlight
 * - Parent→Child edge direction (subClassOf relationship)
 */
export const OntologyGraphViewer = (): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin mx-auto mb-2" />
          <div className="text-xs text-slate-500 font-medium">Loading...</div>
        </div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center max-w-sm p-4">
          <div className="text-xs font-medium text-red-600 mb-1">Parse Error</div>
          <div className="text-xs text-slate-500 font-mono overflow-auto max-h-24">
            {String(failure.cause)}
          </div>
        </div>
      </div>
    ),
    onSuccess: (graphSuccess) => {
      const { graph, context } = graphSuccess.value

      // Build nodes from OntologyContext
      const nodes: NodeData[] = []
      const nodeIdToClassNode = new Map<string, ClassNode>()

      for (const [nodeId, node] of HashMap.entries(context.nodes)) {
        if (isClassNode(node)) {
          nodeIdToClassNode.set(nodeId, node)
          const isSelected = Option.isSome(selectedNode) && selectedNode.value === nodeId

          nodes.push({
            id: nodeId,
            text: node.label,
            data: {
              label: node.label,
              propertyCount: node.properties.length,
              isSelected
            }
          })
        }
      }

      // Build edges using Graph.topo and Graph.neighbors
      const edges: EdgeData[] = []

      // Build index to IRI mapping
      const indexToIri = new Map<number, string>()
      for (const [iri, idx] of HashMap.entries(context.nodeIndexMap)) {
        indexToIri.set(idx, iri)
      }

      // Iterate through all nodes in topological order
      for (const [nodeIndex, nodeId] of Graph.topo(graph)) {
        // Get neighbors (parents in subClassOf relationship)
        const neighbors = Graph.neighbors(graph, nodeIndex)

        for (const parentIndex of neighbors) {
          const parentIri = indexToIri.get(parentIndex)
          if (!parentIri) continue

          // Edge: child → parent (subClassOf direction)
          edges.push({
            id: `${nodeId}->${parentIri}`,
            from: nodeId,
            to: parentIri
          })
        }
      }

      // If no nodes, show empty state
      if (nodes.length === 0) {
        return (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <div className="text-center text-slate-400">
              <div className="text-sm font-medium">No classes found</div>
              <div className="text-xs mt-1">Add OWL classes to visualize</div>
            </div>
          </div>
        )
      }

      return (
        <div className="h-full w-full bg-slate-50">
          <Canvas
            nodes={nodes}
            edges={edges}
            direction="RIGHT"
            fit={true}
            readonly={false}
            zoomable={true}
            pannable={true}
            maxWidth={2000}
            maxHeight={1500}
            node={(nodeProps) => {
              const { id, properties } = nodeProps
              const classNode = nodeIdToClassNode.get(id)
              const label = classNode?.label || id.split('/').pop() || id
              const propCount = classNode?.properties.length || 0
              const isSelected = Option.isSome(selectedNode) && selectedNode.value === id

              return (
                <Node
                  {...nodeProps}
                  style={{
                    fill: isSelected ? '#1e293b' : '#ffffff',
                    stroke: isSelected ? '#1e293b' : '#e2e8f0',
                    strokeWidth: 1,
                    rx: 4,
                    ry: 4
                  }}
                  onClick={() => setSelectedNode(Option.some(id))}
                >
                  {(event) => (
                    <foreignObject
                      width={event.width}
                      height={event.height}
                      className="cursor-pointer"
                    >
                      <div
                        className={`
                          h-full w-full flex flex-col items-center justify-center px-3 py-2
                          ${isSelected ? 'text-white' : 'text-slate-700'}
                        `}
                      >
                        <div className="text-xs font-medium truncate max-w-full">
                          {label}
                        </div>
                        {propCount > 0 && (
                          <div className={`
                            text-[10px] mt-0.5
                            ${isSelected ? 'text-slate-300' : 'text-slate-400'}
                          `}>
                            {propCount} prop{propCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </foreignObject>
                  )}
                </Node>
              )
            }}
            edge={(edgeProps) => (
              <Edge
                {...edgeProps}
                style={{
                  stroke: '#cbd5e1',
                  strokeWidth: 1
                }}
              />
            )}
          />
        </div>
      )
    }
  })
}
