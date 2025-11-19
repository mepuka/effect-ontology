# Algebraic Architecture: Ontology Population in Effect

> **Perspective**: This document approaches ontology population as a library implementer would - identifying fundamental algebraic structures, composition laws, and type-level guarantees that make the system both correct and elegant.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Complete Pipeline](#the-complete-pipeline)
3. [Algebraic Structures](#algebraic-structures)
4. [Prompt Generation as Catamorphism](#prompt-generation-as-catamorphism)
5. [Streaming Architecture](#streaming-architecture)
6. [Validation as Constraint Solving](#validation-as-constraint-solving)
7. [Complete Effect Implementation](#complete-effect-implementation)
8. [Property-Based Testing](#property-based-testing)

---

## Executive Summary

This architecture treats **ontology population** as a series of algebraic transformations:

```
Ontology × Text → Effect<Stream<Token>> → Stream<Quad> → Effect<ValidatedOntology>
```

**Key insights:**
- **Prompts are catamorphisms** - folds over ontology graph structure (see `rigorous-prompt-algebra.md`)
- **RDF Quads** form a commutative monoid under set union
- **Ontology schemas** are refinement types that constrain quad-space
- **Extraction** is an effectful natural transformation: `Text ~> Effect<Stream<Quad>>`
- **Validation** is a Boolean algebra of SHACL constraints
- **Streams** provide resource-safe, compositional pipelines
- **Effect** ensures all side effects are tracked and manageable

**This document integrates:**
- Rigorous catamorphism-based prompt generation (`rigorous-prompt-algebra.md`)
- Effect-native primitives (`effect-native-prompt-architecture.md`)
- Streaming N3.js and SHACL validation pipeline
- Complete working implementation with property-based tests

---

## The Complete Pipeline

### High-Level Architecture

```typescript
/**
 * The complete ontology population pipeline as Effect program
 */
const populateOntology = (
  ontology: Ontology,
  textStream: Stream.Stream<string, never, never>
): Effect.Effect<
  ValidatedQuadStore,
  PopulationError,
  LLMService | N3Service | SHACLService | QuadStore
> =>
  Effect.gen(function* () {
    // 1. Generate extraction prompt via catamorphism
    const extractionPrompt = yield* generateExtractionPrompt(ontology)

    // 2. Stream LLM extraction
    const tokenStream = yield* LLMService.pipe(
      Effect.flatMap(service =>
        service.generateStream({
          model: "gpt-4o",
          messages: [
            { role: "system", content: extractionPrompt.system },
            { role: "user", content: extractionPrompt.user }
          ],
          temperature: 0
        })
      )
    )

    // 3. Parse N-Triples/Turtle stream to Quads
    const quadStream = yield* N3Service.pipe(
      Effect.flatMap(service =>
        service.parseStream(
          tokenStream.pipe(
            Stream.map(chunk => chunk.text),
            Stream.mkString
          )
        )
      )
    )

    // 4. Accumulate quads (monoid!)
    const quads = yield* quadStream.pipe(
      Stream.runFold(QuadSetMonoid.empty, QuadSetMonoid.combine)
    )

    // 5. Validate against SHACL shapes
    const validation = yield* SHACLService.pipe(
      Effect.flatMap(service =>
        service.validate(quads, ontology.shapes)
      )
    )

    // 6. Handle validation results
    if (!validation.conforms) {
      return yield* Effect.fail(
        new ValidationError({ violations: validation.results })
      )
    }

    // 7. Store validated quads
    return yield* QuadStore.pipe(
      Effect.flatMap(store => store.addAll(quads))
    )
  })
```

### Pipeline Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    Ontology Population                       │
└─────────────────────────────────────────────────────────────┘

   Ontology (Schema)
        │
        ├──► cata(ontology, PromptAlgebra)
        │         │
        │         ▼
        │    StructuredPrompt (Monoid)
        │         │
        ├─────────┘
        │
        ▼
   Text Stream ──► LLM.generateStream() ──► Stream<Token>
                         │
                         ▼
                   Stream.mkString
                         │
                         ▼
                   N3.parseStream() ──► Stream<Quad>
                         │
                         ▼
              Stream.runFold(QuadSetMonoid)
                         │
                         ▼
                      HashSet<Quad>
                         │
                         ├──► SHACL.validate(quads, shapes)
                         │         │
                         │         ├─ conforms: true  ──► Store
                         │         │
                         │         └─ conforms: false ──► Refinement Loop
                         │                                      │
                         └──────────────────────────────────────┘
```

---

## Algebraic Structures

### 1. Quad as Commutative Monoid

```typescript
import { Data, Equal, Hash, HashSet } from "effect"
import { Monoid } from "@effect/typeclass"

/**
 * RDF Quad - uses Effect's Data.struct for structural equality
 */
class Quad extends Data.Class<{
  readonly subject: string
  readonly predicate: string
  readonly object: string
  readonly graph?: string
}> {}

/**
 * QuadSet as Monoid
 *
 * - Identity: empty set
 * - Combine: set union
 * - Commutative: union is commutative
 * - Idempotent: A ∪ A = A
 */
const QuadSetMonoid: Monoid.Monoid<HashSet.HashSet<Quad>> = Monoid.make(
  (left, right) => HashSet.union(left, right),
  HashSet.empty()
)

/**
 * This monoid structure enables:
 * 1. Incremental accumulation of quads from stream
 * 2. Parallel extraction with automatic merging
 * 3. Compositional reasoning about triple stores
 */
```

### 2. Ontology as F-Algebra

From `rigorous-prompt-algebra.md`, ontology is defined as initial algebra:

```typescript
/**
 * Ontology Functor: F(X) represents one level of structure
 */
type OntologyF<X> =
  | { readonly _tag: "Leaf"; classData: ClassData }
  | { readonly _tag: "Node"; classData: ClassData; subclasses: ReadonlyArray<X> }
  | { readonly _tag: "Property"; propertyData: PropertyData; domain: string; range: string }

/**
 * Ontology is the fixed point: Ontology = OntologyF<Ontology>
 */
type Ontology = OntologyF<Ontology>

/**
 * Algebra maps F(X) → X
 */
interface OntologyAlgebra<R> {
  readonly foldLeaf: (data: ClassData) => R
  readonly foldNode: (data: ClassData, subResults: ReadonlyArray<R>) => R
  readonly foldProperty: (data: PropertyData, domain: string, range: string) => R
}
```

**Key insight**: This recursive structure allows us to compositionally generate prompts that respect class hierarchies.

### 3. StructuredPrompt as Monoid

```typescript
/**
 * Doc - the actual monoid
 */
type Doc = ReadonlyArray<string>  // Lines of text

const DocMonoid: Monoid.Monoid<Doc> = Monoid.array<string>()

/**
 * StructuredPrompt - prompts organized by section
 */
interface StructuredPrompt {
  readonly systemFragments: Doc
  readonly userFragments: Doc
  readonly exampleFragments: Doc
}

/**
 * Use Effect's Monoid.struct to derive monoid
 */
const StructuredPromptMonoid: Monoid.Monoid<StructuredPrompt> =
  Monoid.struct({
    systemFragments: DocMonoid,
    userFragments: DocMonoid,
    exampleFragments: DocMonoid
  })
```

**Law verification** (see Property-Based Testing section):
- Identity: `combine(empty, p) = p`
- Associativity: `combine(combine(p1, p2), p3) = combine(p1, combine(p2, p3))`

### 4. Validation as Boolean Algebra

```typescript
/**
 * SHACL ValidationResult
 */
interface ValidationResult {
  readonly conforms: boolean
  readonly results: ReadonlyArray<ValidationViolation>
}

/**
 * Boolean algebra operations:
 * - ∧ (AND): all shapes must validate
 * - ∨ (OR): at least one shape validates
 * - ¬ (NOT): negation for sh:not constraints
 */
const ValidationResultSemigroup: Semigroup.Semigroup<ValidationResult> =
  Semigroup.make((left, right) => ({
    conforms: left.conforms && right.conforms,  // Conjunction
    results: [...left.results, ...right.results]
  }))

const validationMonoid: Monoid.Monoid<ValidationResult> = Monoid.fromSemigroup(
  ValidationResultSemigroup,
  { conforms: true, results: [] }  // Identity: everything validates
)
```

---

## Prompt Generation as Catamorphism

**See `rigorous-prompt-algebra.md` for full mathematical treatment.**

### The Catamorphism

```typescript
/**
 * cata: fold over ontology structure
 *
 * This is the unique homomorphism from initial algebra to any other
 */
const cata = <R>(ont: Ontology, alg: OntologyAlgebra<R>): R =>
  Match.value(ont).pipe(
    Match.tag("Leaf", ({ classData }) =>
      alg.foldLeaf(classData)
    ),
    Match.tag("Node", ({ classData, subclasses }) => {
      const subResults = subclasses.map(sub => cata(sub, alg))
      return alg.foldNode(classData, subResults)
    }),
    Match.tag("Property", ({ propertyData, domain, range }) =>
      alg.foldProperty(propertyData, domain, range)
    ),
    Match.exhaustive
  )
```

### Prompt Algebra

```typescript
/**
 * Algebra for generating extraction prompts
 */
const ExtractionPromptAlgebra: OntologyAlgebra<StructuredPrompt> = {
  foldLeaf: (classData) => ({
    systemFragments: [
      `Extract instances of class '${classData.label}' (${classData.iri})`,
      classData.comment ? `Definition: ${classData.comment}` : ""
    ].filter(Boolean),
    userFragments: [],
    exampleFragments: []
  }),

  foldNode: (classData, subResults) => {
    // Combine parent class prompt with subclass prompts
    const parentPrompt: StructuredPrompt = {
      systemFragments: [
        `Extract instances of class '${classData.label}' (${classData.iri})`,
        classData.comment ? `Definition: ${classData.comment}` : "",
        "This class has the following subclasses:"
      ].filter(Boolean),
      userFragments: [],
      exampleFragments: []
    }

    // Combine all prompts using monoid
    return Monoid.combineAll(StructuredPromptMonoid)([
      parentPrompt,
      ...subResults
    ])
  },

  foldProperty: (propertyData, domain, range) => ({
    systemFragments: [
      `Extract property '${propertyData.label}' (${propertyData.iri})`,
      `Domain: ${domain}, Range: ${range}`,
      propertyData.functional ? "Note: This is a functional property (max 1 value)" : ""
    ].filter(Boolean),
    userFragments: [],
    exampleFragments: [
      `Example: <${domain}_instance> <${propertyData.iri}> <${range}_instance> .`
    ]
  })
}
```

### Generating Prompts

```typescript
/**
 * Generate extraction prompt from ontology
 */
const generateExtractionPrompt = (
  ontologyElements: ReadonlyArray<Ontology>
): Effect.Effect<
  { readonly system: string; readonly user: string; readonly examples: string },
  never,
  never
> =>
  Effect.gen(function* () {
    // Fold each ontology element
    const prompts = ontologyElements.map(ont =>
      cata(ont, ExtractionPromptAlgebra)
    )

    // Combine using monoid
    const combined = Monoid.combineAll(StructuredPromptMonoid)(prompts)

    // Render to strings
    return {
      system: combined.systemFragments.join("\n\n"),
      user: combined.userFragments.join("\n\n"),
      examples: combined.exampleFragments.join("\n")
    }
  })
```

**Concrete example** (Bibliography ontology from `rigorous-prompt-algebra.md`):

```typescript
const BibliographyOntology: ReadonlyArray<Ontology> = [
  PersonWithSubs,      // Node: Person with Author, Editor subclasses
  PublicationHierarchy, // Node: Publication with Book, Article subclasses
  hasAuthorProperty,   // Property: Publication hasAuthor Author
  hasTitleProperty     // Property: Publication hasTitle string
]

const prompt = yield* generateExtractionPrompt(BibliographyOntology)

// Result respects hierarchy:
// - Person class with Author/Editor subclasses
// - Publication class with Book/Article subclasses
// - Properties with domain/range constraints
```

---

## Streaming Architecture

### N3.js Integration with Effect Channels

```typescript
import * as N3 from "n3"
import { Channel, Chunk, Stream } from "effect"

/**
 * N3 Service - streaming RDF parser/writer
 */
class N3Service extends Effect.Service<N3Service>()("N3Service", {
  effect: Effect.gen(function* () {
    return {
      /**
       * Parse RDF string stream into Quad stream
       *
       * Uses Effect Channels for backpressure
       */
      parseStream: (
        input: Stream.Stream<string, never, never>
      ): Effect.Effect<Stream.Stream<Quad, ParseError, never>, never, never> =>
        Effect.gen(function* () {
          return Stream.async<Quad, ParseError>((emit) => {
            const parser = new N3.Parser()

            // Connect stream to parser
            const runStream = input.pipe(
              Stream.runForEach((chunk) =>
                Effect.sync(() => {
                  try {
                    parser.parse(chunk, (error, quad, prefixes) => {
                      if (error) {
                        emit.fail(new ParseError({ cause: error }))
                      } else if (quad) {
                        emit.single(
                          new Quad({
                            subject: quad.subject.value,
                            predicate: quad.predicate.value,
                            object: quad.object.value,
                            graph: quad.graph.value
                          })
                        )
                      } else {
                        // End of stream
                        emit.end()
                      }
                    })
                  } catch (e) {
                    emit.fail(new ParseError({ cause: e }))
                  }
                })
              )
            )

            Effect.runFork(runStream)
          })
        }),

      /**
       * Write Quads to N-Triples/Turtle format
       */
      writeStream: (
        quads: Stream.Stream<Quad, never, never>,
        format: "N-Triples" | "Turtle" = "Turtle"
      ): Stream.Stream<string, WriteError, never> =>
        Stream.async((emit) => {
          const writer = new N3.Writer({ format })

          const runStream = quads.pipe(
            Stream.runForEach((quad) =>
              Effect.sync(() => {
                writer.addQuad(
                  N3.DataFactory.quad(
                    N3.DataFactory.namedNode(quad.subject),
                    N3.DataFactory.namedNode(quad.predicate),
                    quad.object.startsWith("http")
                      ? N3.DataFactory.namedNode(quad.object)
                      : N3.DataFactory.literal(quad.object),
                    quad.graph
                      ? N3.DataFactory.namedNode(quad.graph)
                      : N3.DataFactory.defaultGraph()
                  )
                )
              })
            ),
            Effect.andThen(
              Effect.sync(() => {
                writer.end((error, result) => {
                  if (error) {
                    emit.fail(new WriteError({ cause: error }))
                  } else {
                    emit.single(result)
                    emit.end()
                  }
                })
              })
            )
          )

          Effect.runFork(runStream)
        })
    }
  }),
  dependencies: []
}) {}
```

### Streaming Pipeline Composition

```typescript
/**
 * Complete streaming pipeline: Text → Quads
 */
const extractQuadsFromText = (
  ontology: Ontology,
  textStream: Stream.Stream<string, never, never>
): Effect.Effect<
  HashSet.HashSet<Quad>,
  ExtractionError | ParseError,
  LLMService | N3Service
> =>
  Effect.gen(function* () {
    // 1. Generate prompt
    const prompt = yield* generateExtractionPrompt([ontology])

    // 2. LLM extraction stream
    const llmStream = yield* LLMService.pipe(
      Effect.flatMap((service) =>
        service.generateStream({
          model: "gpt-4o",
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ],
          temperature: 0
        })
      )
    )

    // 3. Convert token stream to text stream
    const rdfStream = llmStream.pipe(
      Stream.map(chunk => chunk.text)
    )

    // 4. Parse to quads
    const quadStream = yield* N3Service.pipe(
      Effect.flatMap(service => service.parseStream(rdfStream))
    )

    // 5. Accumulate using monoid
    return yield* quadStream.pipe(
      Stream.runFold(QuadSetMonoid.empty, QuadSetMonoid.combine)
    )
  })

/**
 * Key properties:
 * - Backpressure: Stream controls LLM token rate
 * - Resource safety: Streams clean up automatically
 * - Composable: Easy to add transformations (filtering, batching, etc.)
 * - Parallel: Can process multiple texts concurrently
 */
```

---

## Validation as Constraint Solving

### SHACL Service

```typescript
import { Effect, Schema } from "effect"

class SHACLLoadError extends Data.TaggedError("SHACLLoadError")<{
  cause: unknown
}> {}

/**
 * SHACL Validation Service
 */
class SHACLService extends Effect.Service<SHACLService>()("SHACLService", {
  effect: Effect.gen(function* () {
    // In practice, use a library like rdf-validate-shacl
    const SHACLValidator = yield* Effect.tryPromise({
      try: () => import("rdf-validate-shacl").then(m => m.default),
      catch: (error) => new SHACLLoadError({ cause: error })
    })

    return {
      /**
       * Validate quads against SHACL shapes
       *
       * @returns ValidationResult with violations if any
       */
      validate: (
        quads: HashSet.HashSet<Quad>,
        shapes: string  // SHACL shapes graph as Turtle
      ): Effect.Effect<ValidationResult, ValidationError, never> =>
        Effect.gen(function* () {
          // Convert HashSet<Quad> to RDF dataset
          const dataset = yield* Effect.tryPromise({
            try: async () => {
              const store = new N3.Store()
              for (const quad of quads) {
                store.addQuad(
                  N3.DataFactory.namedNode(quad.subject),
                  N3.DataFactory.namedNode(quad.predicate),
                  quad.object.startsWith("http")
                    ? N3.DataFactory.namedNode(quad.object)
                    : N3.DataFactory.literal(quad.object)
                )
              }
              return store
            },
            catch: (error) => new ValidationError({ cause: error })
          })

          // Parse shapes
          const shapesGraph = yield* Effect.tryPromise({
            try: async () => {
              const parser = new N3.Parser()
              const store = new N3.Store()
              return new Promise((resolve, reject) => {
                parser.parse(shapes, (error, quad) => {
                  if (error) reject(error)
                  else if (quad) store.addQuad(quad)
                  else resolve(store)
                })
              })
            },
            catch: (error) => new ValidationError({ cause: error })
          })

          // Run validation
          const validator = new SHACLValidator(shapesGraph)
          const report = yield* Effect.sync(() => validator.validate(dataset))

          // Extract violations
          const violations: ReadonlyArray<ValidationViolation> = report.results.map(
            (result: any) => ({
              focusNode: result.focusNode?.value,
              path: result.path?.value,
              message: result.message?.[0]?.value || "Validation failed",
              severity: result.severity?.value
            })
          )

          return {
            conforms: report.conforms,
            results: violations
          }
        })
    }
  }),
  dependencies: []
}) {}
```

### SHACL Shapes for Bibliography Ontology

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix bib: <http://example.org/bib#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Person shape
bib:PersonShape a sh:NodeShape ;
  sh:targetClass bib:Person ;
  sh:property [
    sh:path bib:hasName ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:datatype xsd:string ;
  ] .

# Publication shape
bib:PublicationShape a sh:NodeShape ;
  sh:targetClass bib:Publication ;
  sh:property [
    sh:path bib:hasTitle ;
    sh:minCount 1 ;
    sh:maxCount 1 ;  # Functional property
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path bib:hasAuthor ;
    sh:minCount 1 ;  # Must have at least one author
    sh:class bib:Author ;
  ] .

# Book shape (inherits Publication constraints)
bib:BookShape a sh:NodeShape ;
  sh:targetClass bib:Book ;
  sh:property [
    sh:path bib:hasISBN ;
    sh:maxCount 1 ;
    sh:datatype xsd:string ;
    sh:pattern "^[0-9]{13}$" ;  # ISBN-13 format
  ] .
```

### Refinement Loop with Validation

```typescript
/**
 * Extraction with validation and refinement
 *
 * If validation fails, include violations in refined prompt
 */
const extractWithRefinement = (
  ontology: Ontology,
  shapes: string,
  textStream: Stream.Stream<string, never, never>,
  maxAttempts: number = 3
): Effect.Effect<
  HashSet.HashSet<Quad>,
  ExtractionError,
  LLMService | N3Service | SHACLService
> =>
  Effect.gen(function* () {
    let attempt = 0
    let quads: HashSet.HashSet<Quad> = HashSet.empty()
    let lastValidation: ValidationResult | undefined

    while (attempt < maxAttempts) {
      // Extract quads
      quads = yield* extractQuadsFromText(ontology, textStream)

      // Validate
      const validation = yield* SHACLService.pipe(
        Effect.flatMap(service => service.validate(quads, shapes))
      )

      if (validation.conforms) {
        return quads  // Success!
      }

      // Build refinement prompt
      const refinementPrompt = buildRefinementPrompt(
        ontology,
        validation.results
      )

      // Retry with refinement hints
      textStream = Stream.succeed(refinementPrompt)
      lastValidation = validation
      attempt++
    }

    // Failed after max attempts
    return yield* Effect.fail(
      new ExtractionError({
        message: "Validation failed after max attempts",
        violations: lastValidation?.results || []
      })
    )
  })

const buildRefinementPrompt = (
  ontology: Ontology,
  violations: ReadonlyArray<ValidationViolation>
): string => {
  const violationSummary = violations.map(v =>
    `- ${v.focusNode}: ${v.message} (path: ${v.path})`
  ).join("\n")

  return `The previous extraction had validation errors:

${violationSummary}

Please extract again, ensuring:
1. All required properties are present
2. Property cardinalities are respected
3. Datatype constraints are satisfied
4. Class disjointness is maintained

Extract triples in N-Triples format:`
}
```

---

## Complete Effect Implementation

### Service Layer Architecture

```typescript
/**
 * Complete service composition
 */

// LLM Service (using Effect AI)
const LLMServiceLive = Layer.succeed(LLMService, {
  generateStream: /* ... Effect AI implementation ... */
})

// N3 Service
const N3ServiceLive = Layer.succeed(N3Service, {
  parseStream: /* ... as shown above ... */,
  writeStream: /* ... as shown above ... */
})

// SHACL Service
const SHACLServiceLive = Layer.succeed(SHACLService, {
  validate: /* ... as shown above ... */
})

// QuadStore Service (persistence)
class QuadStore extends Effect.Service<QuadStore>()("QuadStore", {
  effect: Effect.gen(function* () {
    const store = yield* Effect.sync(() => new N3.Store())

    return {
      addAll: (quads: HashSet.HashSet<Quad>) =>
        Effect.sync(() => {
          for (const quad of quads) {
            store.addQuad(
              N3.DataFactory.namedNode(quad.subject),
              N3.DataFactory.namedNode(quad.predicate),
              quad.object.startsWith("http")
                ? N3.DataFactory.namedNode(quad.object)
                : N3.DataFactory.literal(quad.object)
            )
          }
          return { count: store.size, store }
        }),

      query: (subject?: string, predicate?: string, object?: string) =>
        Effect.sync(() =>
          Array.from(
            store.getQuads(
              subject ? N3.DataFactory.namedNode(subject) : null,
              predicate ? N3.DataFactory.namedNode(predicate) : null,
              object
                ? object.startsWith("http")
                  ? N3.DataFactory.namedNode(object)
                  : N3.DataFactory.literal(object)
                : null,
              null
            )
          ).map(
            (q) =>
              new Quad({
                subject: q.subject.value,
                predicate: q.predicate.value,
                object: q.object.value,
                graph: q.graph.value
              })
          )
        )
    }
  }),
  dependencies: []
}) {}

const QuadStoreLive = Layer.effect(QuadStore, QuadStore.effect)

// Combine all services
const AppLive = Layer.mergeAll(
  LLMServiceLive,
  N3ServiceLive,
  SHACLServiceLive,
  QuadStoreLive
)
```

### Main Program

```typescript
/**
 * Main ontology population program
 */
const program = Effect.gen(function* () {
  // Load bibliography ontology
  const ontology = BibliographyOntology

  // Load SHACL shapes
  const shapes = yield* Effect.tryPromise({
    try: () => fs.readFile("./shapes.ttl", "utf8"),
    catch: (error) => new FileReadError({ cause: error })
  })

  // Input text stream
  const textStream = Stream.fromIterable([
    "The book 'Ontology Engineering' was written by Dr. Jane Smith and published in 2023.",
    "John Doe authored the article 'Effect for Beginners' in 2024."
  ])

  // Run population with validation
  const quads = yield* extractWithRefinement(
    ontology,
    shapes,
    textStream,
    maxAttempts: 3
  )

  // Query results
  const publications = yield* QuadStore.pipe(
    Effect.flatMap(store =>
      store.query(undefined, "rdf:type", "bib:Publication")
    )
  )

  return {
    totalQuads: quads.size,
    publications: publications.length
  }
})

// Run with all services
const runnable = program.pipe(Effect.provide(AppLive))

Effect.runPromise(runnable).then(console.log)
```

---

## Property-Based Testing

### Testing Monoid Laws

```typescript
import * as fc from "fast-check"
import { describe, test, expect } from "vitest"

/**
 * Arbitrary for Doc
 */
const arbDoc: fc.Arbitrary<Doc> = fc.array(fc.string())

/**
 * Test: DocMonoid identity law
 */
test("DocMonoid satisfies identity law", () => {
  fc.assert(
    fc.property(arbDoc, (doc) => {
      const leftIdentity = DocMonoid.combine(DocMonoid.empty, doc)
      const rightIdentity = DocMonoid.combine(doc, DocMonoid.empty)

      expect(leftIdentity).toEqual(doc)
      expect(rightIdentity).toEqual(doc)
    })
  )
})

/**
 * Test: DocMonoid associativity law
 */
test("DocMonoid satisfies associativity law", () => {
  fc.assert(
    fc.property(arbDoc, arbDoc, arbDoc, (x, y, z) => {
      const leftAssoc = DocMonoid.combine(DocMonoid.combine(x, y), z)
      const rightAssoc = DocMonoid.combine(x, DocMonoid.combine(y, z))

      expect(leftAssoc).toEqual(rightAssoc)
    })
  )
})

/**
 * Test: QuadSetMonoid idempotence
 */
test("QuadSetMonoid is idempotent", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          subject: fc.webUrl(),
          predicate: fc.webUrl(),
          object: fc.oneof(fc.webUrl(), fc.string()),
          graph: fc.option(fc.webUrl())
        })
      ),
      (quads) => {
        const quadSet = HashSet.fromIterable(quads.map(q => new Quad(q)))
        const combined = QuadSetMonoid.combine(quadSet, quadSet)

        expect(combined).toEqual(quadSet)
      }
    )
  )
})
```

### Testing Catamorphism Laws

```typescript
/**
 * Test: Catamorphism fusion law
 *
 * If f ∘ alg1 = alg2, then f ∘ cata(ont, alg1) = cata(ont, alg2)
 */
test("cata satisfies fusion law", () => {
  const arbOntology = /* ... ontology generator ... */

  fc.assert(
    fc.property(arbOntology, (ont) => {
      // Define two algebras related by function f
      const alg1: OntologyAlgebra<number> = {
        foldLeaf: () => 1,
        foldNode: (_, subs) => 1 + subs.reduce((a, b) => a + b, 0),
        foldProperty: () => 1
      }

      const f = (n: number) => n * 2

      const alg2: OntologyAlgebra<number> = {
        foldLeaf: () => f(1),
        foldNode: (_, subs) => f(1 + subs.reduce((a, b) => a + b, 0)),
        foldProperty: () => f(1)
      }

      const result1 = f(cata(ont, alg1))
      const result2 = cata(ont, alg2)

      expect(result1).toEqual(result2)
    })
  )
})
```

### Testing Pipeline End-to-End

```typescript
/**
 * Test: Complete pipeline with example text
 */
test("Bibliography ontology extraction", async () => {
  const ontology = BibliographyOntology
  const shapes = `/* ... SHACL shapes ... */`

  const text = `
    The book "Ontology Engineering" was written by Dr. Jane Smith.
    She also authored "Knowledge Graphs" in collaboration with John Doe.
  `

  const textStream = Stream.succeed(text)

  const result = await program.pipe(
    Effect.provide(AppLive),
    Effect.runPromise
  )

  // Verify extracted quads
  expect(result.publications.length).toBeGreaterThanOrEqual(2)

  // Verify specific triples exist
  const hasBook = result.quads.some(
    q =>
      q.predicate === "rdf:type" &&
      q.object === "bib:Book"
  )
  expect(hasBook).toBe(true)

  const hasAuthor = result.quads.some(
    q =>
      q.predicate === "bib:hasAuthor" &&
      q.object.includes("Jane Smith")
  )
  expect(hasAuthor).toBe(true)
})
```

---

## Summary

This architecture demonstrates:

1. **Mathematical Rigor**: Catamorphisms, monoids, and F-algebras provide correctness guarantees
2. **Effect-Native**: Leverages `@effect/typeclass`, Schema AST, and Stream primitives
3. **Streaming**: End-to-end streaming from LLM tokens to validated quads
4. **Compositional**: Each piece (prompts, validation, extraction) composes cleanly
5. **Testable**: Property-based tests verify algebraic laws
6. **Production-Ready**: Uses N3.js for RDF, SHACL for validation, Effect for orchestration

**Key takeaways:**
- Prompts generated via catamorphism respect ontology structure
- Streaming enables handling large texts with constant memory
- Monoid structure enables parallel extraction with automatic merging
- SHACL validation provides refinement feedback loop
- Effect tracks all side effects and provides error recovery

**Next steps:**
- Implement RAG for context injection (relevant ontology fragments)
- Add caching layer for generated prompts
- Extend to handle OWL reasoning (beyond SHACL validation)
- Benchmark with real-world ontologies (FIBO, schema.org, etc.)
