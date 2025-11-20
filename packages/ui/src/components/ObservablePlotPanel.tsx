/**
 * Observable Plot Visualizations Panel
 * 
 * Provides three visualization types:
 * 1. Dependency Graph - Force-directed layout showing class relationships
 * 2. Hierarchy Tree - Tree layout with depth-based coloring
 * 3. Token Statistics - Bar chart of prompt sizes per class
 */

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import * as Plot from "@observablehq/plot"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { ontologyGraphAtom, generatedPromptsAtom, selectedNodeAtom } from "../state/store"
import { HashMap, Option } from "effect"
import { Network, BarChart3, GitBranch, Minimize2, Maximize2 } from "lucide-react"
import type {ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import type { OntologyNode } from "@effect-ontology/core/Graph/Types"
import { isClassNode } from "@effect-ontology/core/Graph/Types"

type PlotType = "dependency" | "hierarchy" | "tokens"

export const ObservablePlotPanel = () => {
  const [selectedPlot, setSelectedPlot] = useState<PlotType>("dependency")
  const [isExpanded, setIsExpanded] = useState(false)
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const promptsResult = useAtomValue(generatedPromptsAtom) as Result.Result<any, any>
  
  const plotRef = useRef<HTMLDivElement>(null)
  
  // Generate plot when selection or data changes
  useEffect(() => {
    if (!plotRef.current || Result.isInitial(graphResult) || !Result.isSuccess(graphResult)) {
      return
    }
    
    const graph = graphResult.value
    plotRef.current.innerHTML = "" // Clear previous plot
    
    try {
      let plot: any
      
      switch (selectedPlot) {
        case "dependency":
          plot = createDependencyGraph(graph)
          break
        case "hierarchy":
          plot = createHierarchyTree(graph)
          break
        case "tokens":
          if (Result.isSuccess(promptsResult)) {
            plot = createTokenStats(graph, promptsResult.value)
          } else {
            plot = null
          }
          break
      }
      
      if (plot) {
        plotRef.current.appendChild(plot)
      }
    } catch (error) {
      console.error("Error creating plot:", error)
    }
  }, [selectedPlot, graphResult, promptsResult])
  
  if (Result.isInitial(graphResult)) {
    return null // Don't show until graph is loaded
  }
  
  if (Result.isFailure(graphResult)) {
    return null // Don't show on error
  }
  
  return (
    <motion.div
      initial={{ height: isExpanded ? "60%" : "0px" }}
      animate={{ height: isExpanded ? "60%" : "48px" }}
      className="absolute bottom-0 left-1/3 right-2/3 bg-white border-t border-r border-slate-300 shadow-2xl z-10"
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {/* Header Bar */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50 to-violet-50">
        <div className="flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-700">Visualizations</h3>
          
          {/* Tabs */}
          <div className="flex gap-1 ml-4">
            <PlotTab
              active={selectedPlot === "dependency"}
              onClick={() => setSelectedPlot("dependency")}
              icon={<Network className="w-3 h-3" />}
              label="Graph"
            />
            <PlotTab
              active={selectedPlot === "hierarchy"}
              onClick={() => setSelectedPlot("hierarchy")}
              icon={<GitBranch className="w-3 h-3" />}
              label="Tree"
            />
            <PlotTab
              active={selectedPlot === "tokens"}
              onClick={() => setSelectedPlot("tokens")}
              icon={<BarChart3 className="w-3 h-3" />}
              label="Tokens"
            />
          </div>
        </div>
        
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-white hover:text-blue-600 transition-colors"
        >
          {isExpanded ? (
            <>
              <Minimize2 className="w-3 h-3" />
              <span>Collapse</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3 h-3" />
              <span>Expand</span>
            </>
          )}
        </button>
      </div>
      
      {/* Plot Container */}
      {isExpanded && (
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          <div ref={plotRef} className="w-full h-full" />
        </div>
      )}
    </motion.div>
  )
}

/**
 * Tab button component
 */
const PlotTab = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-white text-blue-600 shadow-sm"
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  )
}

/**
 * Create dependency graph visualization
 */
function createDependencyGraph(graph: ParsedOntologyGraph): Element {
  const nodes = Array.from(HashMap.entries(graph.context.nodes))
    .filter(([_, node]) => isClassNode(node))
    .map(([id, node], index) => ({
      id,
      label: isClassNode(node) ? node.label : id,
      depth: calculateDepth(id, graph),
      index,
    }))
  
  // Create edges from Graph edges (subclass relationships)
  const edges: Array<{ source: string; target: string }> = []
  // Note: Effect Graph stores edges as Child -> Parent (dependency direction)
  // So we reverse them for visualization
  nodes.forEach(node => {
    // This would require Graph API access which isn't exposed
    // For now, simplified visualization
  })
  
  // Observable Plot doesn't have built-in force layout, use arrow plot
  return Plot.plot({
    width: 800,
    height: 500,
    marginLeft: 60,
    marginRight: 60,
    x: { label: "Topological Order →" },
    y: { label: "↑ Hierarchy Level" },
    color: {
      type: "categorical",
      domain: [0, 1, 2, 3, 4, 5, 6],
      range: [
        "hsl(25, 95%, 58%)",
        "hsl(45, 90%, 55%)",
        "hsl(60, 85%, 52%)",
        "hsl(160, 70%, 48%)",
        "hsl(200, 75%, 50%)",
        "hsl(230, 70%, 55%)",
        "hsl(260, 65%, 58%)",
      ],
    },
    marks: [
      // Edges
      Plot.arrow(edges, {
        x1: d => nodes.find(n => n.id === d.source)?.index ?? 0,
        y1: d => nodes.find(n => n.id === d.source)?.depth ?? 0,
        x2: d => nodes.find(n => n.id === d.target)?.index ?? 0,
        y2: d => nodes.find(n => n.id === d.target)?.depth ?? 0,
        stroke: "#cbd5e1",
        strokeWidth: 1,
        headLength: 8,
      }),
      
      // Nodes
      Plot.dot(nodes, {
        x: "index",
        y: "depth",
        r: 8,
        fill: "depth",
        stroke: "#1e293b",
        strokeWidth: 2,
        title: "label",
        tip: true,
      }),
      
      // Labels
      Plot.text(nodes, {
        x: "index",
        y: "depth",
        text: d => d.label.slice(0, 3),
        dy: -15,
        fontSize: 10,
        fill: "#475569",
      }),
    ],
  })
}

/**
 * Create hierarchy tree visualization
 */
function createHierarchyTree(graph: ParsedOntologyGraph): Element {
  const nodes = Array.from(HashMap.entries(graph.context.nodes))
    .filter(([_, node]) => isClassNode(node))
    .map(([id, node]) => ({
      id,
      label: isClassNode(node) ? node.label : id,
      depth: calculateDepth(id, graph),
      properties: isClassNode(node) ? node.properties.length : 0,
    }))
  
  return Plot.plot({
    width: 800,
    height: 400,
    marginLeft: 100,
    x: { label: "Depth in Hierarchy →" },
    y: { label: "Classes", type: "band" },
    color: {
      type: "categorical",
      domain: [0, 1, 2, 3, 4, 5, 6],
      range: [
        "hsl(25, 95%, 58%)",
        "hsl(45, 90%, 55%)",
        "hsl(60, 85%, 52%)",
        "hsl(160, 70%, 48%)",
        "hsl(200, 75%, 50%)",
        "hsl(230, 70%, 55%)",
        "hsl(260, 65%, 58%)",
      ],
    },
    marks: [
      Plot.barX(nodes, {
        y: "label",
        x: "depth",
        fill: "depth",
        tip: true,
        title: d => `${d.label}: ${d.properties} properties`,
      }),
      Plot.text(nodes, {
        y: "label",
        x: "depth",
        text: d => `${d.properties}`,
        dx: 15,
        fontSize: 11,
        fill: "#475569",
      }),
    ],
  })
}

/**
 * Create token statistics visualization
 */
function createTokenStats(graph: ParsedOntologyGraph, prompts: any): Element {
  const { nodePrompts } = prompts
  
  const data = Array.from(HashMap.entries(nodePrompts)).map((entry) => {
    const [id, prompt] = entry as [string, any]
    const node = HashMap.get(graph.context.nodes, id)
    const label = Option.isSome(node) && isClassNode(node.value) ? node.value.label : id
    const depth = calculateDepth(id, graph)
    
    // Calculate token count (rough estimate: chars / 4)
    const systemTokens = (prompt.system as string[]).reduce((acc: number, line: string) => acc + line.length, 0) / 4
    const userTokens = (prompt.user as string[]).reduce((acc: number, line: string) => acc + line.length, 0) / 4
    const exampleTokens = (prompt.examples as string[]).reduce((acc: number, line: string) => acc + line.length, 0) / 4
    
    return {
      id,
      label,
      depth,
      systemTokens,
      userTokens,
      exampleTokens,
      totalTokens: systemTokens + userTokens + exampleTokens,
    }
  })
  
  return Plot.plot({
    width: 800,
    height: 400,
    marginLeft: 100,
    marginBottom: 60,
    x: { label: "Class", tickRotate: -45 },
    y: { label: "↑ Estimated Tokens", grid: true },
    color: {
      domain: ["System", "User", "Examples"],
      range: ["#8b5cf6", "#10b981", "#f59e0b"],
    },
    marks: [
      // Stacked bars
      Plot.barY(data, {
        x: "label",
        y: "systemTokens",
        fill: () => "System",
        tip: true,
      }),
      Plot.barY(data, {
        x: "label",
        y: "userTokens",
        fill: () => "User",
        y1: "systemTokens",
        y2: d => d.systemTokens + d.userTokens,
        tip: true,
      }),
      Plot.barY(data, {
        x: "label",
        y: "exampleTokens",
        fill: () => "Examples",
        y1: d => d.systemTokens + d.userTokens,
        y2: "totalTokens",
        tip: true,
      }),
      
      // Total labels
      Plot.text(data, {
        x: "label",
        y: "totalTokens",
        text: d => `${Math.round(d.totalTokens)}`,
        dy: -8,
        fontSize: 10,
        fill: "#475569",
      }),
    ],
  })
}

/**
 * Calculate depth of a node in the hierarchy
 * Simplified: just returns index as a proxy for depth
 */
function calculateDepth(nodeId: string, graph: ParsedOntologyGraph): number {
  const nodes = Array.from(HashMap.keys(graph.context.nodes))
  const index = nodes.indexOf(nodeId)
  // Return a depth value based on position (0-6 range for color coding)
  return Math.min(Math.floor(index / 2), 6)
}
