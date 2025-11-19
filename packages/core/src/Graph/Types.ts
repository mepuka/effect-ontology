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
 * OntologyContext Schema - The data store mapping NodeId to Node data
 *
 * The Graph structure (Effect.Graph) holds relationships.
 * This context holds the actual data for each node.
 *
 * **Effect Schema Integration:**
 * - Uses Schema.Struct for validation and transformation
 * - Provides Schema.make() factory for type-safe construction
 * - Enables functional transformations via Schema.transform
 *
 * @since 1.0.0
 * @category models
 *
 * @example
 * ```typescript
 * import { OntologyContext } from "./Graph/Types.js"
 * import { HashMap } from "effect"
 *
 * // Create using factory (validates structure)
 * const context = OntologyContext.make({
 *   nodes: HashMap.empty(),
 *   universalProperties: [],
 *   nodeIndexMap: HashMap.empty()
 * })
 * ```
 */
export const OntologyContextSchema = Schema.Struct({
  /**
   * Mapping from NodeId (IRI) to OntologyNode (ClassNode | PropertyNode)
   *
   * Uses Effect HashMap for efficient immutable operations.
   */
  nodes: Schema.HashMap({
    key: NodeIdSchema,
    value: OntologyNodeSchema
  }),

  /**
   * Universal Properties - Properties without explicit rdfs:domain
   *
   * These are domain-agnostic properties (e.g., Dublin Core metadata)
   * that can apply to any resource. Kept separate from the graph to:
   * - Avoid token bloat (not repeated on every class)
   * - Maintain graph hygiene (strict dependencies only)
   * - Improve LLM comprehension (global context)
   */
  universalProperties: Schema.Array(PropertyDataSchema),

  /**
   * Mapping from NodeId (IRI) to Graph NodeIndex (number)
   *
   * Needed because Effect.Graph uses numeric indices internally.
   */
  nodeIndexMap: Schema.HashMap({
    key: NodeIdSchema,
    value: Schema.Number
  })
})

/**
 * OntologyContext Type - Inferred from Schema
 *
 * @since 1.0.0
 * @category models
 */
export type OntologyContext = typeof OntologyContextSchema.Type

/**
 * OntologyContext Factory - Type-safe constructor with validation
 *
 * Creates an OntologyContext instance with automatic validation.
 * Throws if the structure doesn't match the schema.
 *
 * @since 1.0.0
 * @category constructors
 *
 * @example
 * ```typescript
 * import { OntologyContext } from "./Graph/Types.js"
 * import { HashMap } from "effect"
 *
 * const context = OntologyContext.make({
 *   nodes: HashMap.empty(),
 *   universalProperties: [],
 *   nodeIndexMap: HashMap.empty()
 * })
 * ```
 */
export const OntologyContext = {
  /**
   * Schema definition for OntologyContext
   */
  schema: OntologyContextSchema,

  /**
   * Create OntologyContext with validation
   *
   * @param input - Raw ontology context data
   * @returns Validated OntologyContext
   * @throws ParseError if validation fails
   */
  make: Schema.make(OntologyContextSchema),

  /**
   * Create empty OntologyContext
   *
   * Convenience factory for creating an empty ontology context.
   *
   * @returns Empty OntologyContext with no nodes or properties
   */
  empty: (): OntologyContext => ({
    nodes: HashMap.empty(),
    universalProperties: [],
    nodeIndexMap: HashMap.empty()
  })
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
