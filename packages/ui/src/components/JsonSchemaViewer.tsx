/**
 * JSON Schema Viewer Component
 *
 * Displays generated JSON Schema in multiple formats (Anthropic, OpenAI, Raw).
 * Provides interactive tree view and copy-to-clipboard functionality.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { Copy, Check, FileJson, Sparkles, Code } from "lucide-react"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { jsonSchemaAtom, schemaStatsAtom } from "../state/store"
import { InteractiveJsonTree } from "./InteractiveJsonTree"
import { buildPrefixMap, extractIRIs } from "../utils/schemaUtils"

type SchemaFormat = "anthropic" | "openai" | "raw"

/**
 * JsonSchemaViewer - Multi-format JSON Schema display
 *
 * Features:
 * - Three tabs: Anthropic (with $ref), OpenAI (dereferenced), Raw (JSON)
 * - Interactive tree view for easy navigation
 * - Copy-to-clipboard for each format
 * - Schema statistics badge
 * - Loading and error states
 */
export const JsonSchemaViewer = () => {
  const schemaResult = useAtomValue(jsonSchemaAtom)
  const statsResult = useAtomValue(schemaStatsAtom)
  
  const [selectedFormat, setSelectedFormat] = useState<SchemaFormat>("anthropic")
  const [copied, setCopied] = useState(false)
  
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            JSON Schema
          </h2>
          
          {Result.match(statsResult, {
            onInitial: () => null,
            onFailure: () => null,
            onSuccess: (stats) => (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{stats.value.classCount} classes</span>
                <span>•</span>
                <span>{stats.value.propertyCount} properties</span>
                <span>•</span>
                <span>{(stats.value.totalSize / 1024).toFixed(1)} KB</span>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 px-6 pt-4 border-b border-slate-700">
        <TabButton
          active={selectedFormat === "anthropic"}
          onClick={() => setSelectedFormat("anthropic")}
          icon={<Sparkles className="w-4 h-4" />}
          label="Anthropic"
        />
        <TabButton
          active={selectedFormat === "openai"}
          onClick={() => setSelectedFormat("openai")}
          icon={<FileJson className="w-4 h-4" />}
          label="OpenAI"
        />
        <TabButton
          active={selectedFormat === "raw"}
          onClick={() => setSelectedFormat("raw")}
          icon={<Code className="w-4 h-4" />}
          label="Raw JSON"
        />
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {Result.match(schemaResult, {
          onInitial: () => (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <FileJson className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Loading schema...</p>
              </div>
            </div>
          ),
          
          onFailure: (error) => (
            <div className="flex items-center justify-center h-full text-red-400">
              <div className="text-center max-w-md">
                <p className="font-semibold mb-2">Error generating schema</p>
                <p className="text-sm text-red-300">{String(error)}</p>
              </div>
            </div>
          ),
          
          onSuccess: (schemaData) => {
            const { anthropic, openai, raw } = schemaData.value
            const iris = extractIRIs(anthropic)
            const prefixes = buildPrefixMap(iris)
            
            let displayData: any
            let displayText: string
            
            switch (selectedFormat) {
              case "anthropic":
                displayData = anthropic
                displayText = JSON.stringify(anthropic, null, 2)
                break
              case "openai":
                displayData = openai
                displayText = JSON.stringify(openai, null, 2)
                break
              case "raw":
                displayData = raw
                displayText = raw
                break
            }
            
            return (
              <div className="p-6">
                {/* Copy Button */}
                <div className="flex justify-end mb-4">
                  <motion.button
                    onClick={() => handleCopy(displayText)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-sm transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </motion.button>
                </div>
                
                {/* Schema Display */}
                {selectedFormat === "raw" ? (
                  <pre className="font-mono text-xs bg-slate-800 rounded-lg p-4 overflow-auto border border-slate-700">
                    {displayText}
                  </pre>
                ) : (
                  <div className="font-mono text-sm bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <InteractiveJsonTree data={displayData} prefixes={prefixes} />
                  </div>
                )}
              </div>
            )
          }
        })}
      </div>
      
      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50">
        <p className="text-xs text-slate-400">
          {selectedFormat === "anthropic" && "Anthropic format supports $ref pointers"}
          {selectedFormat === "openai" && "OpenAI format with dereferenced definitions"}
          {selectedFormat === "raw" && "Raw JSON Schema for debugging"}
        </p>
      </div>
    </div>
  )
}

/**
 * TabButton - Styled tab button component
 */
const TabButton = ({ 
  active, 
  onClick, 
  icon, 
  label 
}: { 
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
        active
          ? "bg-slate-900 text-slate-100 border-t-2 border-blue-400"
          : "text-slate-400 hover:text-slate-300 hover:bg-slate-800"
      }`}
      whileHover={{ y: active ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  )
}

