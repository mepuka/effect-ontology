import { EnhancedTopologicalRail } from "./components/EnhancedTopologicalRail"
import { EnhancedNodeInspector } from "./components/EnhancedNodeInspector"
import { TurtleEditor } from "./components/TurtleEditor"
import { PromptPreview } from "./components/PromptPreview"
import { JsonSchemaViewer } from "./components/JsonSchemaViewer"
import { UniversalPropertiesPanel } from "./components/UniversalPropertiesPanel"
import { ObservablePlotPanel } from "./components/ObservablePlotPanel"
import { SettingsPanel } from "./components/SettingsPanel"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { ontologyGraphAtom } from "./state/store"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"

export const App = () => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>

  // Extract universal properties for the floating panel
  const universalProperties = Result.match(graphResult, {
    onInitial: () => [],
    onFailure: () => [],
    onSuccess: (graphSuccess) => [...graphSuccess.value.context.universalProperties]
  })

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-layered-light">
      {/* Left Panel - Editor */}
      <div className="w-1/3 border-r border-slate-300 shadow-xl bg-white">
        <TurtleEditor />
      </div>

      {/* Center Panel - Visualization */}
      <div className="w-1/3 border-r border-slate-300 flex flex-col shadow-xl bg-white pattern-dots">
        <div className="flex-1 overflow-hidden">
          <EnhancedTopologicalRail />
        </div>
        <div className="h-80 border-t border-slate-200 overflow-hidden bg-slate-50">
          <EnhancedNodeInspector />
        </div>
      </div>

      {/* Right Panel - Split: Prompt + Schema */}
      <div className="w-1/3 flex flex-col overflow-hidden bg-layered-slate pattern-grid">
        {/* Top Half - Prompt Preview */}
        <div className="h-1/2 border-b border-slate-700 overflow-hidden">
          <PromptPreview />
        </div>
        
        {/* Bottom Half - JSON Schema Viewer */}
        <div className="h-1/2 overflow-hidden">
          <JsonSchemaViewer />
        </div>
      </div>

      {/* Universal Properties Overlay */}
      <UniversalPropertiesPanel universalProperties={universalProperties} />
      
      {/* Observable Plot Visualizations Drawer */}
      <ObservablePlotPanel />
      
      {/* Settings Panel */}
      <SettingsPanel />
    </div>
  )
}
