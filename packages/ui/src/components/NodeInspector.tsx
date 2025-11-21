import { useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { KnowledgeIndex } from "@effect-ontology/core/Prompt"
import type { PropertyConstraint } from "@effect-ontology/core/Graph/Constraint"
import { ontologyGraphAtom, selectedNodeAtom, knowledgeIndexAtom } from "../state/store"

/**
 * NodeInspector - Clean, minimal node details panel
 */
export const NodeInspector = (): React.ReactElement | null => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const indexResult = useAtomValue(knowledgeIndexAtom) as Result.Result<any, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  if (Option.isNone(selectedNode)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-slate-400">Select a node</div>
      </div>
    )
  }

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-slate-400">Loading...</div>
      </div>
    ),
    onFailure: () => null,
    onSuccess: (graphSuccess) => {
      return Result.match(indexResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-slate-400">Indexing...</div>
          </div>
        ),
        onFailure: () => null,
        onSuccess: (indexSuccess) => {
          const { context } = graphSuccess.value
          const index = indexSuccess.value

          const nodeOption = HashMap.get(context.nodes, selectedNode.value)
          if (Option.isNone(nodeOption)) return null

          const node = nodeOption.value
          if (!isClassNode(node)) return null

          const unitOption = KnowledgeIndex.get(index, selectedNode.value)
          if (Option.isNone(unitOption)) return null

          const unit = unitOption.value
          const directProps = unit.properties
          const inheritedProps = unit.inheritedProperties

          return (
            <div className="h-full overflow-y-auto text-sm">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="font-medium text-slate-800">{unit.label}</div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  {unit.iri}
                </div>
              </div>

              {/* Properties */}
              <div className="px-4 py-3">
                {/* Direct */}
                {directProps.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                      Direct ({directProps.length})
                    </div>
                    <div className="space-y-1">
                      {directProps.map((prop, idx) => (
                        <PropRow key={idx} prop={prop} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Inherited */}
                {inheritedProps.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                      Inherited ({inheritedProps.length})
                    </div>
                    <div className="space-y-1">
                      {inheritedProps.map((prop, idx) => (
                        <PropRow key={idx} prop={prop} muted />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {directProps.length === 0 && inheritedProps.length === 0 && (
                  <div className="text-xs text-slate-300 text-center py-4">
                    No properties
                  </div>
                )}
              </div>
            </div>
          )
        }
      })
    }
  })
}

const PropRow = ({ prop, muted = false }: { prop: PropertyConstraint; muted?: boolean }) => {
  const range = prop.ranges[0]?.split('#').pop() ||
    prop.ranges[0]?.split('/').pop() ||
    'any'

  return (
    <div className={`flex justify-between items-center py-1.5 px-2 rounded text-xs ${
      muted ? 'bg-slate-50 text-slate-500' : 'bg-slate-100 text-slate-700'
    }`}>
      <span className="truncate">{prop.label}</span>
      <span className="text-[10px] text-slate-400 font-mono ml-2 shrink-0">{range}</span>
    </div>
  )
}
