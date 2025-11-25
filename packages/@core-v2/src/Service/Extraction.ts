/**
 * Service: Extraction Services
 *
 * EntityExtractor and RelationExtractor service contracts.
 * Phase 1: Interface definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Service/Extraction
 */

import type { Chunk } from "effect"
import { Effect } from "effect"
import { NotImplemented } from "../Domain/Error/Base.js"
import type { EntityExtractionFailed, RelationExtractionFailed } from "../Domain/Error/Extraction.js"
import type { Entity, Relation } from "../Domain/Model/Entity.js"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"

/**
 * EntityExtractor -Stage 1 extraction service
 *
 * Extracts entities from text using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class EntityExtractor extends Effect.Service<EntityExtractor>()(
  "EntityExtractor",
  {
    effect: Effect.succeed({
      /**
       * Extract entities from text given candidate classes
       *
       * @param text - Source text to extract from
       * @param candidates - Ontology classes to extract instances of
       * @returns Chunk of extracted entities
       */
      extract: (
        _text: string,
        _candidates: ReadonlyArray<ClassDefinition>
      ): Effect.Effect<Chunk.Chunk<Entity>, EntityExtractionFailed | NotImplemented> =>
        Effect.fail(NotImplemented.make({
          message: "EntityExtractor.extract not yet implemented",
          service: "EntityExtractor",
          method: "extract"
        }))
    }),
    accessors: true
  }
) {}

/**
 * RelationExtractor - Stage 2 extraction service
 *
 * Extracts relations between entities using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class RelationExtractor extends Effect.Service<RelationExtractor>()(
  "RelationExtractor",
  {
    effect: Effect.succeed({
      /**
       * Extract relations from text given entities and allowed properties
       *
       * @param text - Source text to extract from
       * @param entities - Previously extracted entities
       * @param properties - Ontology properties to use for relations
       * @returns Chunk of extracted relations
       */
      extract: (
        _text: string,
        _entities: Chunk.Chunk<Entity>,
        _properties: ReadonlyArray<PropertyDefinition>
      ): Effect.Effect<Chunk.Chunk<Relation>, RelationExtractionFailed | NotImplemented> =>
        Effect.fail(NotImplemented.make({
          message: "RelationExtractor.extract not yet implemented",
          service: "RelationExtractor",
          method: "extract"
        }))
    }),
    accessors: true
  }
) {}
