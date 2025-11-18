import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, X, Info } from "lucide-react"
import { useState } from "react"
import type { PropertyData } from "@effect-ontology/core/Graph/Types"

/**
 * UniversalPropertiesPanel - Interactive overlay for domain-agnostic properties
 *
 * Features:
 * - Floating badge showing count of universal properties
 * - Expandable panel with property details
 * - Visual indication that these apply to all classes
 * - Particle/field metaphor design
 */
export const UniversalPropertiesPanel = ({
  universalProperties,
  className
}: {
  universalProperties: PropertyData[]
  className?: string
}): React.ReactElement | null => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hoveredProperty, setHoveredProperty] = useState<string | null>(null)

  if (universalProperties.length === 0) return null

  return (
    <>
      {/* Floating Badge - Click to expand */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-2 px-4 py-2.5 rounded-full
          bg-gradient-to-r from-violet-500 to-purple-600
          text-white shadow-lg hover:shadow-xl
          transition-all ${className || ''}
        `}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring" }}
      >
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="w-4 h-4" />
        </motion.div>
        <span className="text-sm font-semibold">
          {universalProperties.length} Universal Properties
        </span>
        <motion.div
          className="w-2 h-2 rounded-full bg-white"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.button>

      {/* Expanded Panel Overlay */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
            />

            {/* Panel Content */}
            <motion.div
              className="fixed inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[600px] top-20 z-50 max-h-[80vh] overflow-hidden"
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              transition={{ type: "spring", damping: 25 }}
            >
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-6 py-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Universal Properties</h2>
                        <div className="text-sm text-violet-100">
                          Domain-agnostic • Available to all classes
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsExpanded(false)}
                      className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Info Banner */}
                <div className="bg-violet-50 border-b border-violet-200 px-6 py-3">
                  <div className="flex items-start gap-2 text-sm text-violet-800">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      These properties have no explicit <code className="bg-violet-200 px-1 rounded">rdfs:domain</code>.
                      They act as a "universal field" applicable to any class in the ontology.
                    </div>
                  </div>
                </div>

                {/* Properties Grid */}
                <div className="overflow-y-auto max-h-[60vh] p-6">
                  <div className="grid gap-3">
                    {universalProperties.map((prop, idx) => (
                      <UniversalPropertyCard
                        key={idx}
                        property={prop}
                        index={idx}
                        isHovered={hoveredProperty === prop.iri}
                        onHover={(iri) => setHoveredProperty(iri)}
                        onLeave={() => setHoveredProperty(null)}
                      />
                    ))}
                  </div>
                </div>

                {/* Footer Stats */}
                <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-slate-600">
                      <span className="font-semibold text-violet-600">
                        {universalProperties.length}
                      </span>{" "}
                      properties available globally
                    </div>
                    <div className="text-xs text-slate-500">
                      Hover to preview • Click card for details
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/**
 * Individual universal property card
 */
const UniversalPropertyCard = ({
  property,
  index,
  isHovered,
  onHover,
  onLeave
}: {
  property: PropertyData
  index: number
  isHovered: boolean
  onHover: (iri: string) => void
  onLeave: () => void
}) => {
  const rangeLabel = extractLabel(property.range)

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={() => onHover(property.iri)}
      onMouseLeave={onLeave}
      className={`
        relative overflow-hidden rounded-lg border-2 p-4
        transition-all cursor-pointer
        ${isHovered
          ? 'border-violet-400 bg-violet-50 shadow-lg scale-[1.02]'
          : 'border-violet-200 bg-white hover:border-violet-300'
        }
      `}
    >
      {/* Background particles effect on hover */}
      {isHovered && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-violet-400 rounded-full"
              initial={{
                x: Math.random() * 100 + "%",
                y: Math.random() * 100 + "%",
                opacity: 0
              }}
              animate={{
                x: Math.random() * 100 + "%",
                y: Math.random() * 100 + "%",
                opacity: [0, 0.6, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.2
              }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <div className="font-semibold text-slate-900 group-hover:text-violet-700 transition-colors">
            {property.label}
          </div>
          <div className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded font-mono font-semibold">
            {rangeLabel}
          </div>
        </div>

        <div className="text-xs font-mono text-slate-500 break-all mb-2">
          {property.iri}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Range:</span>
          <span className="font-semibold text-violet-600">
            {property.range}
          </span>
        </div>

        {/* Universality indicator */}
        <div className="mt-3 pt-3 border-t border-violet-100">
          <div className="flex items-center gap-2 text-xs text-violet-600">
            <Sparkles className="w-3 h-3" />
            <span className="font-semibold">Applies to all classes</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Extract readable label from IRI
 */
function extractLabel(iri: string): string {
  return iri.split('#').pop() || iri.split('/').pop() || iri
}
