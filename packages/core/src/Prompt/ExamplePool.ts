/**
 * ExamplePool - Curated extraction examples with metadata
 *
 * Provides structured examples for few-shot learning.
 * Each example includes text, entities, triples, and predicate metadata.
 *
 * @module Prompt/ExamplePool
 */

import { Schema } from "effect"

/**
 * Entity in an example
 */
export class ExampleEntity extends Schema.Class<ExampleEntity>("ExampleEntity")({
  name: Schema.String,
  type: Schema.String
}) {}

/**
 * Triple in an example
 */
export class ExampleTriple extends Schema.Class<ExampleTriple>("ExampleTriple")({
  subject: Schema.String,
  predicate: Schema.String,
  object: Schema.String
}) {}

/**
 * A complete extraction example
 */
export class ExtractionExample extends Schema.Class<ExtractionExample>("ExtractionExample")({
  id: Schema.String,
  text: Schema.String,
  entities: Schema.Array(ExampleEntity),
  triples: Schema.Array(ExampleTriple),
  /** Note explaining the example (optional) */
  note: Schema.optional(Schema.String)
}) {
  /**
   * Get all predicates demonstrated in this example
   */
  get predicates(): ReadonlyArray<string> {
    return this.triples.map((t) => t.predicate)
  }

  /**
   * Get all entity types in this example
   */
  get entityTypes(): ReadonlyArray<string> {
    return [...new Set(this.entities.map((e) => e.type))]
  }

  /**
   * Render to string format for StructuredPrompt.examples
   */
  render(): string {
    const entityList = this.entities.length > 0
      ? `Entities: [\n${this.entities.map((e) => `  { "name": "${e.name}", "type": "${e.type}" }`).join(",\n")}\n]`
      : "Entities: []"

    const tripleList = this.triples.length > 0
      ? `Triples: [\n${
        this.triples.map((t) =>
          `  { "subject": "${t.subject}", "predicate": "${t.predicate}", "object": "${t.object}" }`
        ).join(",\n")
      }\n]`
      : "Triples: []"

    const parts = [
      `Text: "${this.text}"`,
      entityList,
      tripleList
    ]

    if (this.note) {
      parts.push(`Note: ${this.note}`)
    }

    return parts.join("\n")
  }
}

/**
 * ExamplePool - Collection of examples indexed by id
 */
export type ExamplePool = ReadonlyArray<ExtractionExample>

/**
 * Get curated static examples
 *
 * These are domain-agnostic examples covering common patterns:
 * - Biographical (person with birthplace, awards)
 * - Location (entity with spatial relationships)
 * - Direction (correct subject-object ordering)
 * - Negative (no extractable relationships)
 */
export const getStaticExamples = (): ExamplePool => [
  // Biographical example
  ExtractionExample.make({
    id: "biographical-1",
    text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903.",
    entities: [
      ExampleEntity.make({ name: "Marie Curie", type: "Person" }),
      ExampleEntity.make({ name: "Warsaw", type: "City" }),
      ExampleEntity.make({ name: "Poland", type: "Country" }),
      ExampleEntity.make({ name: "Nobel Prize in Physics", type: "Award" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Marie Curie", predicate: "birthPlace", object: "Warsaw" }),
      ExampleTriple.make({ subject: "Marie Curie", predicate: "countryOfCitizenship", object: "Poland" }),
      ExampleTriple.make({ subject: "Marie Curie", predicate: "awardReceived", object: "Nobel Prize in Physics" })
    ]
  }),

  // Location example
  ExtractionExample.make({
    id: "location-1",
    text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889.",
    entities: [
      ExampleEntity.make({ name: "Eiffel Tower", type: "ArchitecturalStructure" }),
      ExampleEntity.make({ name: "Paris", type: "City" }),
      ExampleEntity.make({ name: "France", type: "Country" }),
      ExampleEntity.make({ name: "Gustave Eiffel", type: "Person" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Eiffel Tower", predicate: "locatedIn", object: "Paris" }),
      ExampleTriple.make({ subject: "Paris", predicate: "country", object: "France" }),
      ExampleTriple.make({ subject: "Eiffel Tower", predicate: "architect", object: "Gustave Eiffel" })
    ]
  }),

  // Direction example
  ExtractionExample.make({
    id: "direction-1",
    text:
      "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena.",
    entities: [
      ExampleEntity.make({ name: "Walter Baade", type: "Person" }),
      ExampleEntity.make({ name: "Halton Arp", type: "Person" }),
      ExampleEntity.make({ name: "James Watson", type: "Person" }),
      ExampleEntity.make({ name: "101 Helena", type: "AstronomicalObject" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Walter Baade", predicate: "doctoralAdvisor", object: "Halton Arp" }),
      ExampleTriple.make({ subject: "James Watson", predicate: "discoverer", object: "101 Helena" })
    ],
    note:
      "The subject performs the action. \"Walter Baade supervised\" means Walter Baade -> doctoralAdvisor -> Halton Arp, NOT the reverse."
  }),

  // Negative example
  ExtractionExample.make({
    id: "negative-1",
    text: "The weather today is sunny with a high of 75 degrees F. It's a beautiful day for a walk.",
    entities: [],
    triples: [],
    note: "This text contains no extractable entities or relationships matching the ontology schema."
  }),

  // Organization example
  ExtractionExample.make({
    id: "organization-1",
    text: "Apple Inc. was founded by Steve Jobs and Steve Wozniak in Cupertino, California in 1976.",
    entities: [
      ExampleEntity.make({ name: "Apple Inc.", type: "Organization" }),
      ExampleEntity.make({ name: "Steve Jobs", type: "Person" }),
      ExampleEntity.make({ name: "Steve Wozniak", type: "Person" }),
      ExampleEntity.make({ name: "Cupertino", type: "City" }),
      ExampleEntity.make({ name: "California", type: "AdministrativeRegion" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "founder", object: "Steve Jobs" }),
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "founder", object: "Steve Wozniak" }),
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "headquarterLocation", object: "Cupertino" }),
      ExampleTriple.make({ subject: "Cupertino", predicate: "locatedIn", object: "California" })
    ]
  }),

  // Creative work example
  ExtractionExample.make({
    id: "creative-work-1",
    text: "The Great Gatsby was written by F. Scott Fitzgerald and published in 1925 by Charles Scribner's Sons.",
    entities: [
      ExampleEntity.make({ name: "The Great Gatsby", type: "Book" }),
      ExampleEntity.make({ name: "F. Scott Fitzgerald", type: "Person" }),
      ExampleEntity.make({ name: "Charles Scribner's Sons", type: "Organization" })
    ],
    triples: [
      ExampleTriple.make({ subject: "The Great Gatsby", predicate: "author", object: "F. Scott Fitzgerald" }),
      ExampleTriple.make({ subject: "The Great Gatsby", predicate: "publisher", object: "Charles Scribner's Sons" })
    ]
  })
]

/**
 * Get all unique predicates in the example pool
 */
export const getAllPredicates = (pool: ExamplePool): ReadonlyArray<string> => {
  const predicates = new Set<string>()
  for (const ex of pool) {
    for (const triple of ex.triples) {
      predicates.add(triple.predicate)
    }
  }
  return Array.from(predicates)
}

/**
 * Filter examples by predicate
 */
export const filterByPredicate = (
  pool: ExamplePool,
  predicate: string
): ExamplePool => pool.filter((ex) => ex.predicates.includes(predicate))

/**
 * Filter examples by any matching predicate
 */
export const filterByPredicates = (
  pool: ExamplePool,
  predicates: ReadonlyArray<string>
): ExamplePool => {
  const predicateSet = new Set(predicates)
  return pool.filter((ex) => ex.predicates.some((p) => predicateSet.has(p)))
}
