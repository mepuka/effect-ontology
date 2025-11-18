import { EnhancedTopologicalRail } from "./components/EnhancedTopologicalRail"
import { EnhancedNodeInspector } from "./components/EnhancedNodeInspector"
import { TurtleEditor } from "./components/TurtleEditor"
import { PromptPreview } from "./components/PromptPreview"
import { UniversalPropertiesPanel } from "./components/UniversalPropertiesPanel"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { ontologyGraphAtom } from "./state/store"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"

export const App = () => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>

  // Extract universal properties for the floating panel
  const universalProperties = Result.match(graphResult, {
    onInitial: () => [],
    onFailure: () => [],
    onSuccess: (graphSuccess) => graphSuccess.value.context.universalProperties
  })

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-100">
      {/* Left Panel - Editor */}
      <div className="w-1/3 border-r border-slate-300 shadow-lg">
        <TurtleEditor />
      </div>

      {/* Center Panel - Visualization */}
      <div className="w-1/3 border-r border-slate-300 flex flex-col shadow-lg bg-white">
        <div className="flex-1 overflow-hidden">
          <EnhancedTopologicalRail />
        </div>
        <div className="h-80 border-t border-slate-200 overflow-hidden">
          <EnhancedNodeInspector />
        </div>
      </div>

      {/* Right Panel - Prompt Preview */}
      <div className="w-1/3 overflow-hidden">
        <PromptPreview />
      </div>

      {/* Universal Properties Overlay */}
      <UniversalPropertiesPanel universalProperties={universalProperties} />
    </div>
  )
}
