import { TopologicalRail } from "./components/TopologicalRail"
import { NodeInspector } from "./components/NodeInspector"
import { TurtleEditor } from "./components/TurtleEditor"

export const App = () => {
  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Left Panel - Editor */}
      <div className="w-1/3 border-r border-slate-200">
        <TurtleEditor />
      </div>

      {/* Center Panel - Visualization */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col">
        <div className="flex-1">
          <TopologicalRail />
        </div>
        <div className="h-64 border-t border-slate-200">
          <NodeInspector />
        </div>
      </div>

      {/* Right Panel - Details / Future Prompt Preview */}
      <div className="w-1/3 bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-2">🚧</div>
          <div className="text-sm">Prompt preview coming soon</div>
          <div className="text-xs mt-2 text-slate-300">
            Will show generated prompts here
          </div>
        </div>
      </div>
    </div>
  )
}
