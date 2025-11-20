/**
 * Interactive JSON Tree Component
 *
 * Renders JSON as a collapsible tree with syntax highlighting and IRI detection.
 */

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronDown } from "lucide-react"
import { IriChip } from "./IriChip"
import { isIRI } from "../utils/schemaUtils"

export interface InteractiveJsonTreeProps {
  /** JSON data to render */
  data: any
  /** Current nesting level (for indentation) */
  level?: number
  /** Custom prefixes for IRI abbreviation */
  prefixes?: Map<string, string>
}

/**
 * InteractiveJsonTree - Collapsible JSON tree viewer
 *
 * Features:
 * - Collapsible object/array nodes
 * - Syntax highlighting for types
 * - IRI detection and chip rendering
 * - Smooth expand/collapse animations
 */
export const InteractiveJsonTree = ({ 
  data, 
  level = 0,
  prefixes 
}: InteractiveJsonTreeProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2) // Auto-expand first 2 levels
  
  const indent = level * 16
  
  // Handle primitives
  if (data === null) {
    return <span className="text-gray-400">null</span>
  }
  
  if (typeof data === "boolean") {
    return <span className="text-purple-600 font-semibold">{String(data)}</span>
  }
  
  if (typeof data === "number") {
    return <span className="text-green-600 font-semibold">{data}</span>
  }
  
  if (typeof data === "string") {
    // Check if it's an IRI
    if (isIRI(data)) {
      return <IriChip iri={data} prefixes={prefixes} />
    }
    return <span className="text-amber-600">"{data}"</span>
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-400">[]</span>
    }
    
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 hover:bg-slate-100 rounded px-1 -ml-1"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600" />
          )}
          <span className="text-slate-600 font-mono text-sm">
            [{data.length}]
          </span>
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-l-2 border-slate-200 ml-2 pl-3 mt-1">
                {data.map((item, index) => (
                  <div key={index} className="py-1">
                    <span className="text-slate-400 text-xs mr-2">{index}:</span>
                    <InteractiveJsonTree 
                      data={item} 
                      level={level + 1}
                      prefixes={prefixes}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
  
  // Handle objects
  if (typeof data === "object") {
    const keys = Object.keys(data)
    
    if (keys.length === 0) {
      return <span className="text-gray-400">{"{}"}</span>
    }
    
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 hover:bg-slate-100 rounded px-1 -ml-1"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600" />
          )}
          <span className="text-slate-600 font-mono text-sm">
            {"{"}{keys.length}{"}"}
          </span>
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-l-2 border-slate-200 ml-2 pl-3 mt-1">
                {keys.map((key) => (
                  <div key={key} className="py-1">
                    <span className="text-blue-600 font-mono text-sm mr-2">
                      {key}:
                    </span>
                    <InteractiveJsonTree 
                      data={data[key]} 
                      level={level + 1}
                      prefixes={prefixes}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
  
  // Fallback
  return <span className="text-gray-600">{String(data)}</span>
}

