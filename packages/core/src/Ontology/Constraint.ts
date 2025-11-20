/**
 * Property Constraint Lattice
 *
 * Implements a bounded meet-semilattice for property constraints.
 * Used to refine property restrictions through inheritance.
 *
 * Mathematical model: (PropertyConstraint, ⊓, ⊤, ⊥, ⊑)
 * - ⊓ = meet (intersection/refinement)
 * - ⊤ = top (unconstrained)
 * - ⊥ = bottom (unsatisfiable)
 * - ⊑ = refines relation
 *
 * @module Ontology/Constraint
 */

import { Data, Effect, Equal, Option } from "effect"
import { PropertyConstraint } from "../Graph/Constraint.js"
export { PropertyConstraint } from "../Graph/Constraint.js"
import { InheritanceService } from "./Inheritance.js"
import type { DisjointnessResult } from "./Inheritance.js"

/**
 * Error when meet operation fails
 */
export class MeetError extends Data.TaggedError("MeetError")<{
  readonly propertyA: string
  readonly propertyB: string
  readonly message: string
}> {}

/**
 * Intersect two range arrays with semantic disjointness checking
 *
 * Empty array = unconstrained (Top behavior)
 * Non-empty intersection = refined ranges
 *
 * **Semantic Behavior:**
 * - If ranges share literal values, return intersection
 * - If ranges don't share literals BUT overlap semantically, keep stricter one
 * - If disjoint → return [] (signals Bottom/unsatisfiable)
 * - If unknown → accumulate BUT prefer overlapping classes
 *
 * **Associativity Fix:**
 * When one input has accumulated ranges and the other has a single range that
 * overlaps with part of the accumulation, we return just the overlapping parts
 * to maintain associativity.
 *
 * @internal
 */
/**
 * Simplify ranges by removing subsumed classes
 * Keeps only the most specific classes
 *
 * Returns empty array if ranges represent an unsatisfiable intersection type
 * (e.g., must be both Cat AND Dog, which is impossible if Cat and Dog are disjoint)
 */
const simplifyRanges = (
  ranges: ReadonlyArray<string>,
  isSubclass: (child: string, parent: string) => Effect.Effect<boolean, never>,
  areDisjoint: (class1: string, class2: string) => Effect.Effect<DisjointnessResult, never>
): Effect.Effect<ReadonlyArray<string>, never> =>
  Effect.gen(function*() {
    if (ranges.length === 0) return []
    if (ranges.length === 1) return [...ranges]

    // For intersection types (multiple ranges), check if any pair is disjoint
    // If we have [A, B] and A is disjoint from B, this is Bottom (unsatisfiable)
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const disjointness = yield* areDisjoint(ranges[i], ranges[j])
        if (disjointness._tag === "Disjoint") {
          // Disjoint intersection type → unsatisfiable → Bottom
          return []
        }
      }
    }

    // Remove subsumed classes - keep only most specific
    const simplified: Array<string> = []
    for (const candidate of ranges) {
      let isSubsumed = false
      for (const other of ranges) {
        if (candidate !== other) {
          // Check if 'other' is more specific than 'candidate' (other ⊑ candidate)
          const otherIsSubclass = yield* isSubclass(other, candidate)
          if (otherIsSubclass) {
            // 'other' is a subclass of 'candidate', so 'candidate' is redundant
            isSubsumed = true
            break
          }
        }
      }
      if (!isSubsumed) {
        simplified.push(candidate)
      }
    }
    return simplified.sort()
  })

const intersectRanges = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
  areDisjoint: (class1: string, class2: string) => Effect.Effect<DisjointnessResult, never>,
  isSubclass: (child: string, parent: string) => Effect.Effect<boolean, never>
): Effect.Effect<ReadonlyArray<string>, never> =>
  Effect.gen(function*() {
    // Empty means unconstrained
    if (a.length === 0) return yield* simplifyRanges(b, isSubclass, areDisjoint)
    if (b.length === 0) return yield* simplifyRanges(a, isSubclass, areDisjoint)

    // Simplify inputs first (intersection types should be simplified)
    const aSimplified = yield* simplifyRanges(a, isSubclass, areDisjoint)
    const bSimplified = yield* simplifyRanges(b, isSubclass, areDisjoint)

    // If either simplified to Bottom (empty), the result is Bottom
    if (aSimplified.length === 0 || bSimplified.length === 0) return []

    // Literal string intersection
    const setA = new Set(aSimplified)
    const setB = new Set(bSimplified)
    const literalIntersection = Array.from(setA).filter((x) => setB.has(x))

    // If intersection is non-empty, return it (already simplified)
    if (literalIntersection.length > 0) {
      return literalIntersection.sort()
    }

    // No literal intersection - check semantic relationships
    let hasDisjoint = false
    let hasOverlapping = false

    // Check if ANY pair is disjoint
    for (const rangeA of aSimplified) {
      for (const rangeB of bSimplified) {
        const disjointness = yield* areDisjoint(rangeA, rangeB)

        if (disjointness._tag === "Disjoint") {
          hasDisjoint = true
        } else if (disjointness._tag === "Overlapping") {
          hasOverlapping = true
        }
      }
    }

    // If we found ANY disjoint pair AND no overlapping pairs, signal Bottom
    // This means the constraints are definitely unsatisfiable
    if (hasDisjoint && !hasOverlapping) {
      return []
    }

    // Accumulate simplified constraints and simplify again
    const accumulated = Array.from(new Set([...aSimplified, ...bSimplified]))
    return yield* simplifyRanges(accumulated, isSubclass, areDisjoint)
  })

/**
 * Take minimum of two optional numbers
 *
 * None = unbounded (larger)
 * Some(n) = bounded
 *
 * @internal
 */
const minOption = (
  a: Option.Option<number>,
  b: Option.Option<number>
): Option.Option<number> => {
  return Option.match(a, {
    onNone: () => b,
    onSome: (aVal) =>
      Option.match(b, {
        onNone: () => a,
        onSome: (bVal) => Option.some(Math.min(aVal, bVal))
      })
  })
}

/**
 * Intersect two arrays (generic set intersection)
 *
 * Sorts results for canonical ordering (ensures commutativity)
 *
 * @internal
 */
const intersectArrays = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): ReadonlyArray<T> => {
  if (a.length === 0) return [...b].sort()
  if (b.length === 0) return [...a].sort()
  const intersection = a.filter((item) => b.includes(item))
  // If intersection is empty, accumulate (similar to ranges)
  if (intersection.length === 0) {
    return Array.from(new Set([...a, ...b])).sort()
  }
  return intersection.sort()
}


/**
 * Meet operation (⊓) - combines two constraints into the stricter one
 *
 * This is the core lattice operation implementing greatest lower bound.
 * Satisfies lattice laws (verified by property-based tests):
 * - Associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 * - Commutativity: a ⊓ b = b ⊓ a
 * - Idempotence: a ⊓ a = a
 * - Identity: a ⊓ ⊤ = a
 * - Absorption: a ⊓ ⊥ = ⊥
 *
 * **Requirements**: Requires InheritanceService in context for semantic reasoning.
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Effect containing refined constraint (greatest lower bound), or MeetError if property IRIs differ
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * const result = yield* meet(animal, dog).pipe(
 *   Effect.provide(InheritanceService.Test)
 * )
 * // Result: ranges = ["Dog"], minCardinality = 1
 * ```
 */
export const meet = (
  a: PropertyConstraint,
  b: PropertyConstraint
): Effect.Effect<PropertyConstraint, MeetError, InheritanceService> =>
  Effect.gen(function*() {
    // Precondition: same property IRI
    if (a.propertyIri !== b.propertyIri) {
      return yield* Effect.fail(
        new MeetError({
          propertyA: a.propertyIri,
          propertyB: b.propertyIri,
          message: `Cannot meet constraints for different properties: ${a.propertyIri} vs ${b.propertyIri}`
        })
      )
    }

    // Short-circuit: Idempotence (a ⊓ a = a)
    // Check full equality first (including annotations)
    if (Equal.equals(a, b)) {
      return a
    }

    // Short-circuit: Identity with Top (a ⊓ ⊤ = a)
    if (b.isTop()) return a
    if (a.isTop()) return b

    // Short-circuit: Bottom absorbs everything
    if (a.isBottom() || b.isBottom()) {
      return PropertyConstraint.bottom(
        a.propertyIri,
        a.annotations[0] || "bottom"
      )
    }

    // Get InheritanceService from context for semantic reasoning
    const inheritanceService = yield* InheritanceService

    // Refine ranges (intersection semantics with disjointness checking and subsumption)
    const refinedRanges = yield* intersectRanges(
      a.ranges,
      b.ranges,
      (class1, class2) =>
        inheritanceService.areDisjoint(class1, class2).pipe(
          Effect.catchAll(() => Effect.succeed({ _tag: "Unknown" as const }))
        ),
      (child, parent) =>
        inheritanceService.isSubclass(child, parent).pipe(
          Effect.catchAll(() => Effect.succeed(false))
        )
    )

    // Refine cardinality (take stricter bounds)
    const minCard = Math.max(a.minCardinality, b.minCardinality)
    const maxCard = minOption(a.maxCardinality, b.maxCardinality)

    // Refine allowed values (intersection)
    const refinedValues = intersectArrays(a.allowedValues, b.allowedValues)

    // Merge annotations (Set Union) - sorted for canonical ordering
    const annotations = Data.array(
      Array.from(new Set([...a.annotations, ...b.annotations])).sort()
    )

    // Check for cardinality contradictions
    const hasCardinalityContradiction = Option.match(maxCard, {
      onNone: () => false,
      onSome: (max) => minCard > max
    })

    // Check for allowedValues contradictions
    const hasAllowedValuesContradiction = a.allowedValues.length > 0 &&
      b.allowedValues.length > 0 &&
      refinedValues.length === 0

    // Check for range contradictions (empty refined ranges from non-empty inputs)
    const hasRangeContradiction = refinedRanges.length === 0 &&
      (a.ranges.length > 0 || b.ranges.length > 0)

    if (hasCardinalityContradiction || hasAllowedValuesContradiction || hasRangeContradiction) {
      return PropertyConstraint.bottom(a.propertyIri, annotations[0])
    }

    return PropertyConstraint.make({
      propertyIri: a.propertyIri,
      annotations,
      ranges: Data.array(refinedRanges),
      minCardinality: minCard,
      maxCardinality: maxCard,
      allowedValues: Data.array(refinedValues),
      source: "refined"
    })
  })

/**
 * Refinement relation (⊑) - checks if a is stricter than b
 *
 * Supports semantic subclass checking via InheritanceService.
 *
 * Mathematical definition: a ⊑ b ⟺ a ⊓ b = a
 *
 * Practical: a refines b if all of a's constraints are at least as strict as b's:
 * - a.minCardinality ≥ b.minCardinality
 * - a.maxCardinality ≤ b.maxCardinality (if both defined)
 * - a.ranges ⊆ b.ranges (with semantic subclass reasoning)
 *
 * **Requirements**: Requires InheritanceService in context for semantic reasoning.
 *
 * @param a - First constraint (potentially stricter)
 * @param b - Second constraint (potentially looser)
 * @returns Effect<boolean> true if a refines b
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * // With semantic subclass reasoning via InheritanceService
 * yield* refines(dog, animal).pipe(
 *   Effect.provide(InheritanceService.Test)
 * ) // true - Dog is subclass of Animal
 * ```
 */
export const refines = (
  a: PropertyConstraint,
  b: PropertyConstraint
): Effect.Effect<boolean, never, InheritanceService> =>
  Effect.gen(function*() {
    if (a.propertyIri !== b.propertyIri) return false

    // Bottom refines everything
    if (a.isBottom()) return true
    // If b is Bottom but a is not, fail
    if (b.isBottom()) return false

    // Everything refines Top
    if (b.isTop()) return true

    // Check cardinality: a's interval must be subset of b's
    const minRefines = a.minCardinality >= b.minCardinality
    const maxRefines = Option.match(a.maxCardinality, {
      onNone: () => Option.isNone(b.maxCardinality),
      onSome: (aMax) =>
        Option.match(b.maxCardinality, {
          onNone: () => true,
          onSome: (bMax) => aMax <= bMax
        })
    })

    if (!minRefines || !maxRefines) return false

    // Check ranges: a's ranges must be subclasses of b's ranges
    // Logic: For every required range in B, A must satisfy it (be a subclass)
    if (b.ranges.length === 0) return true // B has no range constraints
    if (a.ranges.length === 0) return false // A is unconstrained, B is constrained

    // Get InheritanceService from context for semantic subclass reasoning
    const inheritanceService = yield* InheritanceService

    // For every range 'req' in B, does A imply 'req'?
    // A implies 'req' if ANY of A's ranges is a subclass of 'req'
    // (Intersection Semantics: A is (Dog AND Robot). B is (Animal). Dog <= Animal, so A <= B)
    for (const reqRange of b.ranges) {
      let satisfied = false
      for (const candidate of a.ranges) {
        const isSubclassResult = yield* inheritanceService.isSubclass(candidate, reqRange).pipe(
          Effect.catchAll(() => Effect.succeed(candidate === reqRange))
        )
        if (isSubclassResult) {
          satisfied = true
          break
        }
      }
      if (!satisfied) return false
    }

    return true
  })
