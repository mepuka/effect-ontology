/**
 * Graph-Based Ontology Types
 *
 * Following the architecture from docs/effect_graph_implementation.md:
 * - Classes are nodes in the Graph
 * - Properties are data attached to class nodes (NOT graph nodes, to avoid cycles)
 * - Graph edges represent subClassOf relationships (Child -> Parent dependency)
 */

/**
 * NodeId - Unique identifier for graph nodes (typically IRI)
 */
export type NodeId = string

/**
 * PropertyData - Information attached to a ClassNode
 *
 * Properties are stored as data on their domain class, not as separate graph nodes.
 * This prevents cycles: if Property were a node, then
 *   Dog -> hasOwner (domain) and hasOwner -> Dog (creates cycle)
 */
export interface PropertyData {
  readonly iri: string
  readonly label: string
  readonly range: string // IRI or datatype - stored as string reference (not graph edge)
}

/**
 * ClassNode - A node representing an OWL Class
 */
export interface ClassNode {
  readonly _tag: "Class"
  readonly id: NodeId // IRI
  readonly label: string
  readonly properties: ReadonlyArray<PropertyData>
}

/**
 * PropertyNode - A separate node for properties (optional, for flexibility)
 *
 * In the main graph, properties are attached to ClassNode.
 * This type exists for cases where we need to treat properties as first-class entities.
 */
export interface PropertyNode {
  readonly _tag: "Property"
  readonly id: NodeId // IRI
  readonly label: string
  readonly domain: NodeId // Class IRI reference
  readonly range: string // IRI or datatype
  readonly functional: boolean
}

/**
 * OntologyNode - Discriminated union of all node types
 */
export type OntologyNode = ClassNode | PropertyNode

/**
 * OntologyContext - The data store mapping NodeId to Node data
 *
 * The Graph structure (Effect.Graph) holds relationships.
 * This context holds the actual data for each node.
 */
export interface OntologyContext {
  readonly nodes: Map<NodeId, OntologyNode>
  /**
   * Mapping from NodeId (IRI) to Graph NodeIndex (number)
   * Needed because Effect.Graph uses numeric indices internally
   */
  readonly nodeIndexMap: Map<NodeId, number>
}
