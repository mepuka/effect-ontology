This is a production-grade architectural spec for migrating your system to an idiomatic **Effect** codebase. As a maintainer, I am prioritizing **composability**, **resource safety** (managing that N3 Store), and **schema validation** at the boundaries.

We are moving away from "Manager Classes" and toward **Service Pipelines**.

### 1\. Directory Structure (The "Effect Standard")

In Effect projects, we separate **Domain** (Data), **Services** (Contracts), **Layers** (Implementations), and **Workflows** (Business Logic).

```text
packages/core/src/
├── Domain/                 # PURE Data Types & Schemas (No side effects)
│   ├── Model.ts            # Entity, Relation, ClassDefinition
│   ├── RdfTypes.ts         # IRI, Triple, BlankNode
│   └── index.ts
├── Services/               # Service CONTRACTS (Context.Tag)
│   ├── EntityExtractor.ts
│   ├── RelationExtractor.ts
│   ├── OntologyService.ts
│   ├── RdfBuilder.ts
│   └── index.ts
├── Layers/                 # Service IMPLEMENTATIONS (Live Dependencies)
│   ├── Llm/
│   │   ├── EntityExtractor.ts
│   │   └── RelationExtractor.ts
│   ├── Ontology/
│   │   ├── Semantic.ts
│   │   └── Keyword.ts
│   ├── Rdf/
│   │   └── N3Builder.ts
│   └── index.ts
├── Workflows/              # PIPELINES (Effect.gen composition)
│   ├── UnifiedExtraction.ts
│   └── index.ts
└── index.ts                # Main Entrypoint
```

---

### 2\. Domain Layer: Schema-First Modeling

We use `Schema.Class` (instead of just `Data.Class`) because we need **Runtime Validation** when decoding LLM outputs. This gives us Types, Validation, and Equality/Hashing in one primitive.

**`packages/core/src/Domain/Model.ts`**

```typescript
import { Schema } from "effect"

// --- TBox (Schema) ---

export class ClassDefinition extends Schema.Class<ClassDefinition>(
  "ClassDefinition"
)({
  id: Schema.String,
  label: Schema.String,
  comment: Schema.String,
  // Optional embedding for vector search (Float32Array not natively serializable by default, handled carefully)
  embedding: Schema.optional(Schema.Any)
}) {}

export class PropertyDefinition extends Schema.Class<PropertyDefinition>(
  "PropertyDefinition"
)({
  id: Schema.String,
  label: Schema.String,
  domain: Schema.Array(Schema.String),
  range: Schema.Array(Schema.String)
}) {}

// --- ABox (Data) ---

export class Entity extends Schema.Class<Entity>("Entity")({
  // The cleaned snake_case ID
  id: Schema.String.annotations({
    description: "Unique ID (e.g. cristiano_ronaldo)"
  }),
  // The actual text found in the document
  mention: Schema.String,
  // The ontology class URI
  types: Schema.Array(Schema.String),
  // Key-value attributes
  attributes: Schema.Record(
    Schema.String,
    Schema.Union(Schema.String, Schema.Number)
  )
}) {}

export class Relation extends Schema.Class<Relation>("Relation")({
  subjectId: Schema.String,
  predicate: Schema.String,
  // Objects can be entity refs OR literals. We handle this via union.
  objectId: Schema.Union(Schema.String, Schema.Number)
}) {}
```

---

### 3\. Service Layer: The Contracts

We define **what** we need, not how it works. Note the use of `Effect<Success, Error>`.

**`packages/core/src/Services/OntologyService.ts`**

```typescript
import { Context, Effect, Chunk } from "effect"
import { ClassDefinition, PropertyDefinition } from "../Domain/Model.js"

export class OntologyService extends Context.Tag("OntologyService")<
  OntologyService,
  {
    // Stage 1: "Map" - Find relevant classes
    readonly searchClasses: (
      textContext: string
    ) => Effect.Effect<Chunk.Chunk<ClassDefinition>, Error>

    // Stage 2: "Bind" - Find allowed properties
    readonly getPropertiesFor: (
      classIds: ReadonlyArray<string>
    ) => Effect.Effect<Chunk.Chunk<PropertyDefinition>, Error>
  }
>() {}
```

**`packages/core/src/Services/RdfBuilder.ts`**
_Note: We treat the N3 Store as a managed resource using Scope._

```typescript
import { Context, Effect, Scope } from "effect"
import type { Store } from "n3"
import { Entity, Relation } from "../Domain/Model.js"

export class RdfBuilder extends Context.Tag("RdfBuilder")<
  RdfBuilder,
  {
    // Create a store that auto-closes/cleans up if needed
    readonly makeStore: Effect.Effect<Store, never, Scope.Scope>

    // Stateless mutations (Conceptually)
    readonly addEntities: (
      store: Store,
      entities: Iterable<Entity>
    ) => Effect.Effect<void>
    readonly addRelations: (
      store: Store,
      relations: Iterable<Relation>
    ) => Effect.Effect<void>

    // Serialization
    readonly toTurtle: (store: Store) => Effect.Effect<string>
  }
>() {}
```

---

### 4\. Layer Implementation: The Logic

Here is how we implement the `RdfBuilder` using `n3`. We wrap the external library to make it "Effect-safe".

**`packages/core/src/Layers/Rdf/N3Builder.ts`**

```typescript
import { Effect, Layer } from "effect"
import { RdfBuilder } from "../../Services/RdfBuilder.js"
import * as N3 from "n3"
import { DataFactory } from "n3"

const { namedNode, literal, quad } = DataFactory

export const N3BuilderLive = Layer.succeed(
  RdfBuilder,
  RdfBuilder.of({
    makeStore: Effect.acquireRelease(
      Effect.sync(() => new N3.Store()),
      () => Effect.void // In-memory stores usually don't need explicit close, but good practice
    ),

    addEntities: (store, entities) =>
      Effect.sync(() => {
        for (const entity of entities) {
          const subject = namedNode(`:${entity.id}`) // In prod, handle prefixes properly

          // Add Type
          for (const type of entity.types) {
            store.addQuad(quad(subject, namedNode("a"), namedNode(type)))
          }
          // Add Label
          store.addQuad(
            quad(subject, namedNode("rdfs:label"), literal(entity.mention))
          )
        }
      }),

    addRelations: (store, relations) =>
      Effect.sync(() => {
        for (const rel of relations) {
          store.addQuad(
            quad(
              namedNode(`:${rel.subjectId}`),
              namedNode(rel.predicate),
              // Simple logic: if it looks like an ID, make it a node, else literal
              // In prod, use your Ontology Schema to decide this strictly
              typeof rel.objectId === "string" && !rel.objectId.includes(" ")
                ? namedNode(`:${rel.objectId}`)
                : literal(String(rel.objectId))
            )
          )
        }
      }),

    toTurtle: (store) =>
      Effect.async((resume) => {
        const writer = new N3.Writer({ format: "Turtle" })
        store.forEach((q) => writer.addQuad(q))
        writer.end((error, result) => {
          if (error) resume(Effect.fail(error))
          else resume(Effect.succeed(result))
        })
      })
  })
)
```

---

### 5\. Workflow: The Composition

This is your **unified pipeline**. Notice how clean it is—no class instantiation, just function composition.

**`packages/core/src/Workflows/UnifiedExtraction.ts`**

```typescript
import { Effect, Chunk } from "effect"
import { OntologyService } from "../Services/OntologyService.js"
import { EntityExtractor, RelationExtractor } from "../Services/Extractor.js" // Assuming grouped export
import { RdfBuilder } from "../Services/RdfBuilder.js"

export const extractToTurtle = (text: string) =>
  Effect.gen(function* (_) {
    // 1. Get Services
    const ontology = yield* _(OntologyService)
    const entityExt = yield* _(EntityExtractor)
    const relationExt = yield* _(RelationExtractor)
    const rdf = yield* _(RdfBuilder)

    // 2. Start a Scope for the RDF Store (Resource Management)
    return yield* _(
      Effect.gen(function* (_) {
        const store = yield* _(rdf.makeStore)

        // --- Stage 1: Entities ---
        const classes = yield* _(ontology.searchClasses(text))
        const entities = yield* _(entityExt.extract(text, classes))

        yield* _(rdf.addEntities(store, entities))

        // --- Stage 2: Relations ---
        // Only extract if we actually found entities
        if (Chunk.isNonEmpty(entities)) {
          const classIds = Chunk.flatMap(entities, (e) =>
            Chunk.fromIterable(e.types)
          )
          const properties = yield* _(
            ontology.getPropertiesFor(Chunk.toReadonlyArray(classIds))
          )

          const relations = yield* _(
            relationExt.extract(text, entities, properties)
          )
          yield* _(rdf.addRelations(store, relations))
        }

        // --- Output ---
        return yield* _(rdf.toTurtle(store))
      }),
      Effect.scoped // Closes the Store scope automatically
    )
  })
```

### 6\. Main Entry & Exports

**`packages/core/src/index.ts`**

```typescript
// Main public API
export * as Domain from "./Domain/index.js"
export * as Services from "./Services/index.js"
export * as Workflows from "./Workflows/index.js"

// We usually export Layers separately or in a 'Live' module
export * as Layers from "./Layers/index.js"
```

**`packages/core/src/main.ts` (Example Usage)**

```typescript
import { Effect } from "effect"
import { extractToTurtle } from "./Workflows/UnifiedExtraction.js"
import { N3BuilderLive } from "./Layers/Rdf/N3Builder.js"
import {
  LlmEntityExtractorLive,
  LlmRelationExtractorLive
} from "./Layers/Llm/index.js"
import { OntologyServiceSemantic } from "./Layers/Ontology/Semantic.js"

// Compose your Runtime Environment
const ProductionRuntime = N3BuilderLive.pipe(
  Layer.provideMerge(LlmEntityExtractorLive),
  Layer.provideMerge(LlmRelationExtractorLive),
  Layer.provideMerge(OntologyServiceSemantic)
  // ... provide VectorStore, LlmClient, etc.
)

const program = extractToTurtle("Cristiano Ronaldo plays for Al-Nassr.")

// Run it
Effect.runPromise(program.pipe(Effect.provide(ProductionRuntime)))
  .then(console.log)
  .catch(console.error)
```

### Why this architecture?

1.  **Strict Boundaries:** LLMs return JSON. We convert to Domain Objects. We convert Domain Objects to N3. The LLM never touches N3 directly.
2.  **Testing:** You can test `UnifiedExtraction` by providing a `TestLayer` that returns mock entities without calling OpenAI.
3.  **Evolution:** Want to swap N3 for `rdflib`? Just write a new Layer for `RdfBuilder`. The rest of the app doesn't change.

Here is a video discussing Effect Clusters that might be relevant if you plan to distribute this extraction across multiple nodes in the future: [Effect Cluster Management](https://www.youtube.com/watch?v=COLq1FwMQH8)

The video is relevant because it discusses advanced Effect patterns like managing distributed processes, which could apply if you scale your extraction pipeline to handle massive datasets across multiple workers.

http://googleusercontent.com/youtube_content/23
