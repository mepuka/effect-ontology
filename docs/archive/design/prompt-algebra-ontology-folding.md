/Users/pooks/Dev/effect-ontology/docs/prompt-algebra-ontology-folding.md# Prompt Algebra: Folding Ontologies into Effective Prompts

> **Core Insight**: A prompt is a catamorphism (fold) over the ontology structure. By defining the algebra of prompt fragments and the fold operation, we can compositionally generate evidence-based prompts that work.

---

## Table of Contents

1. [The Fold: Consuming Ontology Structure](#the-fold-consuming-ontology-structure)
2. [Prompt Fragments as a Monoid](#prompt-fragments-as-a-monoid)
3. [Evidence-Based Prompt Patterns](#evidence-based-prompt-patterns)
4. [The Ontology Folder](#the-ontology-folder)
5. [Few-Shot Generation](#few-shot-generation)
6. [Composition Operators](#composition-operators)
7. [Complete Implementation](#complete-implementation)

---

## The Fold: Consuming Ontology Structure

### What is a Fold?

A **fold** (catamorphism) is the fundamental way to consume a recursive data structure. Given a structure and an algebra that says how to combine its pieces, a fold produces a result.

```typescript
// Generic fold signature
type Fold<Structure, Result> = {
  algebra: Algebra<Result>
  structure: Structure
} => Result

// For lists (the classic example):
const foldList = <A, B>(
  list: Array<A>,
  algebra: {
    nil: B,
    cons: (head: A, tail: B) => B
  }
): B => {
  if (list.length === 0) return algebra.nil
  const [head, ...tail] = list
  return algebra.cons(head, foldList(tail, algebra))
}

// Example: sum = fold with (+) algebra
const sum = foldList([1, 2, 3], {
  nil: 0,
  cons: (x, acc) => x + acc
}) // 6
```

### Ontology as a Foldable Structure

An ontology is a **graph**, but we can treat it as a foldable structure by defining how to traverse it:

```typescript
import { Schema } from "@effect/schema"

/**
 * Ontology structure (from previous doc)
 */
interface OntologyStructure {
  readonly classes: Record<string, OntologyClass>
  readonly properties: Record<string, PropertySignature>
  readonly individuals: Record<string, Individual>
}

/**
 * The algebra for folding an ontology
 *
 * Defines how to process each piece and combine results
 */
interface OntologyAlgebra<R> {
  // How to process a single class
  readonly foldClass: (cls: OntologyClass) => R

  // How to process a single property
  readonly foldProperty: (prop: PropertySignature) => R

  // How to process a single individual
  readonly foldIndividual: (ind: Individual) => R

  // How to combine all results
  readonly combine: (results: ReadonlyArray<R>) => R

  // The identity element (for empty ontology)
  readonly empty: R
}

/**
 * The fold operation itself
 */
const foldOntology = <R>(
  ontology: OntologyStructure,
  algebra: OntologyAlgebra<R>
): R => {
  const classResults = Object.values(ontology.classes).map(algebra.foldClass)
  const propResults = Object.values(ontology.properties).map(algebra.foldProperty)
  const indResults = Object.values(ontology.individuals).map(algebra.foldIndividual)

  return algebra.combine([...classResults, ...propResults, ...indResults])
}
```

### Prompts are the Target of the Fold

```typescript
/**
 * Prompt - the result type of our fold
 *
 * A prompt has structure: system message + user message + examples
 */
interface Prompt {
  readonly system: string
  readonly user: string
  readonly examples: ReadonlyArray<{ input: string; output: string }>
}
```

---

## Prompt Fragments as a Monoid

For prompts to compose nicely, they need to form a **monoid**.

### The Monoid Structure

```typescript
import { Monoid } from "effect"

/**
 * PromptFragment - An atomic piece of a prompt
 *
 * Fragments combine via concatenation
 */
interface PromptFragment {
  readonly content: string
  readonly section: "system" | "user" | "example"
}

/**
 * PromptFragment forms a monoid under concatenation
 *
 * Laws:
 * - Identity: empty ⊕ p = p = p ⊕ empty
 * - Associativity: (p1 ⊕ p2) ⊕ p3 = p1 ⊕ (p2 ⊕ p3)
 */
const PromptFragmentMonoid: Monoid.Monoid<PromptFragment> = {
  combine: (left, right) => ({
    content: left.content + "\n\n" + right.content,
    section: left.section // Keep first section type
  }),

  empty: {
    content: "",
    section: "system"
  },

  combineMany: (fragments) => {
    if (fragments.length === 0) return PromptFragmentMonoid.empty

    return fragments.reduce(
      (acc, frag) => PromptFragmentMonoid.combine(acc, frag),
      PromptFragmentMonoid.empty
    )
  }
}

/**
 * Prompt as a collection of fragments
 *
 * This forms a monoid by combining fragments by section
 */
interface StructuredPrompt {
  readonly systemFragments: ReadonlyArray<PromptFragment>
  readonly userFragments: ReadonlyArray<PromptFragment>
  readonly exampleFragments: ReadonlyArray<PromptFragment>
}

const StructuredPromptMonoid: Monoid.Monoid<StructuredPrompt> = {
  combine: (left, right) => ({
    systemFragments: [...left.systemFragments, ...right.systemFragments],
    userFragments: [...left.userFragments, ...right.userFragments],
    exampleFragments: [...left.exampleFragments, ...right.exampleFragments]
  }),

  empty: {
    systemFragments: [],
    userFragments: [],
    exampleFragments: []
  },

  combineMany: (prompts) => prompts.reduce(
    (acc, p) => StructuredPromptMonoid.combine(acc, p),
    StructuredPromptMonoid.empty
  )
}
```

### Why Monoids Matter

Monoids give us **composability for free**:

```typescript
// Build prompts incrementally
const basePrompt: StructuredPrompt = { /* ... */ }
const schemaContext: StructuredPrompt = { /* ... */ }
const examples: StructuredPrompt = { /* ... */ }
const constraints: StructuredPrompt = { /* ... */ }

// Compose via monoid operation
const fullPrompt = StructuredPromptMonoid.combineMany([
  basePrompt,
  schemaContext,
  examples,
  constraints
])
```

---

## Evidence-Based Prompt Patterns

From the research document, we know what works:

### Pattern 1: Schema Context (Research: lines 11-13)

> "System prompt: 'Extract RDF triples in Turtle format, using the following ontology schema: Patient (properties: hasName, hasAge), Doctor (properties: hasName)'"

**Implementation:**

```typescript
/**
 * Generate schema context by folding over classes and properties
 */
const schemaContextAlgebra: OntologyAlgebra<PromptFragment> = {
  foldClass: (cls) => ({
    content: `Class: ${cls.iri}${cls.label ? ` (${cls.label})` : ""}`,
    section: "system"
  }),

  foldProperty: (prop) => {
    const domainStr = prop.domain.length > 0
      ? ` (domain: ${prop.domain.join(", ")})`
      : ""
    const rangeStr = prop.range.length > 0
      ? ` (range: ${prop.range.join(", ")})`
      : ""

    return {
      content: `Property: ${prop.iri}${domainStr}${rangeStr}`,
      section: "system"
    }
  },

  foldIndividual: (ind) => PromptFragmentMonoid.empty,

  combine: (fragments) => PromptFragmentMonoid.combineMany(fragments),

  empty: PromptFragmentMonoid.empty
}

/**
 * Apply the fold to generate schema context
 */
const generateSchemaContext = (ontology: OntologyStructure): PromptFragment =>
  foldOntology(ontology, schemaContextAlgebra)

// Usage:
const context = generateSchemaContext(myOntology)
/*
Output:
"Class: :Patient (Patient)
Class: :Doctor (Doctor)
Property: :hasName (domain: :Patient, :Doctor) (range: xsd:string)
Property: :treatedBy (domain: :Patient) (range: :Doctor)"
*/
```

### Pattern 2: Format Specifications (Research: lines 37-39)

> "Prompts also warn against certain pitfalls – for example, one ontology-engineering prompt explicitly told the model not to produce an empty answer or a conversational reply"

**Implementation:**

```typescript
/**
 * Format constraints - these don't depend on ontology structure
 *
 * But they can reference ontology properties (e.g., "only use these classes")
 */
const formatConstraintsFragment = (ontology: OntologyStructure): PromptFragment => {
  const allowedClasses = Object.keys(ontology.classes).join(", ")
  const allowedProps = Object.keys(ontology.properties).join(", ")

  return {
    content: `CRITICAL REQUIREMENTS:
- Output ONLY valid Turtle syntax
- Do NOT output conversational text or explanations
- Do NOT output empty response
- Use ONLY these classes: ${allowedClasses}
- Use ONLY these properties: ${allowedProps}
- Follow this format:
  @prefix : <http://example.org/ontology#> .
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

  :Individual a :Class ;
    :property "value"^^xsd:datatype .`,
    section: "system"
  }
}
```

### Pattern 3: Example Templates (Research: lines 38)

> "researchers provided module-specific templates such as 'For relation hasAgeValue(Agent, xsd:double), an example triple is hasAgeValue(Absalom Jones, 71).'"

**Implementation:**

```typescript
/**
 * Generate example templates for each property
 *
 * This is a fold that produces examples
 */
const exampleTemplateAlgebra: OntologyAlgebra<PromptFragment> = {
  foldClass: (cls) => PromptFragmentMonoid.empty,

  foldProperty: (prop) => {
    // Generate a concrete example for this property
    const exampleSubject = prop.domain[0]
      ? `:Example${prop.domain[0].split(":").pop()}`
      : `:ExampleSubject`

    const exampleObject = prop.propertyType === "DatatypeProperty"
      ? prop.range[0] === "xsd:integer"
        ? "42"
        : prop.range[0] === "xsd:string"
        ? '"Example Value"'
        : '"example"'
      : `:Example${prop.range[0]?.split(":").pop() || "Object"}`

    return {
      content: `Example: ${exampleSubject} :${prop.iri.split(":").pop()} ${exampleObject} .`,
      section: "example"
    }
  },

  foldIndividual: (ind) => PromptFragmentMonoid.empty,

  combine: (fragments) => PromptFragmentMonoid.combineMany(fragments),

  empty: PromptFragmentMonoid.empty
}

const generateExamples = (ontology: OntologyStructure): PromptFragment =>
  foldOntology(ontology, exampleTemplateAlgebra)
```

### Pattern 4: Few-Shot Examples (Research: line 31)

> "To improve accuracy, few-shot prompting can be used by providing one or two examples of text-to-triple extraction"

**Implementation:**

```typescript
/**
 * FewShotExample - A complete input/output pair
 */
interface FewShotExample {
  readonly text: string
  readonly expectedTriples: string
}

/**
 * Generate few-shot examples from ontology
 *
 * Strategy: For each major class, create a synthetic example
 */
const generateFewShotExamples = (
  ontology: OntologyStructure,
  count: number = 2
): ReadonlyArray<FewShotExample> => {
  const classes = Object.values(ontology.classes).slice(0, count)

  return classes.map(cls => {
    // Find properties with this class as domain
    const relevantProps = Object.values(ontology.properties).filter(p =>
      p.domain.includes(cls.iri)
    )

    // Generate synthetic text
    const text = generateSyntheticText(cls, relevantProps)

    // Generate expected triples
    const triples = relevantProps
      .map(prop => {
        const obj = prop.propertyType === "DatatypeProperty"
          ? `"Example Value"^^${prop.range[0]}`
          : `:ExampleObject`
        return `:Example${cls.iri.split(":").pop()} :${prop.iri.split(":").pop()} ${obj} .`
      })
      .join("\n")

    return { text, expectedTriples: triples }
  })
}

/**
 * Helper: Generate synthetic text describing an instance
 */
const generateSyntheticText = (
  cls: OntologyClass,
  props: ReadonlyArray<PropertySignature>
): string => {
  const className = cls.label || cls.iri.split(":").pop()
  const propDescriptions = props
    .map(p => {
      const propName = p.label || p.iri.split(":").pop()
      return `has ${propName}`
    })
    .join(", ")

  return `A ${className} that ${propDescriptions}.`
}
```

---

## The Ontology Folder

Now let's combine everything into a complete folder:

```typescript
import { Effect, pipe } from "effect"

/**
 * PromptBuilder - The complete algebra for building prompts
 *
 * This is effectful because it might need to:
 * - Load ontology design patterns
 * - Fetch example data
 * - Query reasoning engines
 */
interface PromptBuilder {
  /**
   * Generate a complete extraction prompt from an ontology
   */
  readonly buildExtractionPrompt: (
    ontology: OntologyStructure,
    options: PromptOptions
  ) => Effect.Effect<Prompt, PromptError, PromptBuilderService>
}

interface PromptOptions {
  readonly includeFewShot: boolean
  readonly fewShotCount: number
  readonly includeExamples: boolean
  readonly includeConstraints: boolean
  readonly verbosity: "minimal" | "standard" | "verbose"
}

/**
 * The complete prompt generation fold
 */
const buildExtractionPromptAlgebra = (
  options: PromptOptions
): OntologyAlgebra<Effect.Effect<StructuredPrompt, PromptError, PromptBuilderService>> => ({
  foldClass: (cls) =>
    Effect.succeed({
      systemFragments: [{
        content: formatClassDescription(cls, options.verbosity),
        section: "system" as const
      }],
      userFragments: [],
      exampleFragments: []
    }),

  foldProperty: (prop) =>
    Effect.succeed({
      systemFragments: [{
        content: formatPropertyDescription(prop, options.verbosity),
        section: "system" as const
      }],
      userFragments: [],
      exampleFragments: options.includeExamples
        ? [generatePropertyExample(prop)]
        : []
    }),

  foldIndividual: (ind) => Effect.succeed(StructuredPromptMonoid.empty),

  combine: (effects) =>
    Effect.all(effects, { concurrency: 10 }).pipe(
      Effect.map(prompts => StructuredPromptMonoid.combineMany(prompts))
    ),

  empty: Effect.succeed(StructuredPromptMonoid.empty)
})

/**
 * Main prompt building function
 */
const buildExtractionPrompt = (
  ontology: OntologyStructure,
  options: PromptOptions
): Effect.Effect<Prompt, PromptError, PromptBuilderService> =>
  Effect.gen(function* () {
    // Fold ontology to get structured prompt
    const structuredPrompt = yield* foldOntology(
      ontology,
      buildExtractionPromptAlgebra(options)
    )

    // Add format constraints
    const constraints = options.includeConstraints
      ? formatConstraintsFragment(ontology)
      : PromptFragmentMonoid.empty

    // Add few-shot examples if requested
    const fewShotExamples = options.includeFewShot
      ? generateFewShotExamples(ontology, options.fewShotCount)
      : []

    // Combine into final prompt
    const systemMessage = [
      "You are an RDF triple extraction expert.",
      "",
      "Ontology Schema:",
      ...structuredPrompt.systemFragments.map(f => f.content),
      "",
      constraints.content
    ].join("\n")

    const examplesFormatted = fewShotExamples.map(ex => ({
      input: ex.text,
      output: ex.expectedTriples
    }))

    return {
      system: systemMessage,
      user: "", // Will be filled with actual text to extract from
      examples: examplesFormatted
    }
  })
```

### Helper Functions

```typescript
/**
 * Format class description based on verbosity
 */
const formatClassDescription = (
  cls: OntologyClass,
  verbosity: "minimal" | "standard" | "verbose"
): string => {
  const name = cls.label || cls.iri.split(":").pop()

  switch (verbosity) {
    case "minimal":
      return `Class: ${name}`

    case "standard":
      return `Class: ${name}${cls.comment ? ` - ${cls.comment}` : ""}`

    case "verbose":
      const subclasses = cls.subClassOf.length > 0
        ? `\n  Subclass of: ${cls.subClassOf.join(", ")}`
        : ""
      const disjoint = cls.disjointWith.length > 0
        ? `\n  Disjoint with: ${cls.disjointWith.join(", ")}`
        : ""
      return `Class: ${name}${cls.comment ? ` - ${cls.comment}` : ""}${subclasses}${disjoint}`
  }
}

/**
 * Format property description
 */
const formatPropertyDescription = (
  prop: PropertySignature,
  verbosity: "minimal" | "standard" | "verbose"
): string => {
  const name = prop.label || prop.iri.split(":").pop()
  const type = prop.propertyType === "ObjectProperty" ? "relates" : "has value"

  switch (verbosity) {
    case "minimal":
      return `Property: ${name} (${prop.domain[0]} → ${prop.range[0]})`

    case "standard":
      return `Property: ${name}\n  Domain: ${prop.domain.join(" | ")}\n  Range: ${prop.range.join(" | ")}`

    case "verbose":
      const characteristics = []
      if (prop.functional) characteristics.push("functional")
      if (prop.transitive) characteristics.push("transitive")
      if (prop.symmetric) characteristics.push("symmetric")

      const charStr = characteristics.length > 0
        ? `\n  Characteristics: ${characteristics.join(", ")}`
        : ""

      return `Property: ${name}\n  Type: ${prop.propertyType}\n  Domain: ${prop.domain.join(" | ")}\n  Range: ${prop.range.join(" | ")}${charStr}`
  }
}

/**
 * Generate example for a property
 */
const generatePropertyExample = (prop: PropertySignature): PromptFragment => ({
  content: `Example: :Subject :${prop.iri.split(":").pop()} :Object .`,
  section: "example"
})
```

---

## Composition Operators

Now we can define higher-order functions for composing prompt builders:

### Prompt Transformers

```typescript
/**
 * PromptTransformer - A function that modifies a prompt
 *
 * These form a monoid under composition
 */
type PromptTransformer = (prompt: Prompt) => Prompt

/**
 * Add a prefix to the system message
 */
const addSystemPrefix = (prefix: string): PromptTransformer =>
  (prompt) => ({
    ...prompt,
    system: `${prefix}\n\n${prompt.system}`
  })

/**
 * Add temperature/sampling instructions
 */
const addTemperatureGuidance: PromptTransformer =
  (prompt) => ({
    ...prompt,
    system: `${prompt.system}\n\nIMPORTANT: Use temperature=0 for deterministic output.`
  })

/**
 * Add output format validation reminder
 */
const addValidationReminder: PromptTransformer =
  (prompt) => ({
    ...prompt,
    system: `${prompt.system}\n\nREMINDER: Your output will be validated. Invalid Turtle syntax will be rejected.`
  })

/**
 * Compose transformers (function composition)
 */
const composeTransformers = (
  ...transformers: ReadonlyArray<PromptTransformer>
): PromptTransformer =>
  (prompt) => transformers.reduce((p, t) => t(p), prompt)

// Usage:
const enhancedPromptBuilder = pipe(
  basePrompt,
  addSystemPrefix("You are an expert ontologist."),
  addTemperatureGuidance,
  addValidationReminder
)
```

### Conditional Composition

```typescript
/**
 * Conditionally apply a transformer
 */
const when = (
  condition: boolean,
  transformer: PromptTransformer
): PromptTransformer =>
  condition ? transformer : (p => p)

// Usage:
const buildPrompt = (options: PromptOptions) =>
  pipe(
    generateBasePrompt(ontology),
    when(options.includeConstraints, addValidationReminder),
    when(options.verbosity === "verbose", addDetailedGuidance),
    when(options.includeFewShot, addFewShotExamples(ontology))
  )
```

---

## Complete Implementation

Putting it all together:

```typescript
import { Effect, Context, Layer } from "effect"

/**
 * PromptBuilderService - The service interface
 */
interface PromptBuilderService {
  readonly buildExtractionPrompt: (
    ontology: OntologyStructure,
    options: PromptOptions
  ) => Effect.Effect<Prompt, PromptError>

  readonly buildValidationPrompt: (
    ontology: OntologyStructure,
    triples: string
  ) => Effect.Effect<Prompt, PromptError>
}

const PromptBuilderService = Context.GenericTag<PromptBuilderService>(
  "PromptBuilderService"
)

/**
 * Live implementation
 */
const PromptBuilderServiceLive = Layer.succeed(
  PromptBuilderService,
  PromptBuilderService.of({
    buildExtractionPrompt: (ontology, options) =>
      Effect.gen(function* () {
        // Fold ontology to get structured prompt
        const algebra = buildExtractionPromptAlgebra(options)
        const structuredPrompt = yield* foldOntology(ontology, algebra)

        // Add constraints
        const constraints = options.includeConstraints
          ? formatConstraintsFragment(ontology)
          : PromptFragmentMonoid.empty

        // Generate few-shot examples
        const fewShot = options.includeFewShot
          ? generateFewShotExamples(ontology, options.fewShotCount)
          : []

        // Compose final prompt
        const basePrompt: Prompt = {
          system: composeSystemMessage(structuredPrompt, constraints),
          user: "<TEXT_TO_EXTRACT_FROM>",
          examples: fewShot
        }

        // Apply transformers
        const finalPrompt = pipe(
          basePrompt,
          when(options.verbosity === "verbose", addDetailedGuidance),
          addTemperatureGuidance,
          addValidationReminder
        )

        return finalPrompt
      }),

    buildValidationPrompt: (ontology, triples) =>
      Effect.succeed({
        system: `You are an RDF validation expert.

Ontology Schema:
${generateSchemaContext(ontology).content}

Task: Validate that the provided triples conform to the ontology.
Check:
1. All predicates exist in the ontology
2. Domain constraints are satisfied
3. Range constraints are satisfied
4. Syntax is valid Turtle

Output: "VALID" or list of errors.`,
        user: `Triples to validate:\n${triples}`,
        examples: []
      })
  })
)

class PromptError extends Schema.TaggedError<PromptError>()("PromptError", {
  message: Schema.String
}) {}

/**
 * Helper: Compose system message from fragments
 */
const composeSystemMessage = (
  structured: StructuredPrompt,
  constraints: PromptFragment
): string => {
  return [
    "You are an RDF triple extraction expert.",
    "",
    "Ontology Schema:",
    ...structured.systemFragments.map(f => f.content),
    "",
    constraints.content
  ].join("\n")
}
```

---

## Usage Example

```typescript
// Define ontology
const healthcareOntology: OntologyStructure = {
  classes: {
    ":Patient": {
      iri: ":Patient",
      label: "Patient",
      comment: "A person receiving medical care",
      subClassOf: [":Person"],
      disjointWith: [":Doctor"],
      equivalentClass: []
    },
    ":Doctor": {
      iri: ":Doctor",
      label: "Doctor",
      comment: "A medical practitioner",
      subClassOf: [":Person"],
      disjointWith: [":Patient"],
      equivalentClass: []
    }
  },
  properties: {
    ":hasName": {
      iri: ":hasName",
      label: "has name",
      propertyType: "DatatypeProperty",
      domain: [":Person"],
      range: ["xsd:string"],
      subPropertyOf: [],
      functional: true,
      inverseFunctional: false,
      transitive: false,
      symmetric: false
    },
    ":treatedBy": {
      iri: ":treatedBy",
      label: "treated by",
      propertyType: "ObjectProperty",
      domain: [":Patient"],
      range: [":Doctor"],
      subPropertyOf: [],
      inverseOf: ":treats",
      functional: false,
      inverseFunctional: false,
      transitive: false,
      symmetric: false
    }
  },
  individuals: {}
}

// Build prompt
const program = Effect.gen(function* () {
  const builder = yield* PromptBuilderService

  const prompt = yield* builder.buildExtractionPrompt(
    healthcareOntology,
    {
      includeFewShot: true,
      fewShotCount: 2,
      includeExamples: true,
      includeConstraints: true,
      verbosity: "standard"
    }
  )

  console.log("=== SYSTEM PROMPT ===")
  console.log(prompt.system)
  console.log("\n=== EXAMPLES ===")
  prompt.examples.forEach((ex, i) => {
    console.log(`Example ${i + 1}:`)
    console.log(`Input: ${ex.input}`)
    console.log(`Output: ${ex.output}`)
  })

  return prompt
})

// Run
Effect.runPromise(
  program.pipe(Effect.provide(PromptBuilderServiceLive))
)
```

---

## Summary: Why This Works

1. **Folds are the Right Abstraction**: Ontologies are recursive structures; folds consume them systematically
2. **Monoids Enable Composition**: Prompt fragments combine naturally via concatenation
3. **Evidence-Based Patterns**: Each pattern (schema context, examples, constraints) comes from research
4. **Effect Provides Safety**: All ontology traversal is tracked and manageable
5. **Composability**: Build complex prompts from simple pieces using function composition

The key insight: **A prompt is not hand-written text, it's the result of folding an ontology structure with an algebra that knows how to generate effective prompts.**

This makes prompts:
- **Composable** - build complex from simple
- **Correct** - follow evidence-based patterns
- **Maintainable** - change the algebra, not individual prompts
- **Testable** - test the algebra, not individual prompt strings
