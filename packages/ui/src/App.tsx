import { OntologyGraphViewer } from "./components/OntologyGraphViewer"
import { NodeInspector } from "./components/NodeInspector"
import { TurtleEditor } from "./components/TurtleEditor"
import { EnrichedPromptPreview } from "./components/EnrichedPromptPreview"
import { JsonSchemaViewer } from "./components/JsonSchemaViewer"
import { SettingsPanel } from "./components/SettingsPanel"

export const App = () => {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-50">
      {/* Left Panel - Editor */}
      <div className="w-1/3 border-r border-slate-200 bg-white">
        <TurtleEditor />
      </div>

      {/* Center Panel - Graph + Inspector */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col bg-white">
        <div className="flex-1 overflow-hidden">
          <OntologyGraphViewer />
        </div>
        <div className="h-56 border-t border-slate-200 overflow-hidden bg-white">
          <NodeInspector />
        </div>
      </div>

      {/* Right Panel - Prompt + Schema */}
      <div className="w-1/3 flex flex-col overflow-hidden bg-slate-900">
        <div className="h-1/2 border-b border-slate-700 overflow-hidden">
          <EnrichedPromptPreview />
        </div>
        <div className="h-1/2 overflow-hidden">
          <JsonSchemaViewer />
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel />
    </div>
  )
}
