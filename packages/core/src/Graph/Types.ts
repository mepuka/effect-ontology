/**
 * Graph-Based Ontology Types
 *
 * Following the architecture from docs/effect_graph_implementation.md:
 * - Classes are nodes in the Graph
 * - Properties are data attached to class nodes (NOT graph nodes, to avoid cycles)
 * - Graph edges represent subClassOf relationships (Child -> Parent dependency)
 */

import type { HashMap } from "effect"
import { Schema } from "effect"

/**
 * NodeId - Unique identifier for graph nodes (typically IRI)
 */
export const NodeIdSchema = Schema.String
export type NodeId = typeof NodeIdSchema.Type

/**
 * PropertyData - Information attached to a ClassNode
 *
 * Properties are stored as data on their domain class, not as separate graph nodes.
 * This prevents cycles: if Property were a node, then
 *   Dog -> hasOwner (domain) and hasOwner -> Dog (creates cycle)
 */
export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  range: Schema.String // IRI or datatype - stored as string reference (not graph edge)
})
export type PropertyData = typeof PropertyDataSchema.Type

/**
 * ClassNode - A node representing an OWL Class
 */
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  _tag: Schema.Literal("Class").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Class" as const,
      decoding: () => "Class" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String,
  properties: Schema.Array(PropertyDataSchema)
}) {}

/**
 * PropertyNode - A separate node for properties (optional, for flexibility)
 *
 * In the main graph, properties are attached to ClassNode.
 * This type exists for cases where we need to treat properties as first-class entities.
 */
export class PropertyNode extends Schema.Class<PropertyNode>("PropertyNode")({
  _tag: Schema.Literal("Property").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Property" as const,
      decoding: () => "Property" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String,
  domain: NodeIdSchema, // Class IRI reference
  range: Schema.String, // IRI or datatype
  functional: Schema.Boolean
}) {}

/**
 * OntologyNode - Discriminated union of all node types
 */
export const OntologyNodeSchema = Schema.Union(ClassNode, PropertyNode)
export type OntologyNode = typeof OntologyNodeSchema.Type

/**
 * Type guards for OntologyNode variants using instanceof
 */
export const isClassNode = (node: OntologyNode): node is ClassNode => node instanceof ClassNode
export const isPropertyNode = (node: OntologyNode): node is PropertyNode => node instanceof PropertyNode

/**
 * OntologyContext - The data store mapping NodeId to Node data
 *
 * The Graph structure (Effect.Graph) holds relationships.
 * This context holds the actual data for each node.
 */
export interface OntologyContext {
  readonly nodes: HashMap.HashMap<NodeId, OntologyNode>
  /**
   * Universal Properties - Properties without explicit rdfs:domain
   *
   * These are domain-agnostic properties (e.g., Dublin Core metadata)
   * that can apply to any resource. Kept separate from the graph to:
   * - Avoid token bloat (not repeated on every class)
   * - Maintain graph hygiene (strict dependencies only)
   * - Improve LLM comprehension (global context)
   */
  readonly universalProperties: ReadonlyArray<PropertyData>
  /**
   * Mapping from NodeId (IRI) to Graph NodeIndex (number)
   * Needed because Effect.Graph uses numeric indices internally
   */
  readonly nodeIndexMap: HashMap.HashMap<NodeId, number>
}

/**
 * GraphAlgebra - The algebra for folding over the graph
 *
 * Type: D × List<R> → R
 * where D is the node data (OntologyNode)
 * and R is the result type (generic, typically StructuredPrompt)
 *
 * @param nodeData - The data of the current node being processed
 * @param childrenResults - Ordered list of results from the node's dependencies (children)
 * @returns The result for the current node
 */
export type GraphAlgebra<R> = (
  nodeData: OntologyNode,
  childrenResults: ReadonlyArray<R>
) => R
