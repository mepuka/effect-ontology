import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Graph as EffectGraph, Option, Array as EffectArray, pipe } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import type { ClassNode as ClassNodeType, NodeId } from "@effect-ontology/core/Graph/Types"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { ontologyGraphAtom, topologicalOrderAtom } from "../state/store"
import { Result } from "@effect-atom/atom-react"
import { motion } from "framer-motion"
import { useRef, useEffect, useState } from "react"

/**
 * ClassHierarchyGraph - Enhanced topological visualization with dependency arcs
 *
 * Features:
 * - SVG-based arc visualization showing parent-child relationships
 * - Hover to highlight dependency chains
 * - Visual flow from children to parents
 * - Responsive layout with smooth animations
 */
export const ClassHierarchyGraph = ({
  onNodeClick,
  selectedNodeId
}: {
  onNodeClick: (nodeId: string) => void
  selectedNodeId?: string
}): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const topologicalOrderResult = useAtomValue(topologicalOrderAtom) as Result.Result<string[], any>
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-slate-400 text-sm">Computing graph layout...</div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-red-500 text-sm max-w-md text-center">
          <div className="font-semibold mb-2">Graph Error</div>
          <div className="text-xs font-mono">{String(failure.cause)}</div>
        </div>
      </div>
    ),
    onSuccess: (graphSuccess) => {
      return Result.match(topologicalOrderResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400 text-sm">Computing topology...</div>
          </div>
        ),
        onFailure: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 text-sm">Error computing topology</div>
          </div>
        ),
        onSuccess: (topoSuccess) => {
          const { context, graph } = graphSuccess.value
          const topologicalOrder = topoSuccess.value

          // Build position map for nodes
          const nodePositions = new Map<string, { x: number; y: number; index: number }>()
          const NODE_SPACING = 140
          const START_X = 80

          topologicalOrder.forEach((nodeId, index) => {
            nodePositions.set(nodeId, {
              x: START_X + index * NODE_SPACING,
              y: 100, // Center Y position
              index
            })
          })

          // Extract edges from the graph
          const edges = extractEdges(graph, context)

          return (
            <div ref={containerRef} className="relative h-full bg-gradient-to-b from-slate-50 to-white overflow-x-auto overflow-y-hidden">
              <svg
                className="absolute top-0 left-0"
                width={START_X * 2 + topologicalOrder.length * NODE_SPACING}
                height="100%"
                style={{ minWidth: "100%" }}
              >
                {/* Draw dependency arcs */}
                {edges.map(({ from, to }, idx) => {
                  const fromPos = nodePositions.get(from)
                  const toPos = nodePositions.get(to)

                  if (!fromPos || !toPos) return null

                  const isHighlighted =
                    hoveredNode === from || hoveredNode === to

                  return (
                    <DependencyArc
                      key={`${from}-${to}-${idx}`}
                      x1={fromPos.x}
                      y1={fromPos.y}
                      x2={toPos.x}
                      y2={toPos.y}
                      highlighted={isHighlighted}
                    />
                  )
                })}
              </svg>

              {/* Node layer */}
              <div className="relative" style={{ height: "100%", minWidth: START_X * 2 + topologicalOrder.length * NODE_SPACING }}>
                {topologicalOrder.flatMap((nodeId) => {
                  return pipe(
                    HashMap.get(context.nodes, nodeId),
                    Option.filter(isClassNode),
                    Option.map((node: ClassNodeType) => {
                      const position = nodePositions.get(nodeId)!
                      const isSelected = selectedNodeId === nodeId
                      const isHovered = hoveredNode === nodeId

                      return (
                        <ClassNode
                          key={nodeId}
                          nodeId={nodeId}
                          label={node.label}
                          propertyCount={node.properties.length}
                          x={position.x}
                          y={position.y}
                          isSelected={isSelected}
                          isHovered={isHovered}
                          onMouseEnter={() => setHoveredNode(nodeId)}
                          onMouseLeave={() => setHoveredNode(null)}
                          onClick={() => onNodeClick(nodeId)}
                        />
                      )
                    }),
                    Option.toArray
                  )
                })}
              </div>
            </div>
          )
        }
      })
    }
  })
}

/**
 * Individual class node component
 */
const ClassNode = ({
  nodeId,
  label,
  propertyCount,
  x,
  y,
  isSelected,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick
}: {
  nodeId: string
  label: string
  propertyCount: number
  x: number
  y: number
  isSelected: boolean
  isHovered: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
}) => {
  return (
    <motion.div
      className="absolute group"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)"
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Node Circle */}
      <motion.button
        onClick={onClick}
        className={`
          relative w-20 h-20 rounded-full border-3 shadow-lg
          flex flex-col items-center justify-center
          text-xs font-bold font-mono
          transition-all cursor-pointer
          ${isSelected
            ? "bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700 text-white shadow-xl scale-110 ring-4 ring-blue-300"
            : isHovered
            ? "bg-gradient-to-br from-blue-400 to-blue-500 border-blue-600 text-white shadow-xl scale-105"
            : "bg-white border-blue-400 text-blue-700 hover:shadow-xl"
          }
        `}
        whileHover={{ scale: isSelected ? 1.1 : 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Property count badge */}
        <div className={`text-[10px] ${isSelected || isHovered ? 'opacity-80' : 'opacity-60'} mb-1`}>
          {propertyCount} props
        </div>

        {/* Label abbreviation */}
        <div className="text-sm font-extrabold">
          {label.substring(0, 3).toUpperCase()}
        </div>
      </motion.button>

      {/* Hover tooltip */}
      <motion.div
        className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : -10 }}
        transition={{ duration: 0.2 }}
      >
        <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs whitespace-nowrap">
          <div className="font-semibold">{label}</div>
          <div className="text-[10px] text-slate-400 mt-1">
            {propertyCount} {propertyCount === 1 ? 'property' : 'properties'}
          </div>
          <div className="text-[9px] text-slate-500 mt-1 font-mono max-w-xs truncate">
            {nodeId}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * Dependency arc component (child -> parent)
 */
const DependencyArc = ({
  x1,
  y1,
  x2,
  y2,
  highlighted
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  highlighted: boolean
}) => {
  // Calculate control points for smooth bezier curve
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Arc height based on distance
  const arcHeight = Math.min(dist * 0.3, 60)

  // Control point for quadratic bezier (arc upward)
  const cpX = (x1 + x2) / 2
  const cpY = Math.min(y1, y2) - arcHeight

  const path = `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`

  return (
    <g>
      {/* Shadow/glow effect when highlighted */}
      {highlighted && (
        <motion.path
          d={path}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="6"
          opacity="0.3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}

      {/* Main arc */}
      <motion.path
        d={path}
        fill="none"
        stroke={highlighted ? "#3b82f6" : "#cbd5e1"}
        strokeWidth={highlighted ? "3" : "2"}
        opacity={highlighted ? 1 : 0.4}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      {/* Arrowhead */}
      <motion.circle
        cx={x2}
        cy={y2}
        r={highlighted ? 4 : 3}
        fill={highlighted ? "#3b82f6" : "#94a3b8"}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.8, type: "spring" }}
      />
    </g>
  )
}

/**
 * Extract edges from Effect Graph using proper Effect patterns
 */
function extractEdges(graph: any, context: any): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = []

  for (const [nodeIdRaw, _] of HashMap.entries(context.nodes)) {
    const nodeId = nodeIdRaw as string
    const nodeIndexOption = HashMap.get(context.nodeIndexMap, nodeId) as Option.Option<number>
    if (Option.isSome(nodeIndexOption)) {
      const nodeIndex = nodeIndexOption.value as number
      const neighbors = EffectGraph.neighbors(graph, nodeIndex)
      for (const parentIndex of neighbors) {
        const parentIdOption = EffectGraph.getNode(graph, parentIndex) as Option.Option<string>
        if (Option.isSome(parentIdOption)) {
          edges.push({ from: nodeId, to: (parentIdOption.value as unknown) as string })
        }
      }
    }
  }

  return edges
}
