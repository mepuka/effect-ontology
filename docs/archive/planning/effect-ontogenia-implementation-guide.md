# Effect-Based Ontogenia Implementation Guide

## Executive Summary

### What is Ontogenia?

Ontogenia is a state-of-the-art prompting technique for LLM-based ontology generation that achieves professional-quality results. Unlike simpler memoryless approaches, Ontogenia maintains context across iterations and uses a three-phase process for each competency question:

1. **Interpretation** - Identify key concepts and relationships
2. **Extension** - Generate OWL axioms with rich semantics
3. **Validation** - Verify coverage and create example instances

Research shows that OpenAI's o1-preview using Ontogenia produces ontologies meeting professional ontology engineer standards, surpassing novice-level modeling.

### Why Effect AI/Workflow is Ideal

Effect provides the perfect primitives for implementing Ontogenia:

- **Workflow Durability** - Ontology generation is long-running with many LLM calls; workflows provide resumability and state persistence
- **Streaming Native** - Effect AI streams tokens, N3.js streams quads - the entire pipeline can be streaming end-to-end
- **Type Safety** - Schema ensures prompts, responses, and state are validated
- **Error Recovery** - Tagged errors and retry schedules handle LLM rate limits, parsing errors, validation failures
- **Composability** - Services and layers provide clean separation between prompting, parsing, validation, and storage
- **Observability** - Built-in tracing tracks every prompt/response through the pipeline

### Key Architectural Decisions

1. **Workflow-Centric**: Effect Workflow orchestrates the entire Ontogenia process as a durable long-running workflow
2. **Streaming Pipeline**: LLM tokens → N3 parser → validation → storage, all as Effect Streams
3. **Service Layers**: Clean separation between PromptService, LLMService, N3Service, SHACLService, ODPService
4. **Refinement Loops**: Parse/validation errors trigger refinement prompts with Effect retry schedules
5. **Multi-Provider**: Effect AI abstracts over OpenAI, Anthropic, etc. for experimentation
6. **Production OWL Tools**: N3.js for RDF, SHACL libraries for validation - we don't reimplement OWL semantics

---

## 1. Ontogenia Prompting Structure Implementation

### Phase 1: Interpretation

**Purpose**: Identify key concepts (classes) and relationships (properties) needed to answer the competency question.

**Research Reference** (ontology_research.md:53):

> "Interpretation phase: the LLM reads the user story and CQs, and identifies key concepts (classes) and relationships needed"

#### Prompt Structure

```typescript
const buildInterpretationPrompt = (
  cq: CompetencyQuestion,
  currentOntology: string,
  relevantODPs: Array<OntologyDesignPattern>
) => ({
  system: `You are an expert ontology engineer specializing in OWL ontology design.

Your task is to analyze a competency question and identify the key concepts and relationships needed to answer it.

Guidelines:
- Focus on domain concepts that should become OWL classes
- Identify relationships that should become OWL properties (object and data properties)
- Consider existing ontology content to maintain consistency
- Reference ontology design patterns when applicable
- Think step-by-step about what entities and relationships are implied

Output format: A structured analysis listing:
1. Required Classes (with brief descriptions)
2. Required Object Properties (with domain/range)
3. Required Data Properties (with domain/datatype)
4. Relevant Design Patterns to apply`,

  user: `Current Ontology State:
\`\`\`turtle
${currentOntology}
\`\`\`

Relevant Ontology Design Patterns:
${formatODPs(relevantODPs)}

User Story: ${cq.userStory}

Competency Question: ${cq.question}

Task: Identify the key concepts (classes) and relationships (properties) needed to answer this competency question. Consider how they relate to the existing ontology.`
})
```

#### Effect AI Streaming Implementation

```typescript
const interpretationActivity = (
  cq: CompetencyQuestion,
  currentOntology: string,
  odps: Array<OntologyDesignPattern>
) =>
  Effect.gen(function* () {
    const prompt = buildInterpretationPrompt(cq, currentOntology, odps)

    // Stream LLM response
    const interpretation = yield* LLMService.pipe(
      Effect.flatMap((service) =>
        service.generateStream({
          model: "gpt-4o", // or o1-preview for best results
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ],
          temperature: 0 // Deterministic for consistency
        })
      ),
      Stream.mkString, // Collect all tokens into final string
      Effect.timeout("60 seconds"),
      Effect.retry({
        schedule: Schedule.exponential("1 second").pipe(
          Schedule.compose(Schedule.recurs(3))
        ),
        while: (error) => error._tag === "LLMRateLimitError"
      }),
      Effect.tap((result) =>
        Effect.log(`Interpretation complete for CQ: ${cq.id}`)
      )
    )

    return Schema.decodeUnknown(InterpretationResult)(interpretation)
  })

// Schema for structured interpretation result
const InterpretationResult = Schema.Struct({
  classes: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String
    })
  ),
  objectProperties: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      domain: Schema.String,
      range: Schema.String
    })
  ),
  dataProperties: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      domain: Schema.String,
      datatype: Schema.String
    })
  ),
  relevantPatterns: Schema.Array(Schema.String)
})
```

---

### Phase 2: Extension

**Purpose**: Generate OWL axioms (classes, properties, restrictions) in Turtle format that extend the ontology.

**Research Reference** (ontology_research.md:53):

> "Extension phase: the LLM reflects on whether additional axioms like restrictions or rules are needed"

**Key Requirements** (ontology_research.md:53):

> "Ontogenia also explicitly asks for richer OWL features – e.g. add inverse properties, rdfs:labels, and individual examples for each class"

#### Prompt Structure

```typescript
const buildExtensionPrompt = (
  cq: CompetencyQuestion,
  currentOntology: string,
  interpretation: InterpretationResult,
  relevantODPs: Array<OntologyDesignPattern>
) => ({
  system: `You are an expert ontology engineer. Generate OWL ontology axioms in Turtle format.

CRITICAL REQUIREMENTS:
- Output ONLY valid Turtle syntax
- Do NOT output conversational text or explanations
- Do NOT output empty ontology
- Use exact class/property names from interpretation
- Include rich OWL features:
  * rdfs:label and rdfs:comment for all entities
  * owl:inverseOf for bidirectional relationships
  * rdfs:domain and rdfs:range for all properties
  * owl:Restriction where cardinality matters
  * Example individuals (rdf:type assertions)

Format:
\`\`\`turtle
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix : <http://example.org/ontology#> .

# Your axioms here
\`\`\``,

  user: `Current Ontology:
\`\`\`turtle
${currentOntology}
\`\`\`

Interpretation Analysis:
${JSON.stringify(interpretation, null, 2)}

Design Patterns to Apply:
${formatODPs(relevantODPs)}

User Story: ${cq.userStory}
Competency Question: ${cq.question}

Task: Generate Turtle syntax to extend the ontology and answer this competency question. Include classes, properties, restrictions, labels, and example individuals.`
})
```

#### Streaming + N3 Integration

```typescript
const extensionActivity = (
  cq: CompetencyQuestion,
  currentOntology: string,
  interpretation: InterpretationResult,
  odps: Array<OntologyDesignPattern>
) =>
  Effect.gen(function* () {
    const prompt = buildExtensionPrompt(
      cq,
      currentOntology,
      interpretation,
      odps
    )

    // Stream LLM → N3 Parser → Validation
    const validatedQuads = yield* LLMService.pipe(
      Effect.flatMap((service) =>
        service.generateStream({
          model: "gpt-4o",
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ],
          temperature: 0
        })
      ),
      // Stream tokens through N3 parser
      Stream.pipeThroughChannel(N3Service.parseStream()),
      // Validate each quad
      Stream.mapEffect((quad) => validateQuad(quad, currentOntology)),
      Stream.runCollect,
      // Refinement loop on parse errors
      Effect.catchTag("N3ParseError", (error) =>
        refinementPrompt(prompt, error).pipe(
          Effect.flatMap((newTurtle) => parseN3(newTurtle))
        )
      ),
      Effect.retry({
        schedule: Schedule.recurs(2), // Max 2 refinements
        while: (error) =>
          error._tag === "N3ParseError" || error._tag === "SHACLViolation"
      })
    )

    return validatedQuads
  })
```

---

### Phase 3: Validation

**Purpose**: Verify that the extended ontology answers the competency question, create example instances.

**Research Reference** (ontology_research.md:53):

> "Validation phase: after proposing an ontology update, the LLM is prompted to double-check its work, possibly by explaining how the CQ is now covered or by creating a small example to test the ontology"

#### Prompt Structure

```typescript
const buildValidationPrompt = (
  cq: CompetencyQuestion,
  extendedOntology: string
) => ({
  system: `You are an ontology validation expert.

Your task: Verify that an ontology can answer a competency question.

Output format:
1. Explanation: How does the ontology answer the question?
2. Example: Create example instances (individuals) that demonstrate the answer
3. Coverage: Does the ontology fully cover the question? (Yes/No/Partial)`,

  user: `Extended Ontology:
\`\`\`turtle
${extendedOntology}
\`\`\`

Competency Question: ${cq.question}

Task:
1. Explain how this ontology answers the competency question
2. Create example individuals in Turtle format to demonstrate
3. Assess coverage (Yes/No/Partial)`
})
```

#### Implementation

```typescript
const validationActivity = (cq: CompetencyQuestion, extendedOntology: string) =>
  Effect.gen(function* () {
    const prompt = buildValidationPrompt(cq, extendedOntology)

    const validation = yield* LLMService.pipe(
      Effect.flatMap((service) =>
        service.generateStream({
          model: "gpt-4o",
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ],
          temperature: 0
        })
      ),
      Stream.mkString
    )

    // Parse validation result
    const result = yield* Schema.decodeUnknown(ValidationResult)(validation)

    // If coverage is not "Yes", flag for human review
    if (result.coverage !== "Yes") {
      yield* Effect.log(
        `⚠️ Partial coverage for CQ ${cq.id}: ${result.explanation}`
      )
    }

    return result
  })

const ValidationResult = Schema.Struct({
  explanation: Schema.String,
  exampleTurtle: Schema.String,
  coverage: Schema.Literal("Yes", "No", "Partial")
})
```

---

## 2. Effect Primitives Mapping

### Workflow State Schema

```typescript
import { Schema } from "@effect/schema"

// Competency Question input
const CompetencyQuestion = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("CQId")),
  question: Schema.String.pipe(Schema.minLength(10)),
  userStory: Schema.String,
  expectedEntities: Schema.optional(Schema.Array(Schema.String))
})

// Ontology Design Pattern
const OntologyDesignPattern = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  turtleTemplate: Schema.String,
  applicableFor: Schema.Array(Schema.String) // Keywords for relevance matching
})

// Result of processing one CQ
const ProcessedCQ = Schema.Struct({
  cqId: Schema.String.pipe(Schema.brand("CQId")),
  interpretation: InterpretationResult,
  extensionQuads: Schema.Array(QuadSchema),
  validation: ValidationResult,
  processedAt: Schema.Date
})

// Main workflow state
const OntogeniaWorkflowState = Schema.Struct({
  // Core ontology (serialized as Turtle)
  ontologyTurtle: Schema.String,

  // N3 Store state (for efficient querying)
  storeSnapshot: Schema.String, // Serialized N3 Store

  // Competency questions
  allCQs: Schema.Array(CompetencyQuestion),
  processedCQs: Schema.Array(ProcessedCQ),
  currentCQIndex: Schema.Number,

  // ODP library
  odpLibrary: Schema.Array(OntologyDesignPattern),

  // Metadata
  metadata: Schema.Struct({
    workflowId: Schema.String,
    startedAt: Schema.Date,
    totalCQs: Schema.Number,
    llmProvider: Schema.String,
    modelName: Schema.String
  })
})

// RDF Quad schema (for N3.js quad objects)
const QuadSchema = Schema.Struct({
  subject: Schema.Union(
    Schema.Struct({
      termType: Schema.Literal("NamedNode"),
      value: Schema.String
    }),
    Schema.Struct({
      termType: Schema.Literal("BlankNode"),
      value: Schema.String
    })
  ),
  predicate: Schema.Struct({
    termType: Schema.Literal("NamedNode"),
    value: Schema.String
  }),
  object: Schema.Union(
    Schema.Struct({
      termType: Schema.Literal("NamedNode"),
      value: Schema.String
    }),
    Schema.Struct({
      termType: Schema.Literal("Literal"),
      value: Schema.String,
      datatype: Schema.optional(Schema.String)
    })
  ),
  graph: Schema.optional(
    Schema.Struct({ termType: Schema.Literal("DefaultGraph") })
  )
})
```

### Main Workflow Definition

```typescript
import { Workflow } from "@effect/workflow"
import { Effect, Stream, Schedule } from "effect"

const OntogeniaWorkflow = Workflow.make("OntogeniaWorkflow", {
  // Workflow accepts initial configuration
  input: Schema.Struct({
    competencyQuestions: Schema.Array(CompetencyQuestion),
    initialOntology: Schema.optional(Schema.String),
    odpLibrary: Schema.Array(OntologyDesignPattern),
    llmConfig: Schema.Struct({
      provider: Schema.String,
      model: Schema.String,
      apiKey: Schema.String
    })
  }),

  // Workflow returns final ontology
  output: Schema.Struct({
    finalOntology: Schema.String,
    processedCQs: Schema.Array(ProcessedCQ),
    metadata: Schema.Struct({
      totalTime: Schema.Number,
      totalLLMCalls: Schema.Number,
      successfulCQs: Schema.Number
    })
  }),

  // Workflow execution
  execute: ({ competencyQuestions, initialOntology, odpLibrary, llmConfig }) =>
    Effect.gen(function* () {
      // Initialize workflow state
      let state: OntogeniaWorkflowState = {
        ontologyTurtle: initialOntology || "",
        storeSnapshot: "",
        allCQs: competencyQuestions,
        processedCQs: [],
        currentCQIndex: 0,
        odpLibrary: odpLibrary,
        metadata: {
          workflowId: yield* Workflow.workflowId(),
          startedAt: new Date(),
          totalCQs: competencyQuestions.length,
          llmProvider: llmConfig.provider,
          modelName: llmConfig.model
        }
      }

      // Process each competency question iteratively
      for (const cq of competencyQuestions) {
        yield* Effect.log(
          `Processing CQ ${state.currentCQIndex + 1}/${
            competencyQuestions.length
          }: ${cq.question}`
        )

        // Execute the three-phase activity
        const result = yield* Workflow.executeActivity(
          processCompetencyQuestionActivity,
          {
            cq,
            currentOntology: state.ontologyTurtle,
            odpLibrary: state.odpLibrary
          },
          {
            startToCloseTimeout: "10 minutes",
            retryPolicy: {
              maximumAttempts: 3,
              backoff: "exponential"
            }
          }
        )

        // Merge result into ontology
        const mergedOntology = yield* Workflow.executeActivity(
          mergeOntologyActivity,
          {
            currentOntology: state.ontologyTurtle,
            newQuads: result.extensionQuads
          },
          {
            startToCloseTimeout: "2 minutes"
          }
        )

        // Update state
        state = {
          ...state,
          ontologyTurtle: mergedOntology,
          processedCQs: [
            ...state.processedCQs,
            {
              cqId: cq.id,
              interpretation: result.interpretation,
              extensionQuads: result.extensionQuads,
              validation: result.validation,
              processedAt: new Date()
            }
          ],
          currentCQIndex: state.currentCQIndex + 1
        }

        // Persist state checkpoint (durable)
        yield* Workflow.sleep("0 seconds") // Checkpoint
      }

      // Return final result
      return {
        finalOntology: state.ontologyTurtle,
        processedCQs: state.processedCQs,
        metadata: {
          totalTime: Date.now() - state.metadata.startedAt.getTime(),
          totalLLMCalls: state.processedCQs.length * 3, // 3 phases per CQ
          successfulCQs: state.processedCQs.filter(
            (p) => p.validation.coverage === "Yes"
          ).length
        }
      }
    })
})
```

### Activity Implementations

```typescript
// Main activity: Process one CQ through 3 phases
const processCompetencyQuestionActivity = Workflow.defineActivity({
  name: "ProcessCompetencyQuestion",
  input: Schema.Struct({
    cq: CompetencyQuestion,
    currentOntology: Schema.String,
    odpLibrary: Schema.Array(OntologyDesignPattern)
  }),
  output: Schema.Struct({
    interpretation: InterpretationResult,
    extensionQuads: Schema.Array(QuadSchema),
    validation: ValidationResult
  }),
  execute: ({ cq, currentOntology, odpLibrary }) =>
    Effect.gen(function* () {
      // Select relevant ODPs based on CQ keywords
      const relevantODPs = yield* selectRelevantODPs(cq, odpLibrary)

      // Phase 1: Interpretation
      const interpretation = yield* interpretationActivity(
        cq,
        currentOntology,
        relevantODPs
      )

      // Phase 2: Extension
      const extensionQuads = yield* extensionActivity(
        cq,
        currentOntology,
        interpretation,
        relevantODPs
      )

      // Serialize quads back to Turtle for validation phase
      const extendedTurtle = yield* N3Service.serializeQuads([
        ...(yield* N3Service.parse(currentOntology)),
        ...extensionQuads
      ])

      // Phase 3: Validation
      const validation = yield* validationActivity(cq, extendedTurtle)

      return { interpretation, extensionQuads, validation }
    })
})

// Merge activity: Combine new quads into ontology
const mergeOntologyActivity = Workflow.defineActivity({
  name: "MergeOntology",
  input: Schema.Struct({
    currentOntology: Schema.String,
    newQuads: Schema.Array(QuadSchema)
  }),
  output: Schema.String,
  execute: ({ currentOntology, newQuads }) =>
    Effect.gen(function* () {
      // Parse current ontology
      const currentQuads = yield* N3Service.parse(currentOntology).pipe(
        Stream.runCollect
      )

      // Combine (N3 Store handles deduplication)
      const store = yield* N3Service.createStore()
      yield* N3Service.addQuads(store, currentQuads)
      yield* N3Service.addQuads(store, newQuads)

      // Serialize merged ontology
      const merged = yield* N3Service.serializeStore(store)

      return merged
    })
})
```

---

## 3. Services Layer Architecture

### PromptService

```typescript
import { Effect, Context, Layer } from "effect"

interface PromptService {
  buildInterpretationPrompt: (
    cq: CompetencyQuestion,
    ontology: string,
    odps: Array<OntologyDesignPattern>
  ) => Effect.Effect<{ system: string; user: string }>

  buildExtensionPrompt: (
    cq: CompetencyQuestion,
    ontology: string,
    interpretation: InterpretationResult,
    odps: Array<OntologyDesignPattern>
  ) => Effect.Effect<{ system: string; user: string }>

  buildValidationPrompt: (
    cq: CompetencyQuestion,
    ontology: string
  ) => Effect.Effect<{ system: string; user: string }>

  buildRefinementPrompt: (
    originalPrompt: { system: string; user: string },
    error: N3ParseError | SHACLViolation
  ) => Effect.Effect<{ system: string; user: string }>
}

const PromptService = Context.GenericTag<PromptService>("PromptService")

// Implementation
const PromptServiceLive = Layer.succeed(
  PromptService,
  PromptService.of({
    buildInterpretationPrompt: (cq, ontology, odps) =>
      Effect.gen(function* () {
        const relevantODPs = yield* selectRelevantODPsFromKeywords(
          cq.question,
          odps
        )
        return {
          system: interpretationSystemPrompt,
          user: `Current Ontology:\n${ontology}\n\nODPs:\n${formatODPs(
            relevantODPs
          )}\n\nCQ: ${cq.question}`
        }
      })
    // ... other methods
  })
)
```

### LLMService (Effect AI)

```typescript
import { Ai } from "@effect/ai"

interface LLMService {
  generateStream: (config: {
    model: string
    messages: Array<{ role: string; content: string }>
    temperature: number
  }) => Stream.Stream<string, LLMError>

  generate: (config: {
    model: string
    messages: Array<{ role: string; content: string }>
    temperature: number
  }) => Effect.Effect<string, LLMError>
}

const LLMService = Context.GenericTag<LLMService>("LLMService")

// Multi-provider implementation
const LLMServiceLive = (config: {
  provider: "openai" | "anthropic"
  apiKey: string
}) =>
  Layer.effect(
    LLMService,
    Effect.gen(function* () {
      const client = yield* config.provider === "openai"
        ? Ai.makeOpenAi({ apiKey: config.apiKey })
        : Ai.makeAnthropic({ apiKey: config.apiKey })

      return LLMService.of({
        generateStream: ({ model, messages, temperature }) =>
          client
            .generateStream({
              model,
              messages,
              temperature
            })
            .pipe(
              Stream.catchAll((error) =>
                Stream.fail(new LLMError({ cause: error }))
              )
            ),

        generate: ({ model, messages, temperature }) =>
          client
            .generate({
              model,
              messages,
              temperature
            })
            .pipe(Effect.map((response) => response.content))
      })
    })
  )
```

### N3Service

```typescript
import * as N3 from "n3"
import { Stream, Effect, Chunk } from "effect"

interface N3Service {
  // Streaming parser
  parseStream: () => Channel.Channel<
    Quad,
    string,
    unknown,
    unknown,
    N3ParseError,
    unknown
  >

  // Batch parse
  parse: (turtle: string) => Stream.Stream<Quad, N3ParseError>

  // Serialize
  serializeQuads: (quads: Array<Quad>) => Effect.Effect<string, never>
  serializeStore: (store: N3.Store) => Effect.Effect<string, never>

  // Store operations
  createStore: () => Effect.Effect<N3.Store, never>
  addQuads: (store: N3.Store, quads: Array<Quad>) => Effect.Effect<void, never>
  query: (
    store: N3.Store,
    subject?: string,
    predicate?: string,
    object?: string
  ) => Stream.Stream<Quad, never>
}

const N3Service = Context.GenericTag<N3Service>("N3Service")

const N3ServiceLive = Layer.succeed(
  N3Service,
  N3Service.of({
    parseStream: () =>
      Channel.make((emit) => {
        const parser = new N3.Parser()

        return Channel.write((turtle: string) =>
          Effect.async<void, N3ParseError>((resume) => {
            parser.parse(turtle, (error, quad, prefixes) => {
              if (error) {
                resume(
                  Effect.fail(
                    new N3ParseError({
                      message: error.message,
                      line: parser.line,
                      token: parser.token
                    })
                  )
                )
              } else if (quad) {
                emit.single(quad)
              } else {
                emit.end()
                resume(Effect.unit)
              }
            })
          })
        )
      }),

    parse: (turtle) =>
      Stream.async<Quad, N3ParseError>((emit) => {
        const parser = new N3.Parser()
        parser.parse(turtle, (error, quad, prefixes) => {
          if (error) {
            emit.fail(
              new N3ParseError({
                message: error.message,
                line: error.line,
                token: error.token
              })
            )
          } else if (quad) {
            emit.single(quad)
          } else {
            emit.end()
          }
        })
      }),

    serializeQuads: (quads) =>
      Effect.sync(() => {
        const writer = new N3.Writer()
        quads.forEach((q) => writer.addQuad(q))
        return writer.end()
      }),

    createStore: () => Effect.sync(() => new N3.Store()),

    addQuads: (store, quads) =>
      Effect.sync(() => {
        quads.forEach((q) => store.addQuad(q))
      }),

    query: (store, subject, predicate, object) =>
      Stream.fromIterable(
        store.match(
          subject ? N3.DataFactory.namedNode(subject) : null,
          predicate ? N3.DataFactory.namedNode(predicate) : null,
          object ? N3.DataFactory.namedNode(object) : null
        )
      )
  })
)
```

### SHACLService

```typescript
import * as SHACLValidator from "rdf-validate-shacl"

interface SHACLService {
  validate: (
    dataQuads: Array<Quad>,
    shapesQuads: Array<Quad>
  ) => Effect.Effect<ValidationReport, SHACLViolation>
}

const SHACLService = Context.GenericTag<SHACLService>("SHACLService")

const SHACLServiceLive = Layer.succeed(
  SHACLService,
  SHACLService.of({
    validate: (dataQuads, shapesQuads) =>
      Effect.gen(function* () {
        const validator = new SHACLValidator.Validator(shapesQuads)
        const report = validator.validate(dataQuads)

        if (!report.conforms) {
          return yield* Effect.fail(
            new SHACLViolation({
              violations: report.results.map((r) => ({
                path: r.path?.value || "unknown",
                message: r.message?.[0]?.value || "Validation failed"
              }))
            })
          )
        }

        return { conforms: true, results: [] }
      })
  })
)
```

### ODPService

```typescript
interface ODPService {
  loadLibrary: () => Effect.Effect<Array<OntologyDesignPattern>, never>
  selectRelevant: (
    cq: CompetencyQuestion,
    library: Array<OntologyDesignPattern>
  ) => Effect.Effect<Array<OntologyDesignPattern>, never>
}

const ODPService = Context.GenericTag<ODPService>("ODPService")

const ODPServiceLive = Layer.effect(
  ODPService,
  Effect.gen(function* () {
    // Load ODPs from file or API
    const library = yield* Effect.sync(() => [
      {
        id: "part-whole",
        name: "Part-Whole Pattern",
        description: "Model parthood relationships",
        turtleTemplate: `
:hasPart a owl:ObjectProperty ;
  rdfs:domain :Whole ;
  rdfs:range :Part ;
  owl:inverseOf :isPartOf .
        `,
        applicableFor: ["part", "component", "contains", "consists of"]
      }
      // ... more ODPs
    ])

    return ODPService.of({
      loadLibrary: () => Effect.succeed(library),

      selectRelevant: (cq, lib) =>
        Effect.sync(() => {
          const keywords = extractKeywords(cq.question.toLowerCase())
          return lib.filter((odp) =>
            odp.applicableFor.some((keyword) => keywords.includes(keyword))
          )
        })
    })
  })
)
```

---

## 4. Refinement Loop Architecture

### Parse Error Refinement

**Research Reference** (ontology_research.md:33):

> "Detected errors can then be used as feedback to the LLM in a refinement prompt. The prompt might say: 'The following RDF output has errors: … (lists triples and errors). Refine the triples to fix these issues while adhering to the ontology schema.'"

```typescript
class N3ParseError extends Schema.TaggedError<N3ParseError>()("N3ParseError", {
  message: Schema.String,
  line: Schema.Number,
  token: Schema.String,
  originalTurtle: Schema.String
}) {}

const buildRefinementPromptForParseError = (
  originalPrompt: { system: string; user: string },
  error: N3ParseError
) => ({
  system: originalPrompt.system,
  user: `${originalPrompt.user}

PREVIOUS OUTPUT HAD PARSE ERROR:
Line ${error.line}: ${error.message}
Token: "${error.token}"

The output was:
\`\`\`
${error.originalTurtle}
\`\`\`

Fix the syntax error and output valid Turtle. Do NOT include explanations, ONLY the corrected Turtle code.`
})

const refinementLoop = (
  originalPrompt: { system: string; user: string },
  maxRetries: number = 2
) =>
  Effect.gen(function* () {
    let attempts = 0
    let currentPrompt = originalPrompt

    while (attempts < maxRetries) {
      const turtle = yield* LLMService.pipe(
        Effect.flatMap((service) =>
          service.generate({
            model: "gpt-4o",
            messages: [
              { role: "system", content: currentPrompt.system },
              { role: "user", content: currentPrompt.user }
            ],
            temperature: 0
          })
        )
      )

      // Try parsing
      const parseResult = yield* N3Service.parse(turtle).pipe(
        Stream.runCollect,
        Effect.either // Don't throw, capture error
      )

      if (Either.isRight(parseResult)) {
        return parseResult.right // Success!
      }

      // Parse failed, build refinement prompt
      const error = parseResult.left
      currentPrompt = buildRefinementPromptForParseError(currentPrompt, {
        ...error,
        originalTurtle: turtle
      })

      attempts++
      yield* Effect.log(`Parse error, retry ${attempts}/${maxRetries}`)
    }

    // Max retries exceeded
    return yield* Effect.fail(
      new MaxRetriesExceeded({
        reason: "Could not generate valid Turtle after refinement"
      })
    )
  })
```

### SHACL Validation Refinement

```typescript
class SHACLViolation extends Schema.TaggedError<SHACLViolation>()(
  "SHACLViolation",
  {
    violations: Schema.Array(
      Schema.Struct({
        path: Schema.String,
        message: Schema.String
      })
    ),
    originalTurtle: Schema.String
  }
) {}

const buildRefinementPromptForSHACL = (
  originalPrompt: { system: string; user: string },
  error: SHACLViolation
) => ({
  system: originalPrompt.system,
  user: `${originalPrompt.user}

PREVIOUS OUTPUT HAD VALIDATION ERRORS:

${error.violations.map((v) => `- ${v.path}: ${v.message}`).join("\n")}

The output was:
\`\`\`turtle
${error.originalTurtle}
\`\`\`

Fix these validation errors and output corrected Turtle. Ensure all domain/range constraints are met.`
})
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic streaming pipeline working

**Deliverables**:

1. N3Service with streaming parse/serialize
2. LLMService with Effect AI (single provider)
3. Basic workflow that processes 1 CQ
4. Simple prompt templates (interpretation + extension only)
5. Unit tests for services

**Success Criteria**:

- Can parse Turtle → quads
- Can call LLM and get streaming response
- Can run simple workflow end-to-end

---

### Phase 2: Core Ontogenia (Week 3-4)

**Goal**: Full 3-phase Ontogenia implementation

**Deliverables**:

1. All 3 phases (interpretation, extension, validation)
2. PromptService with research-based prompts
3. ODPService with basic pattern library
4. Refinement loops for parse errors
5. Integration tests with real CQs

**Success Criteria**:

- Process multiple CQs iteratively
- Context maintained across iterations
- Parse errors trigger refinement
- Validation phase produces meaningful checks

---

### Phase 3: Production Hardening (Week 5-6)

**Goal**: Production-ready system

**Deliverables**:

1. SHACL validation integration
2. Multi-provider LLM support
3. Comprehensive error handling
4. Observability (tracing, metrics)
5. Human-in-the-loop checkpoints
6. Performance optimization

**Success Criteria**:

- Handle rate limits gracefully
- Resume from workflow failures
- Clear error messages for debugging
- Can swap LLM providers
- Validation catches semantic errors

---

## 6. Testing Strategy

### Unit Tests

```typescript
import { Effect, Layer, TestContext } from "effect"
import { describe, it, expect } from "vitest"

describe("N3Service", () => {
  it("should parse valid Turtle", () =>
    Effect.gen(function* () {
      const turtle = `
@prefix : <http://example.org/> .
:Alice a :Person .
      `

      const quads = yield* N3Service.parse(turtle).pipe(Stream.runCollect)

      expect(quads).toHaveLength(1)
      expect(quads[0].subject.value).toBe("http://example.org/Alice")
    }).pipe(Effect.provide(N3ServiceLive), Effect.runPromise))

  it("should fail on invalid Turtle", () =>
    Effect.gen(function* () {
      const invalid = "this is not turtle"

      const result = yield* N3Service.parse(invalid).pipe(
        Stream.runCollect,
        Effect.either
      )

      expect(Either.isLeft(result)).toBe(true)
      expect(result.left._tag).toBe("N3ParseError")
    }).pipe(Effect.provide(N3ServiceLive), Effect.runPromise))
})
```

### Mocking LLM Responses

```typescript
const MockLLMService = Layer.succeed(
  LLMService,
  LLMService.of({
    generateStream: ({ messages }) =>
      Stream.make(`
@prefix : <http://example.org/> .
:TestClass a owl:Class ;
  rdfs:label "Test Class" .
      `),

    generate: ({ messages }) => Effect.succeed("Mocked LLM response")
  })
)

describe("Ontogenia Workflow", () => {
  it("should process CQ with mocked LLM", () =>
    Effect.gen(function* () {
      const cq = {
        id: "cq1",
        question: "What classes are needed?",
        userStory: "Test story"
      }

      const result = yield* processCompetencyQuestionActivity({
        cq,
        currentOntology: "",
        odpLibrary: []
      })

      expect(result.extensionQuads.length).toBeGreaterThan(0)
    }).pipe(
      Effect.provide(MockLLMService),
      Effect.provide(N3ServiceLive),
      Effect.runPromise
    ))
})
```

---

## 7. Observability and Debugging

### Effect Tracing

```typescript
import { Tracer } from "@effect/opentelemetry"

// Add tracing to activities
const interpretationActivity = (cq, ontology, odps) =>
  Effect.gen(function* () {
    // ... implementation
  }).pipe(
    Effect.withSpan("interpretation-activity", {
      attributes: {
        "cq.id": cq.id,
        "cq.question": cq.question,
        "ontology.size": ontology.length
      }
    })
  )

// Configure tracing layer
const TracingLive = Layer.merge(
  Tracer.layer,
  OpenTelemetry.layer({
    serviceName: "ontogenia-workflow",
    endpoint: "http://localhost:4318"
  })
)
```

### Logging Strategy

```typescript
// Structured logging
const extensionActivity = (cq, ontology, interpretation, odps) =>
  Effect.gen(function* () {
    yield* Effect.log("Starting extension phase", {
      cqId: cq.id,
      interpretationClasses: interpretation.classes.length,
      odpCount: odps.length
    })

    const result = yield* generateExtension(...)

    yield* Effect.log("Extension complete", {
      cqId: cq.id,
      generatedQuads: result.length,
      parseAttempts: 1
    })

    return result
  })

// Log Level configuration
const LoggerLive = Logger.minimumLogLevel(LogLevel.Debug)
```

### Debugging Workflow State

```typescript
class FileWriteError extends Schema.TaggedError<FileWriteError>()("FileWriteError", {
  path: Schema.String,
  cause: Schema.Unknown
}) {}

// Add debug checkpoints in workflow
const OntogeniaWorkflow = Workflow.make("OntogeniaWorkflow", {
  execute: ({ competencyQuestions, ... }) =>
    Effect.gen(function* () {
      let state = initializeState()

      for (const cq of competencyQuestions) {
        // Debug: Log current state
        yield* Effect.log("Workflow state before CQ", {
          currentCQIndex: state.currentCQIndex,
          ontologySize: state.ontologyTurtle.length,
          processedCount: state.processedCQs.length
        })

        const result = yield* processActivity(...)
        state = updateState(state, result)

        // Debug: Snapshot state to file
        if (process.env.DEBUG_WORKFLOW) {
          yield* Effect.tryPromise({
            try: () =>
              fs.writeFile(
                `./debug/state-${state.currentCQIndex}.json`,
                JSON.stringify(state, null, 2)
              ),
            catch: (error) => new FileWriteError({
              path: `./debug/state-${state.currentCQIndex}.json`,
              cause: error
            })
          })
        }
      }

      return finalResult
    })
})
```

---

## 8. Key Insights & Recommendations

### From Research

1. **Temperature 0 is Critical** (research:39): LLMs must use deterministic mode for consistent class/property naming
2. **ODPs Improve Quality** (research:53): Providing design patterns as templates significantly improves modeling
3. **o1-preview Performs Best** (research:5): For production, OpenAI's o1-preview with Ontogenia produces professional-quality results
4. **Refinement Loops Essential** (research:33-34): First outputs often have parse errors; automated refinement is necessary
5. **Context Maintenance Matters** (research:52-53): Ontogenia's stateful approach outperforms memoryless alternatives

### Effect-Specific Recommendations

1. **Use Workflow for Durability**: Don't try to build state management yourself; Workflow handles it
2. **Stream Everything**: LLM tokens, N3 quads, validation results - keep it streaming for memory efficiency
3. **Services for Testability**: Each service (Prompt, LLM, N3, SHACL, ODP) should be independently testable with mock layers
4. **Tagged Errors**: Use Schema.TaggedError for all error types to enable precise catchTag handling
5. **Retry Schedules**: Different errors need different strategies (exponential for rate limits, fixed count for parse errors)

### Production Considerations

1. **Cost Management**: Track LLM token usage per CQ; consider cheaper models for validation phase
2. **Human Checkpoints**: Add workflow signals to pause for human review after N questions
3. **Incremental Saves**: Persist ontology after each CQ in case workflow needs to restart
4. **Rate Limit Handling**: Implement exponential backoff with jitter for LLM APIs
5. **Validation Levels**: Start with N3 parse validation, add SHACL incrementally as shapes are defined

---

## Conclusion

This guide provides a comprehensive roadmap for implementing Ontogenia using Effect's powerful primitives. The key insight is that Effect Workflow's durability, combined with Effect AI's streaming capabilities and Effect Schema's type safety, creates an ideal environment for complex LLM-driven ontology generation.

The phased implementation approach ensures we build a solid foundation before tackling advanced features, while the service-oriented architecture keeps the system maintainable and testable.

**Next Steps**:

1. Set up project structure with Effect dependencies
2. Implement Phase 1 (Foundation) following this guide
3. Create test cases based on research examples
4. Iterate based on real-world results
