/**
 * Inheritance Service - Resolves inherited properties and ancestors
 *
 * Handles the "Inheritance Gap" problem by computing effective properties
 * (own + inherited) for any class in the ontology.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Context, Data, Effect, Graph, HashMap, HashSet } from "effect"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { meet } from "./Constraint.js"

/**
 * Errors that can occur during inheritance resolution
 */
export class InheritanceError extends Data.TaggedError("InheritanceError")<{
  readonly nodeId: string
  readonly message: string
}> {}

export class CircularInheritanceError extends Data.TaggedError("CircularInheritanceError")<{
  readonly nodeId: string
  readonly cycle: ReadonlyArray<string>
}> {}

export class DisjointnessCheckError extends Data.TaggedError("DisjointnessCheckError")<{
  readonly class1: string
  readonly class2: string
  readonly cause: unknown
}> {}

/**
 * Result of disjointness checking between two classes
 *
 * Three-valued logic following Open World Assumption:
 * - Disjoint: Provably disjoint (explicit owl:disjointWith or transitive)
 * - Overlapping: Provably overlapping (common subclass exists)
 * - Unknown: No evidence either way (cannot prove disjoint or overlapping)
 */
export type DisjointnessResult =
  | { readonly _tag: "Disjoint" } // Provably disjoint
  | { readonly _tag: "Overlapping" } // Common subclass exists
  | { readonly _tag: "Unknown" } // No evidence (OWA)

/**
 * InheritanceService - Service for computing inherited attributes
 *
 * Provides methods to:
 * 1. Get all ancestors of a class (transitive closure of subClassOf)
 * 2. Get effective properties (own + inherited from ancestors)
 * 3. Check subclass relationships (semantic reasoning)
 */
export interface InheritanceService {
  /**
   * Get all ancestor IRIs for a given class
   *
   * Performs a depth-first traversal up the subClassOf hierarchy.
   * Returns ancestors in topological order (immediate parents first).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of ancestor IRIs, or error if class not found
   */
  readonly getAncestors: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>

  /**
   * Get all effective properties for a given class
   *
   * Combines:
   * - Direct properties defined on the class
   * - Properties inherited from all ancestors
   *
   * Deduplicates properties by IRI (child definition wins in case of conflict).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of properties, or error if class not found
   */
  readonly getEffectiveProperties: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError>

  /**
   * Get immediate parents of a class
   *
   * Returns only direct superclasses (one level up).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of parent IRIs
   */
  readonly getParents: (classIri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError>

  /**
   * Get immediate children of a class
   *
   * Returns only direct subclasses (one level down).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of child IRIs
   */
  readonly getChildren: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError>

  /**
   * Check if child class is a subclass of parent class
   *
   * Implements semantic subclass reasoning:
   * - Reflexive: A ⊑ A (every class is a subclass of itself)
   * - Transitive: A ⊑ B ∧ B ⊑ C ⟹ A ⊑ C
   *
   * Uses cached ancestor sets for O(1) lookup after first query.
   *
   * @param child - IRI of the potential subclass
   * @param parent - IRI of the potential superclass
   * @returns Effect containing true if child ⊑ parent, false otherwise
   *
   * @example
   * ```typescript
   * // Dog ⊑ Animal (direct)
   * yield* isSubclass("http://ex.org/Dog", "http://ex.org/Animal") // true
   *
   * // Dog ⊑ Thing (transitive via Animal)
   * yield* isSubclass("http://ex.org/Dog", "http://ex.org/Thing") // true
   *
   * // Dog ⊑ Dog (reflexive)
   * yield* isSubclass("http://ex.org/Dog", "http://ex.org/Dog") // true
   *
   * // Animal ⊑ Dog (wrong direction)
   * yield* isSubclass("http://ex.org/Animal", "http://ex.org/Dog") // false
   * ```
   */
  readonly isSubclass: (
    child: string,
    parent: string
  ) => Effect.Effect<boolean, InheritanceError | CircularInheritanceError>

  /**
   * Check if two classes are disjoint
   *
   * Implements three-valued disjointness logic (Open World Assumption):
   * - Disjoint: Provably disjoint via owl:disjointWith (direct or transitive)
   * - Overlapping: Provably overlapping (common subclass exists)
   * - Unknown: No evidence either way
   *
   * **Algorithm:**
   * 1. Check explicit disjointness in disjointWithMap (O(1))
   * 2. Check transitive disjointness via superclasses
   * 3. Check for overlap (common subclass)
   * 4. Return Unknown (OWA)
   *
   * @param class1 - IRI of first class
   * @param class2 - IRI of second class
   * @returns Effect containing DisjointnessResult
   *
   * @example
   * ```typescript
   * // Explicit disjointness
   * yield* areDisjoint("Dog", "Cat") // { _tag: "Disjoint" }
   *
   * // Transitive via superclass
   * yield* areDisjoint("Dog", "Person") // { _tag: "Disjoint" } (Animal disjoint Person)
   *
   * // Overlapping (Dog is subclass of Animal)
   * yield* areDisjoint("Dog", "Animal") // { _tag: "Overlapping" }
   *
   * // No evidence
   * yield* areDisjoint("Dog", "Robot") // { _tag: "Unknown" }
   * ```
   */
  readonly areDisjoint: (
    class1: string,
    class2: string
  ) => Effect.Effect<DisjointnessResult, DisjointnessCheckError>
}

/**
 * Service Tag for InheritanceService
 *
 * Used for Effect's dependency injection system.
 */
export const InheritanceService = Context.GenericTag<InheritanceService>(
  "@effect-ontology/InheritanceService"
)

/**
 * Helper: Get node index from IRI
 */
const getNodeIndex = (
  iri: string,
  context: OntologyContext
): Effect.Effect<Graph.NodeIndex, InheritanceError> =>
  HashMap.get(context.nodeIndexMap, iri).pipe(
    Effect.mapError(
      () =>
        new InheritanceError({
          nodeId: iri,
          message: `IRI ${iri} not found in nodeIndexMap`
        })
    )
  )

/**
 * Get immediate parents (neighbors in the graph)
 */
const getParentsImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
  Effect.gen(function*() {
    const nodeIndex = yield* getNodeIndex(classIri, context)

    // Graph edges are Child -> Parent, so neighbors are parents
    const parentIndices = Graph.neighbors(graph, nodeIndex)

    // Convert indices back to IRIs
    const parents: Array<string> = []
    for (const parentIndex of parentIndices) {
      const parentIri = yield* Graph.getNode(graph, parentIndex).pipe(
        Effect.mapError(
          () =>
            new InheritanceError({
              nodeId: classIri,
              message: `Parent node index ${parentIndex} not found in graph`
            })
        )
      )
      parents.push(parentIri)
    }

    return parents
  })

/**
 * Get immediate children (reverse lookup - nodes that point to this one)
 */
const getChildrenImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
  Effect.gen(function*() {
    const targetIndex = yield* getNodeIndex(classIri, context)

    const children: Array<string> = []

    // Iterate all nodes to find those with edges to this node
    for (const [nodeIndex, nodeIri] of graph) {
      const neighbors = Graph.neighbors(graph, nodeIndex)
      if (Array.from(neighbors).includes(targetIndex)) {
        children.push(nodeIri)
      }
    }

    return children
  })

/**
 * Implementation of getAncestors - performs DFS up subClassOf hierarchy
 *
 * **Complexity:** O(V+E) for single call, where V = visited nodes, E = edges
 * **Without caching:** Called repeatedly for same nodes → O(V²) total
 * **With caching:** Each node computed once → O(V+E) total amortized
 *
 * **Cycle Detection:** Uses path set to detect cycles during traversal.
 * Visited set prevents redundant computation of same node via multiple paths.
 *
 * **Effect Trampolining:** Uses Effect.gen + yield* for stack safety.
 * Deep hierarchies (100+ levels) won't cause stack overflow.
 */
const getAncestorsImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    const visited = new Set<string>()
    const path = new Set<string>() // For cycle detection
    const ancestors: Array<string> = []

    /**
     * Recursive DFS visit using Effect.gen (trampolined)
     *
     * **Why Effect.gen:** JavaScript call stack is limited (~10k frames).
     * Effect.gen converts recursion to iterative trampolining via yield*.
     * This allows processing arbitrarily deep hierarchies without stack overflow.
     */
    const visit = (iri: string): Effect.Effect<void, InheritanceError | CircularInheritanceError> =>
      Effect.gen(function*() {
        // Check for cycles
        if (path.has(iri)) {
          return yield* Effect.fail(
            new CircularInheritanceError({
              nodeId: iri,
              cycle: Array.from(path)
            })
          )
        }

        // Skip already visited nodes
        if (visited.has(iri)) {
          return
        }

        visited.add(iri)
        path.add(iri)

        // Get parents
        const parents = yield* getParentsImpl(iri, graph, context)

        // Visit all parents with bounded concurrency
        // concurrency: 10 prevents spawning unbounded fibers for nodes with many parents
        yield* Effect.forEach(
          parents,
          (parentIri) => visit(parentIri),
          { concurrency: 10 }
        )

        path.delete(iri)

        // Add to result (exclude self)
        if (iri !== classIri) {
          ancestors.push(iri)
        }
      })

    yield* visit(classIri)

    // Deduplicate while preserving order (immediate parents first)
    return Array.from(new Set(ancestors))
  })

/**
 * Implementation of getEffectiveProperties - combines own and inherited properties
 */
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (
    iri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>,
  service: InheritanceService
): Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Get own properties
    const ownNode = yield* HashMap.get(context.nodes, classIri).pipe(
      Effect.mapError(
        () =>
          new InheritanceError({
            nodeId: classIri,
            message: `Class ${classIri} not found in context`
          })
      )
    )

    const ownProperties = "properties" in ownNode ? ownNode.properties : []

    // Get ancestors using cached version
    const ancestors = yield* getAncestorsCached(classIri)

    // Collect properties from ancestors
    const ancestorProperties: Array<PropertyConstraint> = []

    for (const ancestorIri of ancestors) {
      const ancestorNode = yield* HashMap.get(context.nodes, ancestorIri).pipe(
        Effect.mapError(
          () =>
            new InheritanceError({
              nodeId: ancestorIri,
              message: `Ancestor ${ancestorIri} not found in context`
            })
        )
      )

      if ("properties" in ancestorNode) {
        for (const prop of ancestorNode.properties) {
          ancestorProperties.push(prop)
        }
      }
    }

    // Refine properties using meet operation (lattice fold)
    // This properly combines constraints from multiple inheritance paths
    const propertyMap = new Map<string, PropertyConstraint>()

    // Add ancestor properties first
    for (const prop of ancestorProperties) {
      propertyMap.set(prop.propertyIri, prop)
    }

    // Refine with own properties using meet
    for (const prop of ownProperties) {
      const existing = propertyMap.get(prop.propertyIri)
      if (existing) {
        // Use meet to refine: result = existing ⊓ prop
        const refined = yield* meet(existing, prop).pipe(
          Effect.provideService(InheritanceService, service),
          Effect.catchAll(() => Effect.succeed(prop)) // On error, use child's constraint
        )
        propertyMap.set(prop.propertyIri, refined)
      } else {
        propertyMap.set(prop.propertyIri, prop)
      }
    }

    return Array.from(propertyMap.values())
  })

/**
 * Implementation of isSubclass - semantic subclass checking
 *
 * **Algorithm:**
 * 1. Reflexive check: if child === parent, return true
 * 2. Get ancestors of child (cached)
 * 3. Check if parent is in ancestor set (O(1) Set lookup)
 *
 * **Complexity:** O(1) after first call (cached ancestors)
 *
 * **Correctness:**
 * - Reflexive: A ⊑ A always true
 * - Transitive: If B ∈ ancestors(A), then A ⊑ B
 * - Uses getAncestors which computes full transitive closure
 */
const isSubclassImpl = (
  child: string,
  parent: string,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<boolean, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Reflexive: every class is a subclass of itself
    if (child === parent) return true

    // Get all ancestors of child (transitive closure, cached)
    const ancestors = yield* getAncestorsCached(child)

    // Check if parent is in ancestor set
    return ancestors.includes(parent)
  })

/**
 * Implementation of areDisjoint - three-valued disjointness checking
 *
 * **Algorithm:**
 * 1. Check explicit disjointness in disjointWithMap
 * 2. Check transitive disjointness via superclasses
 * 3. Check for overlap (common subclass via subclass relation)
 * 4. Return Unknown (Open World Assumption)
 *
 * **Complexity:**
 * - O(1) for explicit check (HashMap lookup)
 * - O(A) for transitive check (A = ancestors of each class, cached)
 * - O(V) worst case for overlap check (V = classes in graph)
 *
 * **Correctness:**
 * - Transitive: If A disjoint B and C ⊑ B, then A disjoint C
 * - Overlap: If ∃D: D ⊑ A ∧ D ⊑ B, then A and B overlap
 * - Open World: Absence of evidence ≠ evidence of absence
 */
const areDisjointImpl = (
  class1: string,
  class2: string,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<DisjointnessResult, DisjointnessCheckError> =>
  Effect.gen(function*() {
    // 1. Check explicit disjointness (O(1) HashMap lookup)
    const disjointSet = HashMap.get(context.disjointWithMap, class1)
    if (disjointSet._tag === "Some") {
      if (HashSet.has(disjointSet.value, class2)) {
        return { _tag: "Disjoint" as const }
      }
    }

    // 2. Check transitive disjointness via superclasses
    // If A disjoint B and C ⊑ B, then A disjoint C
    const ancestors1 = yield* getAncestorsCached(class1).pipe(
      Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<string>))
    )
    const ancestors2 = yield* getAncestorsCached(class2).pipe(
      Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<string>))
    )

    // Check if class1 or any of its ancestors are disjoint with class2 or any of its ancestors
    const classes1 = [class1, ...ancestors1]
    const classes2 = [class2, ...ancestors2]

    for (const c1 of classes1) {
      const disjointSet1 = HashMap.get(context.disjointWithMap, c1)
      if (disjointSet1._tag === "Some") {
        for (const c2 of classes2) {
          if (HashSet.has(disjointSet1.value, c2)) {
            return { _tag: "Disjoint" as const }
          }
        }
      }
    }

    // 3. Check for overlap (common subclass)
    // If class1 ⊑ class2 OR class2 ⊑ class1, they overlap
    if (classes1.includes(class2)) {
      return { _tag: "Overlapping" as const }
    }
    if (classes2.includes(class1)) {
      return { _tag: "Overlapping" as const }
    }

    // Could also check all classes in graph for common subclass,
    // but that's expensive and rarely needed for constraint checking.
    // The cases above cover the common scenarios.

    // 4. Unknown (Open World Assumption)
    // No evidence of disjointness or overlap
    return { _tag: "Unknown" as const }
  })

/**
 * Create InheritanceService with cached ancestry computation
 *
 * Uses Effect.cachedFunction to memoize DFS results, reducing complexity from
 * O(V²) to O(V+E) when processing graphs with shared ancestors.
 *
 * **Cache Scope:** Cache lives for lifetime of service instance. Single
 * prompt generation session = one computation per node max.
 *
 * **Thread Safety:** Effect.cachedFunction is referentially transparent. Same input
 * IRI always yields same output ancestors.
 *
 * **Trampoline:** Recursive DFS uses Effect.gen + yield*, eliminating stack
 * overflow risk even for deep hierarchies (100+ levels).
 */
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<InheritanceService, never, never> =>
  Effect.gen(function*() {
    // Phase 1: Create cached functions
    const getAncestorsCached = yield* Effect.cachedFunction(
      (iri: string) => getAncestorsImpl(iri, graph, context)
    )

    const getParents = (iri: string) => getParentsImpl(iri, graph, context)
    const getChildren = (iri: string) => getChildrenImpl(iri, graph, context)
    const isSubclass = (child: string, parent: string) => isSubclassImpl(child, parent, getAncestorsCached)
    const areDisjoint = (class1: string, class2: string) => areDisjointImpl(class1, class2, context, getAncestorsCached)

    // Phase 2: Create partial service for meet operation
    const partialService: InheritanceService = {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: () => Effect.dieMessage("Not yet initialized"),
      getParents,
      getChildren,
      isSubclass,
      areDisjoint
    }

    // Phase 3: Create getEffectiveProperties with access to service
    const getEffectivePropertiesWithService = (iri: string) =>
      getEffectivePropertiesImpl(iri, graph, context, getAncestorsCached, partialService)

    const getEffectivePropertiesCached = yield* Effect.cachedFunction(
      getEffectivePropertiesWithService
    )

    // Phase 4: Return complete service
    return {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: getEffectivePropertiesCached,
      getParents,
      getChildren,
      isSubclass,
      areDisjoint
    }
  })

/**
 * Effect Layer for InheritanceService
 *
 * Creates a live InheritanceService from Graph and Context.
 * This is a helper for testing and dependency injection.
 */
export const layer = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
) =>
  make(graph, context).pipe(
    Effect.map((service) => InheritanceService.of(service))
  )
