/**
 * Depth-based color coding utilities
 *
 * Maps hierarchy depth to warm→cool gradient for visual depth encoding
 * Based on design: PROVENANCE_VISUALIZATION_DESIGN.md
 */

/**
 * Get color for a given depth level
 *
 * Warm colors (orange/red) for shallow/root nodes
 * Cool colors (blue/cyan) for deep/leaf nodes
 *
 * @param depth - Depth in hierarchy (0 = root)
 * @param maxDepth - Maximum depth in current ontology
 * @returns Tailwind color class
 */
export const getDepthColor = (depth: number, maxDepth: number): string => {
  if (maxDepth === 0) return "text-orange-500"

  const ratio = depth / maxDepth

  if (ratio < 0.25) return "text-orange-500" // Root level
  if (ratio < 0.5) return "text-amber-500" // Near root
  if (ratio < 0.75) return "text-cyan-500" // Mid-depth
  return "text-blue-500" // Deep/leaf
}

/**
 * Get background color for a given depth level
 */
export const getDepthBgColor = (depth: number, maxDepth: number): string => {
  if (maxDepth === 0) return "bg-orange-500/10"

  const ratio = depth / maxDepth

  if (ratio < 0.25) return "bg-orange-500/10"
  if (ratio < 0.5) return "bg-amber-500/10"
  if (ratio < 0.75) return "bg-cyan-500/10"
  return "bg-blue-500/10"
}

/**
 * Get border color for a given depth level
 */
export const getDepthBorderColor = (depth: number, maxDepth: number): string => {
  if (maxDepth === 0) return "border-orange-500"

  const ratio = depth / maxDepth

  if (ratio < 0.25) return "border-orange-500"
  if (ratio < 0.5) return "border-amber-500"
  if (ratio < 0.75) return "border-cyan-500"
  return "border-blue-500"
}

/**
 * Get semantic label for depth position
 */
export const getDepthLabel = (depth: number, maxDepth: number): string => {
  if (maxDepth === 0) return "Root"

  const ratio = depth / maxDepth

  if (ratio < 0.25) return "Root"
  if (ratio < 0.5) return "Near Root"
  if (ratio < 0.75) return "Mid-Depth"
  return "Leaf"
}
