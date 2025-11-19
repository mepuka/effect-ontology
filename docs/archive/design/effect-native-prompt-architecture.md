# Effect-Native Prompt Architecture: Using Effect's Type Classes, Schema AST, and Graph Primitives

> **Perspective**: Leverage Effect's built-in abstractions - Monoid from `@effect/typeclass`, Schema AST traversal, and graph structures - rather than reimplementing them.

---

## Table of Contents

1. [Using Effect's Monoid Properly](#using-effects-monoid-properly)
2. [Ontology as Schema AST](#ontology-as-schema-ast)
3. [Graph Structure for Ontology](#graph-structure-for-ontology)
4. [Schema as APG (Applicative Parser Generator)](#schema-as-apg)
5. [Complete Integration](#complete-integration)

---

## Using Effect's Monoid Properly

Effect provides `@effect/typeclass` with proper Monoid/Semigroup implementations.

### Import Effect's Monoid

```typescript
import { Monoid, Semigroup } from "@effect/typeclass"
import { String } from "effect"
```

### PromptFragment as Monoid

```typescript
/**
 * PromptFragment - atomic unit of a prompt
 */
interface PromptFragment {
  readonly content: string
  readonly section: "system" | "user" | "example"
}

/**
 * Use Effect's String.Monoid under the hood
 *
 * Effect provides String.Monoid with proper concatenation
 */
const PromptFragmentSemigroup: Semigroup.Semigroup<PromptFragment> =
  Semigroup.make((left, right) => ({
    content: String.Semigroup.combine(
      left.content,
      String.Semigroup.combine("\n\n", right.content)
    ),
    section: left.section
  }))

/**
 * Monoid adds identity element
 */
const PromptFragmentMonoid: Monoid.Monoid<PromptFragment> =
  Monoid.fromSemigroup(PromptFragmentSemigroup, {
    content: String.Monoid.empty,
    section: "system" as const
  })

/**
 * Now we can use combineMany from Effect
 */
import { Array } from "effect"

const combineFragments = (fragments: ReadonlyArray<PromptFragment>): PromptFragment =>
  Array.match(fragments, {
    onEmpty: () => PromptFragmentMonoid.empty,
    onNonEmpty: (head, tail) =>
      tail.reduce(
        (acc, frag) => PromptFragmentSemigroup.combine(acc, frag),
        head
      )
  })
```

### Structured Prompt Monoid Using Effect's struct

```typescript
/**
 * Effect provides Monoid.struct for combining records
 */
import { ReadonlyArray } from "effect"

interface StructuredPrompt {
  readonly systemFragments: ReadonlyArray<PromptFragment>
  readonly userFragments: ReadonlyArray<PromptFragment>
  readonly exampleFragments: ReadonlyArray<PromptFragment>
}

/**
 * Use Monoid.struct to derive monoid for records
 *
 * This automatically combines each field using its monoid
 */
const StructuredPromptMonoid: Monoid.Monoid<StructuredPrompt> = Monoid.struct({
  systemFragments: ReadonlyArray.getMonoid<PromptFragment>(),
  userFragments: ReadonlyArray.getMonoid<PromptFragment>(),
  exampleFragments: ReadonlyArray.getMonoid<PromptFragment>()
})

// Now combination is automatic:
const combined = StructuredPromptMonoid.combineAll([prompt1, prompt2, prompt3])
```

---

## Ontology as Schema AST

Effect Schema has a full AST (Abstract Syntax Tree) representation. Instead of defining custom ontology types, we should represent ontologies as Schema ASTs and traverse them.

### Understanding Schema AST

```typescript
import { Schema, SchemaAST } from "effect"

/**
 * Every Schema has an AST
 */
const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number
})

// Access the AST
const ast: SchemaAST.AST = PersonSchema.ast

/**
 * SchemaAST.AST is a discriminated union:
 * - Declaration
 * - Literal
 * - UniqueSymbol
 * - UndefinedKeyword
 * - VoidKeyword
 * - NeverKeyword
 * - UnknownKeyword
 * - AnyKeyword
 * - StringKeyword
 * - NumberKeyword
 * - BooleanKeyword
 * - BigIntKeyword
 * - SymbolKeyword
 * - ObjectKeyword
 * - TupleType
 * - TypeLiteral (Struct)
 * - Union
 * - Suspend (recursive)
 * - Refinement
 * - Transformation
 */
```

### Ontology Encoded as Schema

```typescript
/**
 * Represent the ontology itself as a Schema
 *
 * This gives us Schema validation + AST traversal for free
 */
const OntologyClassSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  subClassOf: Schema.Array(Schema.String),
  disjointWith: Schema.Array(Schema.String),
  equivalentClass: Schema.Array(Schema.String)
}).annotations({
  identifier: "OntologyClass",
  description: "An OWL Class definition"
})

const PropertySignatureSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.optional(Schema.String),
  propertyType: Schema.Literal("ObjectProperty", "DatatypeProperty", "AnnotationProperty"),
  domain: Schema.Array(Schema.String),
  range: Schema.Array(Schema.String),
  subPropertyOf: Schema.Array(Schema.String),
  inverseOf: Schema.optional(Schema.String),
  characteristics: Schema.Struct({
    functional: Schema.Boolean,
    inverseFunctional: Schema.Boolean,
    transitive: Schema.Boolean,
    symmetric: Schema.Boolean
  })
}).annotations({
  identifier: "PropertySignature",
  description: "An OWL Property definition"
})

/**
 * The complete ontology schema
 */
const OntologySchema = Schema.Struct({
  iri: Schema.String,
  prefixes: Schema.Record({ key: Schema.String, value: Schema.String }),
  classes: Schema.Record({
    key: Schema.String,
    value: OntologyClassSchema
  }),
  properties: Schema.Record({
    key: Schema.String,
    value: PropertySignatureSchema
  })
}).annotations({
  identifier: "Ontology",
  description: "A complete OWL Ontology"
})

type Ontology = Schema.Schema.Type<typeof OntologySchema>
```

### Traversing Schema AST to Generate Prompts

```typescript
import { Match } from "effect"

/**
 * AST Visitor pattern for Schema traversal
 *
 * This visits every node in the Schema AST
 */
interface ASTVisitor<R> {
  readonly visitTypeLiteral: (ast: SchemaAST.TypeLiteral) => R
  readonly visitUnion: (ast: SchemaAST.Union) => R
  readonly visitRefinement: (ast: SchemaAST.Refinement) => R
  readonly visitTransformation: (ast: SchemaAST.Transformation) => R
  readonly visitSuspend: (ast: SchemaAST.Suspend) => R
  readonly visitLiteral: (ast: SchemaAST.Literal) => R
  readonly visitKeyword: (ast: SchemaAST.KeywordAST) => R
  readonly visitDeclaration: (ast: SchemaAST.Declaration) => R
}

/**
 * Generic AST traversal
 */
const traverseAST = <R>(
  ast: SchemaAST.AST,
  visitor: ASTVisitor<R>
): R =>
  Match.value(ast).pipe(
    Match.when({ _tag: "TypeLiteral" }, visitor.visitTypeLiteral),
    Match.when({ _tag: "Union" }, visitor.visitUnion),
    Match.when({ _tag: "Refinement" }, visitor.visitRefinement),
    Match.when({ _tag: "Transformation" }, visitor.visitTransformation),
    Match.when({ _tag: "Suspend" }, visitor.visitSuspend),
    Match.when({ _tag: "Literal" }, visitor.visitLiteral),
    Match.when({ _tag: "Declaration" }, visitor.visitDeclaration),
    Match.orElse(() => visitor.visitKeyword(ast as SchemaAST.KeywordAST))
  )

/**
 * Visitor that generates prompt fragments from ontology schema
 */
const PromptGeneratingVisitor: ASTVisitor<PromptFragment> = {
  visitTypeLiteral: (ast) => {
    // TypeLiteral represents a struct
    const fields = ast.propertySignatures.map(ps => {
      const name = String(ps.name)
      const type = getTypeDescription(ps.type)
      return `  ${name}: ${type}`
    }).join("\n")

    return {
      content: `Struct {\n${fields}\n}`,
      section: "system"
    }
  },

  visitUnion: (ast) => {
    const types = ast.types.map(t => traverseAST(t, PromptGeneratingVisitor))
    return PromptFragmentMonoid.combineAll(types)
  },

  visitRefinement: (ast) => {
    // Refinements add constraints
    const base = traverseAST(ast.from, PromptGeneratingVisitor)
    return {
      ...base,
      content: `${base.content} (with constraints)`
    }
  },

  visitTransformation: (ast) => {
    // Focus on the "to" side for prompts
    return traverseAST(ast.to, PromptGeneratingVisitor)
  },

  visitSuspend: (ast) => {
    // Lazy evaluation - follow the suspension
    return traverseAST(ast.f(), PromptGeneratingVisitor)
  },

  visitLiteral: (ast) => ({
    content: `Literal(${JSON.stringify(ast.literal)})`,
    section: "system"
  }),

  visitKeyword: (ast) => ({
    content: ast._tag.replace("Keyword", ""),
    section: "system"
  }),

  visitDeclaration: (ast) => ({
    content: `${ast.annotations.identifier || "CustomType"}`,
    section: "system"
  })
}

/**
 * Generate prompts by traversing ontology schema AST
 */
const generatePromptFromOntologyAST = (ontologySchema: typeof OntologySchema): PromptFragment =>
  traverseAST(ontologySchema.ast, PromptGeneratingVisitor)
```

---

## Graph Structure for Ontology

Ontologies are graphs. Let's use Effect primitives to represent them.

### Graph as Adjacency Map

```typescript
import { HashMap, HashSet, Data, Equal } from "effect"

/**
 * Node in ontology graph
 *
 * Using Data.struct for structural equality
 */
const OntologyNode = Data.struct({
  iri: String,
  type: String as "Class" | "Property" | "Individual",
  metadata: Record<string, unknown>
})

type OntologyNode = Data.Case<typeof OntologyNode>

/**
 * Edge in ontology graph
 */
const OntologyEdge = Data.struct({
  from: String,
  to: String,
  relation: String as "subClassOf" | "domain" | "range" | "subPropertyOf"
})

type OntologyEdge = Data.Case<typeof OntologyEdge>

/**
 * Graph as adjacency map
 *
 * Uses Effect's HashMap for O(1) lookup
 */
interface OntologyGraph {
  readonly nodes: HashMap.HashMap<string, OntologyNode>
  readonly edges: HashMap.HashMap<string, HashSet.HashSet<OntologyEdge>>
}

/**
 * Create empty graph
 */
const emptyGraph: OntologyGraph = {
  nodes: HashMap.empty(),
  edges: HashMap.empty()
}

/**
 * Add node to graph
 */
const addNode = (graph: OntologyGraph, node: OntologyNode): OntologyGraph => ({
  ...graph,
  nodes: HashMap.set(graph.nodes, node.iri, node)
})

/**
 * Add edge to graph
 */
const addEdge = (graph: OntologyGraph, edge: OntologyEdge): OntologyGraph => {
  const currentEdges = HashMap.get(graph.edges, edge.from).pipe(
    Option.getOrElse(() => HashSet.empty<OntologyEdge>())
  )

  return {
    ...graph,
    edges: HashMap.set(
      graph.edges,
      edge.from,
      HashSet.add(currentEdges, edge)
    )
  }
}

/**
 * Get outgoing edges from a node
 */
const getOutgoingEdges = (
  graph: OntologyGraph,
  nodeIri: string
): HashSet.HashSet<OntologyEdge> =>
  HashMap.get(graph.edges, nodeIri).pipe(
    Option.getOrElse(() => HashSet.empty<OntologyEdge>())
  )
```

### Topological Sort for Class Hierarchy

```typescript
import { Effect, Option, Ref, Chunk } from "effect"

/**
 * Topological sort using Effect
 *
 * Returns classes in dependency order (subclasses after superclasses)
 */
const topologicalSort = (
  graph: OntologyGraph
): Effect.Effect<ReadonlyArray<string>, GraphError> =>
  Effect.gen(function* () {
    // Track visited nodes and result
    const visited = yield* Ref.make(HashSet.empty<string>())
    const result = yield* Ref.make(Chunk.empty<string>())

    // DFS helper
    const visit = (nodeIri: string): Effect.Effect<void, GraphError> =>
      Effect.gen(function* () {
        const visitedSet = yield* Ref.get(visited)

        // Already visited?
        if (HashSet.has(visitedSet, nodeIri)) {
          return
        }

        // Mark as visited
        yield* Ref.update(visited, HashSet.add(nodeIri))

        // Visit dependencies first (outgoing edges)
        const edges = getOutgoingEdges(graph, nodeIri)
        yield* Effect.forEach(
          HashSet.toArray(edges),
          (edge) => visit(edge.to),
          { concurrency: 1 } // Sequential to maintain order
        )

        // Add to result
        yield* Ref.update(result, Chunk.append(nodeIri))
      })

    // Visit all nodes
    const allNodes = HashMap.keys(graph.nodes)
    yield* Effect.forEach(
      allNodes,
      (nodeIri) => visit(nodeIri),
      { concurrency: 1 }
    )

    // Return result
    const sorted = yield* Ref.get(result)
    return Chunk.toReadonlyArray(sorted)
  })

class GraphError extends Data.TaggedError("GraphError")<{
  message: string
}> {}
```

### Folding Over Graph Structure

```typescript
/**
 * Graph fold - traverse graph and accumulate result
 *
 * This is a catamorphism over the graph structure
 */
const foldGraph = <R>(
  graph: OntologyGraph,
  algebra: {
    readonly foldNode: (node: OntologyNode, edgeResults: ReadonlyArray<R>) => R
    readonly combine: (results: ReadonlyArray<R>) => R
  }
): Effect.Effect<R, GraphError> =>
  Effect.gen(function* () {
    // Get topological order
    const sortedIRIs = yield* topologicalSort(graph)

    // Process in order
    const results = yield* Effect.forEach(
      sortedIRIs,
      (iri) =>
        Effect.gen(function* () {
          const node = HashMap.get(graph.nodes, iri).pipe(
            Option.getOrThrow(() => new GraphError({ message: `Node not found: ${iri}` }))
          )

          // Get results from dependencies
          const edges = getOutgoingEdges(graph, iri)
          const depResults = yield* Effect.forEach(
            HashSet.toArray(edges),
            (edge) => {
              // Would need memoization here in real impl
              return Effect.succeed(algebra.foldNode(node, []))
            },
            { concurrency: 10 }
          )

          return algebra.foldNode(node, depResults)
        }),
      { concurrency: 10 }
    )

    return algebra.combine(results)
  })

/**
 * Generate prompts by folding graph
 */
const generatePromptsFromGraph = (
  graph: OntologyGraph
): Effect.Effect<PromptFragment, GraphError> =>
  foldGraph(graph, {
    foldNode: (node, edgeResults) => {
      const base: PromptFragment = {
        content: `${node.type}: ${node.iri}`,
        section: "system"
      }

      return PromptFragmentMonoid.combineAll([base, ...edgeResults])
    },

    combine: (results) => PromptFragmentMonoid.combineAll(results)
  })
```

---

## Schema as APG (Applicative Parser Generator)

Effect Schema is an **Applicative Parser Generator** - it's both:
- **Parser**: Decode from external format
- **Generator**: Encode to external format
- **Applicative**: Compose schemas using applicative functor

### Schema as Bidirectional Transformation

```typescript
/**
 * Schema<A, I, R> is a bidirectional transformation
 *
 * - Decode: I -> Effect<A, ParseError, R>
 * - Encode: A -> Effect<I, ParseError, R>
 *
 * This is an APG!
 */

/**
 * Example: Ontology class from/to Turtle
 */
const OntologyClassFromTurtle = Schema.transformOrFail(
  Schema.String, // Turtle text
  OntologyClassSchema, // Structured class
  {
    strict: true,
    // Parse: Turtle -> OntologyClass
    decode: (turtle) =>
      Effect.gen(function* () {
        const parsed = yield* parseTurtleClass(turtle)
        return ParseResult.succeed(parsed)
      }),
    // Generate: OntologyClass -> Turtle
    encode: (cls) =>
      Effect.gen(function* () {
        const turtle = serializeClassToTurtle(cls)
        return ParseResult.succeed(turtle)
      })
  }
)

/**
 * Now we can parse AND generate
 */
const parseOntologyClass = Schema.decodeUnknown(OntologyClassFromTurtle)
const generateTurtle = Schema.encode(OntologyClassFromTurtle)
```

### Composing Schemas with Applicative

```typescript
/**
 * Schema composition using applicative operations
 *
 * Schema provides map, flatMap, zip for composition
 */
const CombinedOntologySchema = Schema.Struct({
  classes: Schema.Array(OntologyClassSchema),
  properties: Schema.Array(PropertySignatureSchema)
}).pipe(
  // Add validation
  Schema.filter((ont) => {
    // All property domains/ranges must reference existing classes
    const classIRIs = new Set(ont.classes.map(c => c.iri))
    return ont.properties.every(p =>
      p.domain.every(d => classIRIs.has(d)) &&
      p.range.every(r => classIRIs.has(r) || r.startsWith("xsd:"))
    )
  }, {
    message: () => "Property domains/ranges must reference existing classes"
  }),
  // Transform to add computed fields
  Schema.transform(
    Schema.Struct({
      classes: Schema.Array(OntologyClassSchema),
      properties: Schema.Array(PropertySignatureSchema)
    }),
    {
      strict: true,
      decode: (ont) => ({
        ...ont,
        // Compute class hierarchy depth
        classHierarchy: computeHierarchy(ont.classes)
      }),
      encode: ({ classes, properties }) => ({ classes, properties })
    }
  )
)
```

---

## Complete Integration

Putting it all together with Effect's native primitives:

```typescript
import { Effect, Context, Layer, Monoid } from "effect"
import { Schema, SchemaAST } from "effect"

/**
 * PromptGeneratorService using Effect primitives
 */
interface PromptGeneratorService {
  readonly generateFromSchema: (
    ontologySchema: typeof OntologySchema
  ) => Effect.Effect<PromptFragment>

  readonly generateFromGraph: (
    graph: OntologyGraph
  ) => Effect.Effect<PromptFragment, GraphError>

  readonly compose: (
    fragments: ReadonlyArray<PromptFragment>
  ) => PromptFragment
}

const PromptGeneratorService = Context.GenericTag<PromptGeneratorService>(
  "PromptGeneratorService"
)

/**
 * Live implementation using Effect's Monoid, Schema AST, Graph
 */
const PromptGeneratorServiceLive = Layer.succeed(
  PromptGeneratorService,
  PromptGeneratorService.of({
    generateFromSchema: (ontologySchema) =>
      Effect.succeed(
        traverseAST(ontologySchema.ast, PromptGeneratingVisitor)
      ),

    generateFromGraph: (graph) =>
      generatePromptsFromGraph(graph),

    compose: (fragments) =>
      PromptFragmentMonoid.combineAll(fragments)
  })
)

/**
 * Usage: Generate prompts from ontology
 */
const generatePromptProgram = Effect.gen(function* () {
  const generator = yield* PromptGeneratorService

  // From schema
  const schemaPrompt = yield* generator.generateFromSchema(OntologySchema)

  // From graph
  const graph = buildGraphFromOntology(myOntology)
  const graphPrompt = yield* generator.generateFromGraph(graph)

  // Compose
  const finalPrompt = generator.compose([schemaPrompt, graphPrompt])

  return finalPrompt
})

// Run
const prompt = await Effect.runPromise(
  generatePromptProgram.pipe(
    Effect.provide(PromptGeneratorServiceLive)
  )
)
```

---

## Summary: Why Effect-Native?

1. **Monoid from @effect/typeclass**: Proper combinator laws, optimized implementations
2. **Schema AST**: Built-in traversal, annotations, transformations
3. **Graph as HashMap/HashSet**: O(1) operations, structural equality via Data
4. **Effect for coordination**: All operations are effects, composable, testable
5. **Type safety**: Everything tracked in the type system

Using Effect's primitives means:
- Less code to maintain
- Guaranteed correctness (laws are proven)
- Better performance (optimized implementations)
- Full Effect ecosystem integration

**The ontology IS a schema, the prompt IS a fold, the graph IS a HashMap.**

Effect provides all the primitives we need - we just compose them correctly.
