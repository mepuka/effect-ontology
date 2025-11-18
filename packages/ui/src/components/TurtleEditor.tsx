import { useAtom } from "@effect-atom/atom-react"
import { turtleInputAtom } from "../state/store"

export const TurtleEditor = () => {
  const [turtle, setTurtle] = useAtom(turtleInputAtom)

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Turtle Editor
        </h2>
      </div>

      <textarea
        value={turtle}
        onChange={(e) => setTurtle(e.target.value)}
        className="flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-sm resize-none focus:outline-none"
        placeholder="Enter Turtle/RDF here..."
        spellCheck={false}
      />

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500">
        Edit to see live updates in the visualization
      </div>
    </div>
  )
}
