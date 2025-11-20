/**
 * IRI Chip Component
 *
 * Displays an IRI as a clickable chip with abbreviated text and full IRI on hover.
 * Clicking navigates to the corresponding node in the ontology graph.
 */

import { motion } from "framer-motion"
import { ExternalLink } from "lucide-react"
import { Option } from "effect"
import { useAtomSet } from "@effect-atom/atom-react"
import { selectedNodeAtom } from "../state/store"
import { abbreviateIRI } from "../utils/schemaUtils"

export interface IriChipProps {
  /** Full IRI to display */
  iri: string
  /** Optional custom prefixes for abbreviation */
  prefixes?: Map<string, string>
  /** Optional click handler (overrides default navigation) */
  onClick?: (iri: string) => void
}

/**
 * IriChip - Clickable IRI component with hover tooltip
 *
 * Features:
 * - Abbreviated display (prefix:localName)
 * - Full IRI on hover
 * - Click to navigate to node in graph
 * - Smooth animations
 */
export const IriChip = ({ iri, prefixes, onClick }: IriChipProps) => {
  const setSelectedNode = useAtomSet(selectedNodeAtom)
  const abbreviated = abbreviateIRI(iri, prefixes)
  
  const handleClick = () => {
    if (onClick) {
      onClick(iri)
    } else {
      // Default behavior: select the node in the graph
      setSelectedNode(Option.some(iri))
    }
  }
  
  return (
    <motion.button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 text-blue-700 hover:text-blue-900 text-xs font-mono transition-colors cursor-pointer group"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      title={iri}
    >
      <span className="font-semibold">{abbreviated}</span>
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.button>
  )
}

/**
 * IriList - Display multiple IRIs as chips
 *
 * Wraps chips in a flex container with proper spacing.
 */
export const IriList = ({ 
  iris, 
  prefixes 
}: { 
  iris: string[]
  prefixes?: Map<string, string>
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      {iris.map((iri, index) => (
        <IriChip key={`${iri}-${index}`} iri={iri} prefixes={prefixes} />
      ))}
    </div>
  )
}

