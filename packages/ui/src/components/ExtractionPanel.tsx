/**
 * ExtractionPanel - Simple extraction trigger and results viewer
 */

import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react"
import { Loader2, Play, AlertCircle, CheckCircle } from "lucide-react"
import {
  extractionInputAtom,
  extractionStatusAtom,
  runExtractionAtom,
  type ExtractionStatus
} from "../state/extraction"

export const ExtractionPanel = (): React.ReactElement => {
  const [inputText, setInputText] = useAtom(extractionInputAtom)
  const status = useAtomValue(extractionStatusAtom)
  const extractionResult = useAtomValue(runExtractionAtom)

  const handleExtract = () => {
    // Just reading the atom triggers the extraction effect
    // This is handled by the runtime.atom pattern
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="text-xs font-medium text-slate-300">Extract</div>
        <StatusBadge status={status} />
      </div>

      {/* Input */}
      <div className="flex-1 p-4">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter text to extract knowledge from..."
          className="w-full h-full bg-slate-800 text-slate-100 text-sm p-3 rounded border border-slate-700 resize-none focus:outline-none focus:border-slate-500 placeholder:text-slate-500"
        />
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-slate-700">
        <button
          onClick={handleExtract}
          disabled={status._tag === "running" || !inputText.trim()}
          className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-100 text-xs font-medium rounded flex items-center justify-center gap-2 transition-colors"
        >
          {status._tag === "running" ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Extract
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {status._tag === "success" && (
        <div className="px-4 pb-4">
          <div className="bg-slate-800 rounded p-3 text-xs font-mono text-slate-300 max-h-48 overflow-auto">
            <pre>{JSON.stringify(status.result, null, 2)}</pre>
          </div>
        </div>
      )}

      {status._tag === "error" && (
        <div className="px-4 pb-4">
          <div className="bg-red-900/30 border border-red-800 rounded p-3 text-xs text-red-300">
            {status.message}
          </div>
        </div>
      )}
    </div>
  )
}

const StatusBadge = ({ status }: { status: ExtractionStatus }) => {
  switch (status._tag) {
    case "idle":
      return <span className="text-[10px] text-slate-500">Ready</span>
    case "running":
      return (
        <span className="text-[10px] text-blue-400 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      )
    case "success":
      return (
        <span className="text-[10px] text-green-400 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Done
        </span>
      )
    case "error":
      return (
        <span className="text-[10px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      )
  }
}
