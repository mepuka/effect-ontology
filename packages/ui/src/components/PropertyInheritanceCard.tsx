import { motion, AnimatePresence } from "framer-motion"
import { Layers, ChevronDown, ChevronUp, Database, Link2 } from "lucide-react"
import { useState } from "react"
import type { PropertyData } from "@effect-ontology/core/Graph/Types"
import type { KnowledgeUnit } from "@effect-ontology/core/Prompt"

/**
 * PropertyInheritanceCard - Visualizes property accumulation through inheritance
 *
 * Features:
 * - Shows "own" properties vs "inherited" properties
 * - Stacked card visualization (own properties on top, inherited below)
 * - Visual differentiation between direct and inherited properties
 * - Collapsible sections for better UX
 */
export const PropertyInheritanceCard = ({
  unit,
  universalProperties,
  className
}: {
  unit: KnowledgeUnit
  universalProperties: ReadonlyArray<PropertyData>
  className?: string
}): React.ReactElement => {
  const [showInherited, setShowInherited] = useState(true)
  const [showUniversal, setShowUniversal] = useState(false)

  // Properties are already computed in KnowledgeUnit
  const directProperties = unit.properties
  const inheritedProperties = unit.inheritedProperties

  const totalProperties = directProperties.length + inheritedProperties.length + universalProperties.length

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden ${className || ''}`}>
      {/* Header */}
      <div className="bg-linear-to-r from-blue-500 to-blue-600 text-white px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold">{unit.label}</h3>
          <div className="flex items-center gap-2 text-sm bg-white/20 px-3 py-1 rounded-full">
            <Layers className="w-4 h-4" />
            <span>{totalProperties} total</span>
          </div>
        </div>
        <div className="text-xs font-mono text-blue-100 break-all">
          {unit.iri}
        </div>
      </div>

      {/* Property Sections */}
      <div className="divide-y divide-slate-200">
        {/* Own Properties - Always visible, top layer */}
        <PropertySection
          title="Direct Properties"
          subtitle={`Defined on ${unit.label}`}
          properties={directProperties}
          color="blue"
          icon={<Database className="w-4 h-4" />}
          defaultExpanded={true}
          stackLayer={3}
        />

        {/* Inherited Properties - Middle layer */}
        {inheritedProperties.length > 0 && (
          <PropertySection
            title="Inherited Properties"
            subtitle="From parent classes"
            properties={inheritedProperties}
            color="violet"
            icon={<Link2 className="w-4 h-4" />}
            defaultExpanded={showInherited}
            onToggle={() => setShowInherited(!showInherited)}
            stackLayer={2}
          />
        )}

        {/* Universal Properties - Bottom layer */}
        {universalProperties.length > 0 && (
          <PropertySection
            title="Universal Properties"
            subtitle="Domain-agnostic (available to all classes)"
            properties={universalProperties}
            color="amber"
            icon={<Layers className="w-4 h-4" />}
            defaultExpanded={showUniversal}
            onToggle={() => setShowUniversal(!showUniversal)}
            stackLayer={1}
          />
        )}
      </div>

      {/* Summary Footer */}
      <div className="bg-slate-50 px-6 py-3 text-xs text-slate-600 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <span>
            {directProperties.length} direct + {inheritedProperties.length} inherited + {universalProperties.length} universal
          </span>
          <span className="text-blue-600 font-semibold">
            = {totalProperties} total properties
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Collapsible property section
 */
const PropertySection = ({
  title,
  subtitle,
  properties,
  color,
  icon,
  defaultExpanded,
  onToggle,
  stackLayer
}: {
  title: string
  subtitle: string
  properties: ReadonlyArray<PropertyData>
  color: 'blue' | 'violet' | 'amber'
  icon: React.ReactNode
  defaultExpanded: boolean
  onToggle?: () => void
  stackLayer: number
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
    onToggle?.()
  }

  const colorMap = {
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-700'
    },
    violet: {
      bg: 'bg-violet-50',
      text: 'text-violet-700',
      border: 'border-violet-200',
      badge: 'bg-violet-100 text-violet-700'
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-700'
    }
  }

  const colors = colorMap[color]

  return (
    <motion.div
      className={`${colors.bg} transition-all`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (4 - stackLayer) * 0.1 }}
    >
      {/* Section Header */}
      <button
        onClick={handleToggle}
        className={`w-full px-6 py-4 flex items-center justify-between hover:${colors.bg} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <div className={colors.text}>
            {icon}
          </div>
          <div className="text-left">
            <div className={`text-sm font-semibold ${colors.text}`}>
              {title}
            </div>
            <div className="text-xs text-slate-500">
              {subtitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded ${colors.badge} font-semibold`}>
            {properties.length}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Property List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-2">
              {properties.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-2">
                  No properties in this category
                </div>
              ) : (
                properties.map((prop, idx) => (
                  <PropertyCard key={idx} property={prop} stackLayer={stackLayer} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * Individual property card
 */
const PropertyCard = ({
  property,
  stackLayer
}: {
  property: PropertyData
  stackLayer: number
}) => {
  const rangeLabel = extractLabel(property.range)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: stackLayer * 0.05 }}
      className="bg-white border border-slate-200 rounded p-3 hover:border-blue-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
          {property.label}
        </div>
        <div className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
          {rangeLabel}
        </div>
      </div>

      <div className="text-xs font-mono text-slate-400 break-all">
        {property.iri}
      </div>

      {/* Range info */}
      <div className="mt-2 text-xs text-slate-500">
        Range: <span className="font-semibold">{property.range}</span>
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
