import { HashMap } from "effect"
import type { EntityCache } from "./EntityCache"
import * as EC from "./EntityCache"
import type { KnowledgeIndex } from "./KnowledgeIndex"

/**
 * PromptContext - Product Monoid of KnowledgeIndex and EntityCache
 *
 * P = K × C
 *
 * Represents the total available context for prompt generation:
 * - K: Static ontology knowledge (from catamorphism)
 * - C: Dynamic entity discoveries (from stream accumulation)
 */
export interface PromptContext {
  readonly index: KnowledgeIndex
  readonly cache: EntityCache
}

/**
 * Empty PromptContext (monoid identity)
 */
export const empty: PromptContext = {
  index: HashMap.empty(),
  cache: EC.empty
}

/**
 * Combine two PromptContexts (monoid operation)
 *
 * (k1, c1) ⊕ (k2, c2) = (k1 ⊕_K k2, c1 ⊕_C c2)
 */
export const combine = (p1: PromptContext, p2: PromptContext): PromptContext => ({
  index: HashMap.union(p1.index, p2.index),
  cache: EC.union(p1.cache, p2.cache)
})

/**
 * Create PromptContext from KnowledgeIndex and EntityCache
 */
export const make = (index: KnowledgeIndex, cache: EntityCache): PromptContext => ({
  index,
  cache
})
