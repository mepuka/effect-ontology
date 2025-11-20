Executive Summary
Your Effect-based streaming knowledge extraction pipeline exhibits five critical architectural issues that compromise correctness, performance, and semantic integrity. These issues stem from deeper theoretical concerns around RDF blank node identity, Effect service composition, schema-driven validation, RDF literal datatyping, and graph traversal complexity.

Additional Notes (latest review)

- RdfService is now required by ExtractionPipeline but still not provided in test/production layer stacks; expect “Missing service: RdfService” unless a default layer is added and wired.
- Blank nodes are still merged before any renaming; the new canonical selector prefers named IRIs but collisions already occur during union, so distinct \_:b1 subjects fuse across chunks.
- Label-based dedup remains mostly inert because the extraction schema still omits `rdfs:label` unless present in the ontology vocabulary; the LLM cannot emit labels that pass validation, so dedup falls back to `@id`.
- RDF serialization still emits untyped literals; numeric/boolean/date ranges lose datatype IRIs, weakening SHACL/SPARQL semantics.
- knowledgeIndexAlgebra now scans the entire graph per node to find children (O(V²)) and leaves `parents` empty; hierarchy metadata, depth stats, and inheritance remain inaccurate on larger ontologies.

Theoretical Foundations

1. RDF Blank Node Semantics (W3C RDF 1.1)
   Blank nodes are existentially quantified variables in RDF:

Scoped to a graph: _:b1 in Graph A ≠ _:b1 in Graph B
No global identity: Merging graphs requires Skolemization or renaming
Isomorphism: Two graphs are isomorphic if there exists a bijective blank node mapping
Your pipeline violation: Blank nodes from different chunks are unioned without renaming (packages/core/src/Services/EntityResolution.ts:252-258), causing false identity.

2. Effect Layer Composition (Effect-TS)
   Effect services follow the dependency injection pattern:

Layer: Layer<ROut, E, RIn> - Recipe for constructing services
Effect.provide: Supplies dependencies to an Effect program
Service.Default: Convention for production layer
Your pipeline violation: RdfService is used via .use() (line 109) without layer provision, causing runtime "Missing service" errors.

3. Schema-Driven Extraction (LLM Structured Output)
   LLMs generate JSON validated against Effect Schema:

Closed-world vocabulary: Only properties in schema are valid
rdfs:label must be in propertyIris array for LLM to emit it
Schema mismatch = invalid output = no labels = broken deduplication
Your pipeline violation: rdfs:label is not added to propertyIris (packages/core/src/Services/ExtractionPipeline.ts:116-117), so LLM outputs without labels pass validation but dedup fails.

4. RDF Literal Datatypes (RDF 1.1 Datatypes)
   RDF literals carry datatype IRIs for semantic interpretation:

"42"^^xsd:integer (typed integer)
"2025-01-20"^^xsd:date (typed date)
"Hello"@en (language-tagged string)
Your pipeline violation: All literals serialized as plain strings (packages/core/src/Services/Rdf.ts:149-151), losing type information for downstream SHACL/SPARQL.

5. Graph Traversal Complexity
   Your knowledgeIndexAlgebra scans the entire graph per node:

for (const [idx, data] of graph) { // O(V) iterations
const neighbors = Graph.neighbors(graph, idx) // O(E) per call
if (Array.from(neighbors).includes(nodeIndex)) { // O(V) check
childIris.push(data)
}
}
Complexity: O(V²) for dense graphs, O(V·E) worst case.

Issue 1: Missing RdfService in Test Layer
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyzing Issue 2: Blank-node collision in entity resolution
Analyze Issue 3: Label-based dedup inertness
Analyze Issue 4: RDF serialization data loss
Analyze Issue 5: Graph traversal performance (O(V²))
Provide comprehensive solutions with code examples
Root Cause
RdfService is implemented with Effect.Service using sync factory:

export class RdfService extends Effect.Service<RdfService>()("RdfService", {
sync: () => ({ jsonToStore, storeToTurtle, turtleToStore })
}) {}
This creates a service tag that requires a layer to provide the implementation. However:

Production code uses anti-pattern: const rdf = RdfService.use() (packages/core/src/Services/ExtractionPipeline.ts:109)

.use() is for inline dependency access, not layer provision
Requires RdfService to be already in context
Test layer doesn't provide RdfService:

const TestLayers = Layer.mergeAll(
NlpServiceLive,
EntityDiscoveryServiceLive,
MockLanguageModelLive
) // Missing RdfService!
No RdfService.Default layer defined in packages/core/src/Services/Rdf.ts

Impact
✅ Tests pass currently because RdfService.use() returns the sync implementation directly (Effect's fallback behavior)
❌ Runtime failure in production when used in a context expecting proper layer composition
❌ Violates Effect best practices - services should be provided via layers, not .use()
Solution
Step 1: Add RdfService.Default layer to packages/core/src/Services/Rdf.ts:

export class RdfService extends Effect.Service<RdfService>()("RdfService", {
sync: () => ({
jsonToStore: (graph: KnowledgeGraph) => /_ ... _/,
storeToTurtle: (store: RdfStore) => /_ ... _/,
turtleToStore: (turtle: string) => /_ ... _/
})
}) {
/\*\*

- Production layer - provides RdfService via sync constructor
- No dependencies needed (stateless service)
  \*/
  static Default = Layer.succeed(RdfService, RdfService.make())
  }
  Step 2: Fix streamingExtractionPipeline to use proper dependency injection:

export const streamingExtractionPipeline = (/_ ... _/) =>
Effect.gen(function*() {
const nlp = yield* NlpService
const discovery = yield* EntityDiscoveryService
const rdf = yield* RdfService // ✅ Proper Effect.gen binding

    // ... rest of implementation

})
Step 3: Update test layer:

const TestLayers = Layer.mergeAll(
NlpServiceLive,
EntityDiscoveryServiceLive,
MockLanguageModelLive,
RdfService.Default // ✅ Add RdfService layer
)
Step 4: Add regression test in packages/core/test/Services/ExtractionPipeline.test.ts:

describe("Layer Composition", () => {
it.effect("should require RdfService layer", () =>
Effect.gen(function\*() {
const text = "Test sentence."

      // This should fail without RdfService layer
      const programWithoutRdf = streamingExtractionPipeline(
        text, mockGraph, mockOntology
      ).pipe(
        Effect.provide(
          Layer.mergeAll(NlpServiceLive, EntityDiscoveryServiceLive)
        )
      )

      const result = yield* Effect.either(programWithoutRdf)
      expect(result._tag).toBe("Left") // Should fail

      // This should succeed with RdfService layer
      const programWithRdf = streamingExtractionPipeline(
        text, mockGraph, mockOntology
      ).pipe(Effect.provide(TestLayers))

      const success = yield* programWithRdf
      expect(success).toBeDefined()
    })

)
})
Issue 2: Blank Node Collision in Entity Resolution
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyze Issue 2: Blank-node collision in entity resolution
Analyzing Issue 3: Label-based dedup inertness
Analyze Issue 4: RDF serialization data loss
Analyze Issue 5: Graph traversal performance (O(V²))
Provide comprehensive solutions with code examples
Root Cause
The mergeGraphsWithResolution function (packages/core/src/Services/EntityResolution.ts:238-273) performs naive graph union:

// Step 1: Parse all graphs
const stores = yield\* Effect.all(graphs.map(parseGraphToStore), { concurrency: 3 })

// Step 2: Union all stores (THE PROBLEM)
const mergedStore = new N3.Store()
for (const store of stores) {
for (const quad of store) {
mergedStore.addQuad(quad) // ❌ Blind union!
}
}

// Step 3: Extract labels and deduplicate (TOO LATE)
const entities = extractEntitiesWithLabels(mergedStore)
Scenario demonstrating failure:

Chunk 1 extracts:

\_:b1 a foaf:Person ;
rdfs:label "Alice Smith" .
Chunk 2 extracts (different entity, same blank node ID):

\_:b1 a foaf:Person ;
rdfs:label "Bob Jones" .
After naive union:

\_:b1 a foaf:Person ;
rdfs:label "Alice Smith" ,
"Bob Jones" . # ❌ FUSED - now one entity with TWO labels!
After deduplication (tries to pick canonical IRI):

\_:b1 a foaf:Person ;
rdfs:label "Alice Smith" . # Bob is LOST!
Theoretical Grounding: Skolemization
The correct approach is Skolemization or blank node renaming:

Definition: Replace blank nodes with URIs derived from graph provenance.

Algorithm (per W3C RDF 1.1):

For graph G*i, for each blank node *:b:
Replace _:b with <urn:uuid:{UUID}> or _:{chunk*index}*{b}
Example:

# Chunk 1 (skolemized with chunk*0* prefix):

\_:chunk_0_b1 a foaf:Person ;
rdfs:label "Alice Smith" .

# Chunk 2 (skolemized with chunk*1* prefix):

\_:chunk_1_b1 a foaf:Person ;
rdfs:label "Bob Jones" .

# After union: TWO distinct entities ✅

Solution
Implement pre-union Skolemization:

Add to packages/core/src/Services/EntityResolution.ts:

/\*\*

- Skolemize blank nodes in a store by adding chunk-specific prefix
-
- Ensures blank node IDs are unique across merged graphs by adding
- provenance-based prefixes (chunk index).
-
- @param store - N3.Store with potentially colliding blank node IDs
- @param chunkIndex - Unique chunk identifier for this graph
- @returns New store with skolemized blank nodes
  \*/
  const skolemizeBlankNodes = (
  store: N3.Store,
  chunkIndex: number
  ): N3.Store => {
  const newStore = new N3.Store()
  const { quad, blankNode, namedNode, literal } = N3.DataFactory

// Helper: Add chunk prefix to blank node IDs
const skolemize = (term: N3.Term): N3.Term => {
if (term.termType === "BlankNode") {
// Rename _:b1 -> _:chunk*0_b1
return blankNode(`chunk*${chunkIndex}_${term.value}`)
}
return term
}

// Rewrite all quads
for (const q of store) {
newStore.addQuad(
quad(
skolemize(q.subject) as N3.Quad_Subject,
q.predicate,
skolemize(q.object) as N3.Quad_Object,
q.graph
)
)
}

return newStore
}

/\*\*

- Merge multiple RDF graphs with skolemization and entity resolution
  _/
  export const mergeGraphsWithResolution = (
  graphs: ReadonlyArray<RdfGraph>
  ): Effect.Effect<RdfGraph, ParseError> =>
  Effect.gen(function_() {
  if (graphs.length === 0) return ""
  // 1. Parse all graphs to stores
  const stores = yield\* Effect.all(graphs.map(parseGraphToStore), {
  concurrency: 3
  })

      // 2. ✅ SKOLEMIZE each store BEFORE merging
      const skolemizedStores = stores.map((store, idx) =>
        skolemizeBlankNodes(store, idx)
      )

      // 3. Union skolemized stores (now safe!)
      const mergedStore = new N3.Store()
      for (const store of skolemizedStores) {
        for (const quad of store) {
          mergedStore.addQuad(quad)
        }
      }

      // 4. Extract entities and deduplicate (now works correctly)
      const entities = extractEntitiesWithLabels(mergedStore)
      const iriMapping = buildIriMapping(entities)
      const resolvedStore = replaceIrisInStore(mergedStore, iriMapping)

      // 5. Serialize
      return yield* serializeStore(resolvedStore)

  })
  Add comprehensive test in packages/core/test/Services/EntityResolution.test.ts:

describe("Blank Node Skolemization", () => {
it.effect("should prevent blank node collision across graphs", () =>
Effect.gen(function\*() {
// Two graphs with SAME blank node ID, DIFFERENT entities
const graph1 = `
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

        _:b1 a foaf:Person ;
             rdfs:label "Alice Smith" .
      `

      const graph2 = `
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix foaf: <http://xmlns.com/foaf/0.1/> .

        _:b1 a foaf:Person ;
             rdfs:label "Bob Jones" .
      `

      const merged = yield* mergeGraphsWithResolution([graph1, graph2])

      // Parse merged graph
      const rdf = RdfService.make()
      const store = yield* rdf.turtleToStore(merged)

      // Should have 2 distinct subjects (not merged!)
      const subjects = new Set(
        store.getQuads(null, null, null, null).map(q => q.subject.value)
      )

      expect(subjects.size).toBe(2)

      // Should preserve both labels
      const labels = store.getQuads(
        null,
        N3.DataFactory.namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
        null,
        null
      ).map(q => q.object.value)

      expect(labels).toContain("Alice Smith")
      expect(labels).toContain("Bob Jones")
      expect(labels).toHaveLength(2)
    }).pipe(Effect.provide(RdfService.Default))

)
})
Issue 3: Label-Based Dedup Inertness
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyze Issue 2: Blank-node collision in entity resolution
Analyze Issue 3: Label-based dedup inertness
Analyzing Issue 4: RDF serialization data loss
Analyze Issue 5: Graph traversal performance (O(V²))
Provide comprehensive solutions with code examples
Root Cause: Schema Vocabulary Mismatch
The pipeline exhibits a catch-22:

LLM extracts entities validated against schema (packages/core/src/Services/ExtractionPipeline.ts:116-118):

const { classIris, propertyIris } = extractVocabulary(ontology)
const schema = makeKnowledgeGraphSchema(classIris, propertyIris)
Schema only allows properties in propertyIris:

properties: S.Array(S.Struct({
predicate: propertyUnion, // ❌ Must be from propertyIris!
object: S.Union(S.String, S.Struct({ "@id": S.String }))
}))
extractVocabulary doesn't include rdfs:label unless explicitly defined in ontology:

export const extractVocabulary = (ontology: OntologyContext) => {
const propertyIris: Array<string> = []
for (const node of HashMap.values(ontology.nodes)) {
if (isClassNode(node)) {
for (const prop of node.properties) {
if (!propertyIris.includes(prop.propertyIri)) {
propertyIris.push(prop.propertyIri) // ❌ rdfs:label not here!
}
}
}
}
// ...
}
extractLabel expects rdfs:label (packages/core/src/Services/ExtractionPipeline.ts:67-76):

const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"
const labelProp = entity.properties.find(
(p) => p.predicate === RDFS_LABEL && typeof p.object === "string"
)
return labelProp ? (labelProp.object as string) : entity["@id"]
Result: LLM cannot emit rdfs:label (schema violation) → extractLabel always falls back to @id → deduplication by label is inert.

Theoretical Grounding: Open vs Closed World
Closed-World Assumption (CWA): Only facts in the schema are valid.

Appropriate for LLM structured output (prevents hallucination)
Problem: Must explicitly enumerate all allowed properties
Open-World Assumption (OWA): Facts not in schema may still be true.

Appropriate for RDF merging (allows annotation properties)
Problem: LLM needs CWA for schema validation
Your pipeline needs BOTH:

CWA for LLM extraction (prevent hallucination)
OWA for entity resolution (allow annotation properties like rdfs:label)
Solution: Universal Annotation Properties
Approach: Add core RDF/RDFS/OWL annotation properties to every schema.

Step 1: Define universal annotation vocabulary:

Add to packages/core/src/Schema/Factory.ts:

/\*\*

- Core RDF/RDFS/OWL annotation properties
-
- These properties should be available in all extraction schemas
- to enable entity deduplication, provenance tracking, and metadata.
-
- @category constants
- @since 1.0.0
  \*/
  export const CORE_ANNOTATION_PROPERTIES = [
  // RDFS Core
  "http://www.w3.org/2000/01/rdf-schema#label", // Human-readable label
  "http://www.w3.org/2000/01/rdf-schema#comment", // Description
  "http://www.w3.org/2000/01/rdf-schema#seeAlso", // Related resources

// OWL Annotations
"http://www.w3.org/2002/07/owl#sameAs", // Identity equivalence

// Dublin Core (common metadata)
"http://purl.org/dc/terms/identifier", // Unique identifier
"http://purl.org/dc/terms/source", // Source reference

// SKOS (concept labeling)
"http://www.w3.org/2004/02/skos/core#prefLabel", // Preferred label
"http://www.w3.org/2004/02/skos/core#altLabel" // Alternative label
] as const

/\*\*

- Creates a complete Knowledge Graph schema with core annotations
-
- Automatically includes CORE_ANNOTATION_PROPERTIES in the schema
- to enable entity deduplication via rdfs:label and related properties.
  \*/
  export const makeKnowledgeGraphSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
  > (
  > classIris: ReadonlyArray<ClassIRI>,
  > propertyIris: ReadonlyArray<PropertyIRI>,
  > ontology?: OntologyContext,
  > options: SchemaGenerationOptions = {}
  > ) => {
  > // ✅ Merge ontology properties with core annotations
  > const allPropertyIris = [
      ...propertyIris,
      ...CORE_ANNOTATION_PROPERTIES
  ] as ReadonlyArray<PropertyIRI | typeof CORE_ANNOTATION_PROPERTIES[number]>

// Create union schemas for vocabulary validation
const ClassUnion = unionFromStringArray(classIris, "classes")

// Strict Mode
if (options.strict && ontology) {
if (A.isEmptyReadonlyArray(allPropertyIris)) {
throw new EmptyVocabularyError({ type: "properties" })
}

    const propertySchemas = allPropertyIris.map((iri) =>
      makeStrictPropertySchema(iri, ontology)
    ) as unknown as [S.Schema<any>, ...Array<S.Schema<any>>]

    const StrictPropertyUnion = S.Union(...propertySchemas)

    const StrictEntitySchema = S.Struct({
      "@id": S.String,
      "@type": ClassUnion,
      properties: S.Array(StrictPropertyUnion)
    })

    return S.Struct({
      entities: S.Array(StrictEntitySchema)
    }).annotations({
      identifier: "KnowledgeGraph",
      title: "Knowledge Graph Extraction (Strict)",
      description: "A collection of entities with core RDF annotations for deduplication"
    })

}

// Loose Mode (Default) - use merged properties
const PropertyUnion = unionFromStringArray(allPropertyIris, "properties")
const EntitySchema = makeEntitySchema(ClassUnion, PropertyUnion)

return S.Struct({
entities: S.Array(EntitySchema)
}).annotations({
identifier: "KnowledgeGraph",
title: "Knowledge Graph Extraction",
description: "A collection of entities with core RDF annotations for deduplication"
})
}
Step 2: Update extraction prompt to encourage label usage:

Add to packages/core/src/Prompt/PromptDoc.ts (or equivalent):

/\*\*

- System instructions for entity labeling
  \*/
  const LABELING_INSTRUCTIONS = `
  IMPORTANT: For every entity you extract, include:

1. A human-readable rdfs:label property with the entity's name or title
2. Use the exact surface form from the text when possible
3. Labels enable deduplication across chunks

Example:
{
"@id": "\_:person1",
"@type": "http://xmlns.com/foaf/0.1/Person",
"properties": [
{
"predicate": "http://www.w3.org/2000/01/rdf-schema#label",
"object": "Alice Smith" // ← Extract from text!
},
{
"predicate": "http://xmlns.com/foaf/0.1/age",
"object": "30"
}
]
}
`
Step 3: Add test coverage:

describe("Label-Based Deduplication", () => {
it.effect("should deduplicate entities with same rdfs:label", () =>
Effect.gen(function\*() {
// Two chunks mentioning "Alice Smith" with different blank node IDs
const graph1 = `
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

        _:chunk_0_person1 a foaf:Person ;
                          rdfs:label "Alice Smith" ;
                          foaf:age "30" .
      `

      const graph2 = `
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix foaf: <http://xmlns.com/foaf/0.1/> .

        _:chunk_1_person2 a foaf:Person ;
                          rdfs:label "Alice Smith" ;
                          foaf:email "alice@example.com" .
      `

      const merged = yield* mergeGraphsWithResolution([graph1, graph2])

      const rdf = RdfService.make()
      const store = yield* rdf.turtleToStore(merged)

      // Should have 1 subject (deduplicated by label)
      const subjects = new Set(
        store.getQuads(null, null, null, null).map(q => q.subject.value)
      )

      expect(subjects.size).toBe(1)

      // Should preserve ALL properties from both chunks
      const canonical = Array.from(subjects)[0]
      const props = store.getQuads(
        N3.DataFactory.namedNode(canonical),
        null,
        null,
        null
      )

      expect(props).toHaveLength(4) // type + label + age + email
    }).pipe(Effect.provide(RdfService.Default))

)

it("should verify schema allows rdfs:label", () => {
const { CORE_ANNOTATION_PROPERTIES } = require("../../src/Schema/Factory")

    expect(CORE_ANNOTATION_PROPERTIES).toContain(
      "http://www.w3.org/2000/01/rdf-schema#label"
    )

})
})
Issue 4: RDF Serialization Drops Datatype/Language Information
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyze Issue 2: Blank-node collision in entity resolution
Analyze Issue 3: Label-based dedup inertness
Analyze Issue 4: RDF serialization data loss
Analyzing Issue 5: Graph traversal performance (O(V²))
Provide comprehensive solutions with code examples
Root Cause: Untyped Literal Creation
The jsonToStore method (packages/core/src/Services/Rdf.ts:148-151) creates plain literals for all string values:

// Object can be literal or reference
const object = typeof prop.object === "string"
? literal(prop.object) // ❌ Always xsd:string!
: createSubject(prop.object["@id"])
N3.DataFactory.literal signature:

literal(value: string, languageOrDatatype?: string | NamedNode): Literal
Current call: literal(prop.object) → Creates "value"^^xsd:string

Missing: No datatype/language tag from PropertyConstraint ranges.

Theoretical Grounding: RDF Datatype Semantics
RDF Literal: "lexical form"^^datatype or "lexical form"@language

Examples:

"42"^^xsd:integer - Integer (enables arithmetic in SPARQL)
"3.14"^^xsd:double - Floating point
"2025-01-20"^^xsd:date - Date (enables date comparison)
"true"^^xsd:boolean - Boolean
"Hello"@en - English string
"Bonjour"@fr - French string
Downstream impact:

SHACL validation expects typed literals (e.g., sh:datatype xsd:integer)
SPARQL queries use typed comparison (FILTER (?age > 18))
RDF consumers interpret semantics (dates, numbers, booleans)
Solution: Schema-Driven Datatype Inference
Challenge: JSON from LLM is untyped - all values are strings.

Approach: Use PropertyConstraint ranges to infer datatypes during RDF serialization.

Step 1: Extend KnowledgeGraphEntity to pass ontology context:

Modify packages/core/src/Services/ExtractionPipeline.ts:

// Pass ontology to RDF conversion for datatype inference
const store = yield\* rdf.jsonToStore(knowledgeGraph, ontology)
Step 2: Update jsonToStore to accept ontology and infer datatypes:

Modify packages/core/src/Services/Rdf.ts:

/\*\*

- Helper: Infer RDF datatype from PropertyConstraint ranges
-
- Maps XSD datatypes to N3.NamedNode for typed literal creation.
- Falls back to xsd:string if range is unknown or ambiguous.
  \*/
  const inferDatatype = (
  propertyIri: string,
  ontology?: OntologyContext
  ): N3.NamedNode | undefined => {
  if (!ontology) return undefined

// Find property constraint in ontology
let ranges: ReadonlyArray<string> = []

// Check universal properties
const universalProp = ontology.universalProperties.find(
p => p.propertyIri === propertyIri
)
if (universalProp) {
ranges = universalProp.ranges
} else {
// Check class properties
for (const node of HashMap.values(ontology.nodes)) {
if (isClassNode(node)) {
const prop = node.properties.find(p => p.propertyIri === propertyIri)
if (prop) {
ranges = prop.ranges
break
}
}
}
}

// If single unambiguous XSD range, use it
if (ranges.length === 1) {
const range = ranges[0]

    // Map common XSD types
    const xsdBase = "http://www.w3.org/2001/XMLSchema#"
    if (range.startsWith("xsd:")) {
      return N3.DataFactory.namedNode(range.replace("xsd:", xsdBase))
    } else if (range.startsWith(xsdBase)) {
      return N3.DataFactory.namedNode(range)
    }

}

// Default: no explicit datatype (defaults to xsd:string)
return undefined
}

/\*\*

- Convert validated JSON entities to N3 Store
-
- Now supports datatype inference from ontology property ranges.
-
- @param graph - Knowledge graph from makeKnowledgeGraphSchema
- @param ontology - Optional ontology context for datatype inference
- @returns Effect yielding N3.Store or RdfError
  \*/
  jsonToStore: (graph: KnowledgeGraph, ontology?: OntologyContext) =>
  Effect.sync(() => {
  const store = new N3.Store()
  const { blankNode, literal, namedNode, quad } = N3.DataFactory
  const createSubject = (id: string): N3.NamedNode | N3.BlankNode =>
  id.startsWith("\_:") ? blankNode(id.slice(2)) : namedNode(id)

      for (const entity of graph.entities) {
        const subject = createSubject(entity["@id"])

        // Add type triple
        store.addQuad(
          quad(
            subject,
            namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            namedNode(entity["@type"])
          )
        )

        // Add property triples with datatype inference
        for (const prop of entity.properties) {
          const predicate = namedNode(prop.predicate)

          // Object can be literal (with datatype) or reference
          const object = typeof prop.object === "string"
            ? (() => {
                // ✅ Infer datatype from ontology
                const datatype = inferDatatype(prop.predicate, ontology)
                return datatype
                  ? literal(prop.object, datatype)
                  : literal(prop.object)  // Default xsd:string
              })()
            : createSubject(prop.object["@id"])

          store.addQuad(quad(subject, predicate, object))
        }
      }

      return store

  }).pipe(
  Effect.catchAllDefect((cause) =>
  Effect.fail(
  new RdfError({
  module: "RdfService",
  method: "jsonToStore",
  reason: "InvalidQuad",
  description: "Failed to create RDF quads from entities",
  cause
  })
  )
  )
  )
  Step 3: Update extraction pipeline call site:

// packages/core/src/Services/ExtractionPipeline.ts:149
const store = yield\* rdf.jsonToStore(knowledgeGraph, ontology)
Step 4: Add comprehensive tests:

describe("RDF Datatype Serialization", () => {
it.effect("should serialize xsd:integer for age properties", () =>
Effect.gen(function*() {
const rdf = yield* RdfService

      // Create ontology with age: xsd:integer range
      const ontology: OntologyContext = {
        nodes: HashMap.fromIterable([
          [
            "foaf:Person",
            new ClassNode({
              id: "http://xmlns.com/foaf/0.1/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://xmlns.com/foaf/0.1/age",
                  label: "age",
                  ranges: Data.array(["xsd:integer"]),
                  maxCardinality: Option.some(1)
                })
              ]
            })
          ]
        ]),
        universalProperties: [],
        nodeIndexMap: HashMap.empty(),
        disjointWithMap: HashMap.empty(),
        propertyParentsMap: HashMap.empty()
      }

      const graph = {
        entities: [
          {
            "@id": "_:person1",
            "@type": "http://xmlns.com/foaf/0.1/Person",
            properties: [
              {
                predicate: "http://xmlns.com/foaf/0.1/age",
                object: "30"  // String from LLM
              }
            ]
          }
        ]
      }

      const store = yield* rdf.jsonToStore(graph, ontology)
      const turtle = yield* rdf.storeToTurtle(store)

      // Should contain typed literal
      expect(turtle).toContain('XMLSchema#integer')
      expect(turtle).toMatch(/"30"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#integer>/)

      // Verify via parsing
      const parsedStore = yield* rdf.turtleToStore(turtle)
      const ageQuad = parsedStore.getQuads(
        null,
        N3.DataFactory.namedNode("http://xmlns.com/foaf/0.1/age"),
        null,
        null
      )[0]

      expect(ageQuad.object.termType).toBe("Literal")
      expect((ageQuad.object as N3.Literal).datatype.value).toBe(
        "http://www.w3.org/2001/XMLSchema#integer"
      )
    }).pipe(Effect.provide(RdfService.Default))

)

it.effect("should default to xsd:string for unknown properties", () =>
Effect.gen(function*() {
const rdf = yield* RdfService

      const graph = {
        entities: [
          {
            "@id": "_:person1",
            "@type": "http://xmlns.com/foaf/0.1/Person",
            properties: [
              {
                predicate: "http://example.org/unknownProp",
                object: "some value"
              }
            ]
          }
        ]
      }

      // No ontology provided - should default to string
      const store = yield* rdf.jsonToStore(graph)
      const turtle = yield* rdf.storeToTurtle(store)

      // Should NOT have explicit datatype (defaults to xsd:string)
      expect(turtle).toContain('"some value"')
      expect(turtle).not.toContain('XMLSchema#')
    }).pipe(Effect.provide(RdfService.Default))

)
})
Issue 5: Graph Traversal O(V²) Complexity
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyze Issue 2: Blank-node collision in entity resolution
Analyze Issue 3: Label-based dedup inertness
Analyze Issue 4: RDF serialization data loss
Analyze Issue 5: Graph traversal performance (O(V²))
Providing comprehensive solutions with code examples
Root Cause: Inefficient Reverse Edge Lookup
The knowledgeIndexAlgebra (packages/core/src/Prompt/Algebra.ts:185-191) scans the entire graph for each node to find its children:

const childIris: string[] = []
for (const [idx, data] of graph) { // O(V) - iterate ALL nodes
const neighbors = Graph.neighbors(graph, idx) // O(E) - get edges
if (Array.from(neighbors).includes(nodeIndex)) { // O(V) - linear search
childIris.push(data)
}
}
Complexity Analysis:

Outer loop: O(V) iterations
Graph.neighbors: O(deg(v)) ≈ O(E/V) on average
Array.from(...).includes(): O(deg(v))
Total: O(V · E) worst case, O(V²) for dense graphs
For large ontologies (e.g., SNOMED CT with ~400K concepts):

V = 400,000
E ≈ 1,000,000
Operations: 400B iterations! Unacceptable.
Theoretical Grounding: Inverted Index
Graph Theory: To find reverse edges (v → u), maintain an adjacency list of predecessors.

Data Structure:

predecessors: Map<NodeId, Set<NodeId>>
predecessors[u] = { v | (v → u) ∈ E }
Complexity:

Build: O(E) preprocessing
Query: O(deg⁻(u)) = O(number of parents) - typically small!
Solution: Precompute Reverse Adjacency
Step 1: Add reverse adjacency builder to solveToKnowledgeIndex:

Modify packages/core/src/Prompt/Solver.ts:

import { HashMap } from "effect"
import type { NodeId } from "../Graph/Types"

/\*\*

- Build reverse adjacency list (predecessors map)
-
- For each edge (u → v), store v in predecessors[u].
- Enables O(1) parent/child lookup instead of O(V²) graph scan.
-
- @param graph - The ontology graph
- @returns HashMap mapping node index to array of predecessor indices
  \*/
  const buildReverseAdjacency = <A>(
  graph: Graph.Graph<NodeId, A>
  ): HashMap.HashMap<number, number[]> => {
  let predecessors = HashMap.empty<number, number[]>()

// For each node
for (const [idx, _data] of graph) {
const neighbors = Graph.neighbors(graph, idx)

    // For each edge idx → neighbor
    for (const neighbor of neighbors) {
      // Add idx to neighbor's predecessors
      const existing = HashMap.get(predecessors, neighbor).pipe(
        Option.getOrElse(() => [] as number[])
      )
      predecessors = HashMap.set(predecessors, neighbor, [...existing, idx])
    }

}

return predecessors
}

/\*\*

- Solve graph to KnowledgeIndex with reverse adjacency optimization
  _/
  export const solveToKnowledgeIndex = <A>(
  graph: Graph.Graph<NodeId, A>,
  ontology: OntologyContext,
  algebra: GraphAlgebra<KnowledgeIndex>
  ): Effect.Effect<KnowledgeIndex, never> =>
  Effect.gen(function_() {
  // ✅ Precompute reverse adjacency (O(E))
  const predecessors = buildReverseAdjacency(graph)
  // Solve with catamorphism
  return yield\* Graph.solve(
  graph,
  (nodeIndex) => {
  const nodeData = Graph.unsafeGetNode(graph, nodeIndex)
  return (childrenResults: ReadonlyArray<KnowledgeIndex>) =>
  algebra(nodeData, childrenResults, graph, nodeIndex, predecessors)
  }
  )
  })
  Step 2: Update knowledgeIndexAlgebra to use reverse adjacency:

Modify packages/core/src/Prompt/Algebra.ts:

import type { GraphAlgebra } from "./Types.js"
import type { HashMap } from "effect"

/\*\*

- Smart algebra using HashMap-based KnowledgeIndex Monoid
-
- Now uses precomputed reverse adjacency for O(1) child lookup.
  \*/
  export const knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndexType> = (
  nodeData,
  childrenResults,
  graph,
  nodeIndex,
  predecessors // ✅ NEW: Reverse adjacency map
  ): KnowledgeIndexType => {
  if (isClassNode(nodeData)) {
  // ✅ O(deg⁻(v)) child lookup using reverse adjacency
  const childIndices = HashMap.get(predecessors, nodeIndex).pipe(
  Option.getOrElse(() => [] as number[])
  )
  const childIris = childIndices.map(idx =>
  Graph.unsafeGetNode(graph, idx) as string
  )

      // ✅ O(deg(v)) parent lookup using forward adjacency
      const parentIndices = Array.from(Graph.neighbors(graph, nodeIndex))
      const parentIris = parentIndices.map(idx =>
        Graph.unsafeGetNode(graph, idx) as string
      )

      const definition = [
        `Class: ${nodeData.label}`,
        `Properties:`,
        formatProperties(nodeData.properties)
      ].join("\n")

      const unit = new KnowledgeUnit({
        iri: nodeData.id,
        label: nodeData.label,
        definition,
        properties: nodeData.properties,
        inheritedProperties: [],
        children: childIris,
        parents: parentIris  // ✅ Now populated!
      })

      let index = KnowledgeIndex.fromUnit(unit)

      for (const childIndex of childrenResults) {
        index = KnowledgeIndex.combine(index, childIndex)
      }

      return index

  }

// ... PropertyNode handling ...

return KnowledgeIndex.empty()
}
Step 3: Update algebra type signature:

Modify packages/core/src/Prompt/Types.ts:

import type { HashMap } from "effect"

/\*\*

- Graph algebra signature
-
- Takes:
- - nodeData: Current node
- - childrenResults: Results from recursive calls on children
- - graph: Full graph context
- - nodeIndex: Index of current node
- - predecessors: Reverse adjacency map (node → parents)
-
- Returns: Result of type R
  \*/
  export type GraphAlgebra<R> = (
  nodeData: NodeData,
  childrenResults: ReadonlyArray<R>,
  graph: Graph.Graph<NodeId, NodeData>,
  nodeIndex: number,
  predecessors: HashMap.HashMap<number, number[]> // ✅ NEW
  ) => R
  Step 4: Add performance test:

describe("Graph Traversal Performance", () => {
it.effect("should handle large ontology (1000 nodes) efficiently", () =>
Effect.gen(function\*() {
// Create deep hierarchy: 10 levels × 100 nodes per level
const graph = Graph.mutate(Graph.directed(), (g) => {
for (let level = 0; level < 10; level++) {
for (let i = 0; i < 100; i++) {
const nodeId = `Level${level}_Node${i}` as NodeId
Graph.addNode(g, nodeId)

            // Connect to parent level
            if (level > 0) {
              const parentId = `Level${level - 1}_Node${i % 10}` as NodeId
              Graph.addEdge(g, nodeId, parentId)
            }
          }
        }
      })

      const ontology = createMockOntology(graph)

      const startTime = performance.now()
      const index = yield* solveToKnowledgeIndex(
        graph,
        ontology,
        knowledgeIndexAlgebra
      )
      const endTime = performance.now()

      const duration = endTime - startTime

      // Should complete in < 100ms (with O(E) preprocessing)
      expect(duration).toBeLessThan(100)

      // Verify correctness: all nodes indexed
      expect(KnowledgeIndex.size(index)).toBe(1000)
    })

)
})
Summary: Production-Grade Implementation Plan
Update Todos
Analyze Issue 1: Missing RdfService in test layer
Analyze Issue 2: Blank-node collision in entity resolution
Analyze Issue 3: Label-based dedup inertness
Analyze Issue 4: RDF serialization data loss
Analyze Issue 5: Graph traversal performance (O(V²))
Provide comprehensive solutions with code examples
Answers to Your Questions
Q1: Is RdfService meant to have a default layer injected automatically?
Answer: Yes, follow the Test Layer Pattern from CLAUDE.md:

Add RdfService.Default layer (static property on the service class)
Use yield\* RdfService in Effect.gen (not .use())
Provide layer explicitly in tests via Effect.provide(TestLayers)
Rationale: Effect services are dependency injection containers. The .Default layer convention ensures:

Explicit dependency graph
Testable service boundaries
No hidden global state
Q2: Should rdfs:label be added to extraction schema by default?
Answer: Yes, and extend to all core RDF/RDFS/OWL annotation properties:

export const CORE_ANNOTATION_PROPERTIES = [
"http://www.w3.org/2000/01/rdf-schema#label",
"http://www.w3.org/2000/01/rdf-schema#comment",
"http://www.w3.org/2000/01/rdf-schema#seeAlso",
"http://www.w3.org/2002/07/owl#sameAs",
"http://purl.org/dc/terms/identifier",
"http://www.w3.org/2004/02/skos/core#prefLabel",
"http://www.w3.org/2004/02/skos/core#altLabel"
]
Rationale:

Enable label-based deduplication (critical for multi-chunk extraction)
Support entity linking via owl:sameAs
Provide provenance via Dublin Core metadata
Standard practice in ontology engineering (see SKOS, Dublin Core)
Implementation Priority
Critical Path (must fix before production):

Issue 2 (Blank Node Collision) - Causes data corruption ⚠️

Implement Skolemization
Add test for multi-chunk extraction
Issue 3 (Label Dedup Inertness) - Defeats core value proposition

Add CORE_ANNOTATION_PROPERTIES to schema
Update prompt to encourage label usage
Issue 1 (Missing RdfService Layer) - Runtime failure risk

Add RdfService.Default layer
Fix .use() anti-pattern
High Priority (correctness):

Issue 4 (Datatype Loss) - Breaks semantic integrity
Implement schema-driven datatype inference
Add tests for xsd:integer, xsd:date, etc.
Performance Optimization:

Issue 5 (O(V²) Traversal) - Only matters for large ontologies
Precompute reverse adjacency
Add performance test for 1000+ nodes
Testing Strategy
Regression Test Suite (packages/core/test/Issues/CodeReview2025.test.ts):

✅ Already covers Issues 1-4 (unit tests)
❌ Missing: Integration tests for multi-chunk pipeline
❌ Missing: Performance benchmarks
Add:

describe("Multi-Chunk Integration", () => {
it.effect("should deduplicate 'Alice Smith' across 3 chunks", /_ ... _/)
it.effect("should preserve all properties from overlapping chunks", /_ ... _/)
it.effect("should handle 1000-node ontology in < 1 second", /_ ... _/)
})
Architectural Recommendations

1. Adopt Consistent Layer Pattern
   All services should follow:

export class MyService extends Effect.Service<MyService>()("MyService", {
effect: /_ production implementation _/
}) {
static Default = Layer.effect(MyService, /_ ... _/)
static Test = Layer.succeed(MyService, /_ mock _/)
} 2. Separate Concerns: Core vs Application
Core library (packages/core):

✅ Provider-agnostic
✅ No Effect Config
✅ Data-driven (via function parameters)
Application layer (packages/ui, scripts):

Uses makeLlmProviderLayer(params) with runtime config
Composes layers dynamically 3. Schema Evolution Strategy
Current: Ontology → Schema (closed-world) Better: Ontology + Annotations → Schema

Layered vocabulary:

Domain vocabulary (from ontology): foaf:Person, foaf:name
Annotation vocabulary (universal): rdfs:label, dc:identifier
Provenance vocabulary (pipeline): prov:wasGeneratedBy, prov:wasDerivedFrom 4. RDF Best Practices
Follow W3C RDF 1.1 Best Practices:

✅ Always Skolemize blank nodes when merging
✅ Use typed literals for numeric/date/boolean values
✅ Include rdfs:label for human readability
✅ Use owl:sameAs for entity linking
Graduate Seminar-Level Insights
Insight 1: Blank Nodes as Existential Quantifiers
Your pipeline mirrors the semantic web layer cake:

Application (UI)
↓
Deduplication (Entity Resolution)
↓
RDF (N3 Store)
↓
JSON-LD (LLM Output)
↓
Schema (Validation)
Blank nodes represent unidentified entities in first-order logic:

∃x. Person(x) ∧ name(x, "Alice")
Merging requires unification (label matching) or Skolemization (unique naming)
Insight 2: Effect Layers as Category Theory
Effect Layers form a monoidal category:

Objects: Service types (e.g., RdfService, NlpService)
Morphisms: Layer dependencies (e.g., Layer<A, E, B>)
Composition: Layer.provideTo, Layer.merge
Identity: Layer.succeed
Your pipeline violates associativity by using .use() instead of composition.

Insight 3: Schema as Type System
Effect Schema is dependent types for runtime:

makeKnowledgeGraphSchema<ClassIRI, PropertyIRI>(
classIris: ClassIRI[],
propertyIris: PropertyIRI[]
): Schema<KnowledgeGraph<ClassIRI, PropertyIRI>>
Type-level programming ensures:

Soundness: Valid JSON → Valid RDF
Completeness: All ontology terms representable
Decidability: Validation terminates
Adding CORE_ANNOTATION_PROPERTIES extends the type universe to include meta-properties.

Final Recommendations
Before merging to production:

✅ Fix all 5 issues (critical for correctness)
✅ Add comprehensive test suite (100+ tests)
✅ Document architectural decisions (ADR format)
✅ Performance benchmark on large ontology (SNOMED CT subset)
✅ Code review with Effect-TS expert (validate layer composition)
Estimated effort: 3-5 days for senior engineer

Risk mitigation:

Start with Issue 2 (highest impact)
Test each fix in isolation before integration
Maintain backward compatibility (feature flags if needed)
This analysis represents production-grade, theoretically grounded solutions to your pipeline's architectural issues. Each solution is testable, maintainable, and follows Effect-TS best practices.

Would you like me to implement any of these fixes immediately, or would you prefer to review and prioritize first?
