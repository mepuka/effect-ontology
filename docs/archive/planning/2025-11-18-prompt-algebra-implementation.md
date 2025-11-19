# Prompt Algebra Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement catamorphism-based prompt generation from Turtle ontologies using Effect's algebraic primitives

**Architecture:** Build F-Algebra representation of ontologies with true catamorphism fold, law-abiding monoids for prompt composition, and parser from Turtle to F-Algebra. Follow rigorous mathematical foundations from `docs/rigorous-prompt-algebra.md`.

**Tech Stack:** Effect (v3.x), @effect/typeclass, N3.js (Turtle parsing), Vitest (testing), fast-check (property-based testing)

---

## Reviewer Annotations (2025-11-18)

- This plan is written as a green-field TDD script. In the current `effect-ontology` repo, TypeScript, Vitest, and Effect are already configured (see existing `package.json`, `tsconfig.*`, `vitest.config.ts`), so **Task 1 should be treated as historical/bootstrap**, not something to run verbatim.
- For iterative improvement inside this repo, the minimal vertical slice we care about is:
  1. **Turtle → OntologyStructure**: parse Turtle into a concrete in-memory ontology model (classes, properties, individuals).
  2. **OntologyStructure → Extraction Prompt**: fold that structure into a `Prompt` (system + user + examples) using the monoid/fragment machinery from `docs/prompt-algebra-ontology-folding.md`.
  3. **OntologyStructure → Validation Prompt**: build a separate prompt that validates triples against the same ontology (as sketched in the Ontogenia / prompt-algebra docs).
  4. **End-to-end Test**: small Turtle file → `OntologyStructure` → extraction prompt + validation prompt, with assertions on the resulting prompt strings.
- The F-algebra `OntologyF` + true catamorphism + property-based law tests in Tasks 2–5 are **valuable but optional refinements**. For a first implementation in this repo:
  - You can start from the simpler `OntologyStructure` (product-of-maps) fold used in `docs/prompt-algebra-ontology-folding.md`.
  - Once the vertical slice is working, you can reintroduce `OntologyF`/`cata` as an internal representation that *proves* the fold is a catamorphism, rather than as the first public API.
- Suggested iteration strategy:
  - **Phase 0 (now)**: Implement the minimal pipeline above using `OntologyStructure`, N3, and the simpler fold + monoid definitions.
  - **Phase 1 (later)**: Add `OntologyF` and `cata`, and show that `OntologyStructure` ↔ `OntologyF` with `foldOntology` implemented via `cata`.
  - **Phase 2 (later)**: Add fast-check and algebraic law tests (monoid, fusion laws) as hardening, not as a prerequisite.

---

## Task 1: Project Setup and Dependencies

*Reviewer note (2025-11-18): in the `effect-ontology` workspace this setup already exists; treat this task as documentation for a standalone library, and **skip or adapt** it when working inside this repo (only add missing dependencies like `n3`, `fast-check`, or `@effect/typeclass` as needed, without recreating `package.json` / `tsconfig` / `vitest.config.ts`).*

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (empty entry point)

**Step 1: Initialize TypeScript project**

```bash
npm init -y
npm install --save effect @effect/typeclass n3
npm install --save-dev typescript vitest fast-check @types/node
```

**Step 2: Create tsconfig.json**

File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create vitest.config.ts**

File: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node"
  }
})
```

**Step 4: Add scripts to package.json**

Modify `package.json` to add:

```json
{
  "scripts": {
    "test": "vitest",
    "test:once": "vitest run",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "type": "module"
}
```

**Step 5: Create empty entry point**

File: `src/index.ts`

```typescript
// Prompt Algebra Implementation
export {}
```

**Step 6: Verify setup**

Run: `npm run typecheck`
Expected: No errors

Run: `npm run test:once`
Expected: "No test files found"

**Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "feat: initialize TypeScript project with Effect and testing"
```

---

## Task 2: F-Algebra Core Types

**Files:**
- Create: `src/ontology/types.ts`
- Create: `src/ontology/types.test.ts`

**Step 1: Write failing test for ClassData**

File: `src/ontology/types.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import { Data } from "effect"
import type { ClassData, PropertyData } from "./types"

describe("Ontology Types", () => {
  test("ClassData has structural equality", () => {
    const class1: ClassData = {
      iri: "http://example.org/Pet",
      label: "Pet",
      comment: "An animal",
      disjointWith: []
    }

    const class2: ClassData = {
      iri: "http://example.org/Pet",
      label: "Pet",
      comment: "An animal",
      disjointWith: []
    }

    expect(class1).toEqual(class2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- types.test.ts`
Expected: FAIL with "Cannot find module './types'"

**Step 3: Write minimal implementation**

File: `src/ontology/types.ts`

```typescript
import { Data } from "effect"

/**
 * ClassData - information about one OWL class
 */
export interface ClassData {
  readonly iri: string
  readonly label: string
  readonly comment?: string
  readonly disjointWith: ReadonlyArray<string>
}

/**
 * PropertyData - information about one OWL property
 */
export interface PropertyData {
  readonly iri: string
  readonly label: string
  readonly comment?: string
  readonly functional: boolean
  readonly inverseOf?: string
}

/**
 * Ontology Functor: F(X)
 *
 * Represents one level of ontology structure
 */
export type OntologyF<X> =
  | { readonly _tag: "Leaf"; readonly classData: ClassData }
  | { readonly _tag: "Node"; readonly classData: ClassData; readonly subclasses: ReadonlyArray<X> }
  | { readonly _tag: "Property"; readonly propertyData: PropertyData; readonly domain: string; readonly range: string }

/**
 * Ontology is the fixed point: Ontology = OntologyF<Ontology>
 */
export type Ontology = OntologyF<Ontology>

/**
 * Constructors for Ontology
 */
export const OntologyF = {
  Leaf: (classData: ClassData): Ontology => ({
    _tag: "Leaf" as const,
    classData
  }),

  Node: (classData: ClassData, subclasses: ReadonlyArray<Ontology>): Ontology => ({
    _tag: "Node" as const,
    classData,
    subclasses
  }),

  Property: (propertyData: PropertyData, domain: string, range: string): Ontology => ({
    _tag: "Property" as const,
    propertyData,
    domain,
    range
  })
}

/**
 * F-Algebra: describes how to fold ontology structure into result type R
 */
export interface OntologyAlgebra<R> {
  readonly foldLeaf: (data: ClassData) => R
  readonly foldNode: (data: ClassData, subResults: ReadonlyArray<R>) => R
  readonly foldProperty: (data: PropertyData, domain: string, range: string) => R
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ontology/types.ts src/ontology/types.test.ts
git commit -m "feat: add F-Algebra ontology types"
```

---

## Task 3: Catamorphism Implementation

**Files:**
- Create: `src/ontology/catamorphism.ts`
- Create: `src/ontology/catamorphism.test.ts`

**Step 1: Write failing test for cata**

File: `src/ontology/catamorphism.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import { OntologyF, type Ontology, type OntologyAlgebra } from "./types"
import { cata } from "./catamorphism"

describe("Catamorphism", () => {
  test("cata counts ontology elements", () => {
    // Build simple ontology: Pet with Dog subclass
    const dogLeaf = OntologyF.Leaf({
      iri: "http://example.org/Dog",
      label: "Dog",
      disjointWith: []
    })

    const petNode = OntologyF.Node(
      {
        iri: "http://example.org/Pet",
        label: "Pet",
        disjointWith: []
      },
      [dogLeaf]
    )

    // Counting algebra
    const countAlgebra: OntologyAlgebra<number> = {
      foldLeaf: () => 1,
      foldNode: (_, subResults) => 1 + subResults.reduce((a, b) => a + b, 0),
      foldProperty: () => 1
    }

    const result = cata(petNode, countAlgebra)
    expect(result).toBe(2) // Pet + Dog = 2
  })

  test("cata processes leaf correctly", () => {
    const leaf = OntologyF.Leaf({
      iri: "http://example.org/Cat",
      label: "Cat",
      disjointWith: []
    })

    const labelAlgebra: OntologyAlgebra<string> = {
      foldLeaf: (data) => data.label,
      foldNode: (data, _) => data.label,
      foldProperty: (data, _, __) => data.label
    }

    const result = cata(leaf, labelAlgebra)
    expect(result).toBe("Cat")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- catamorphism.test.ts`
Expected: FAIL with "Cannot find module './catamorphism'"

**Step 3: Write minimal implementation**

File: `src/ontology/catamorphism.ts`

```typescript
import type { Ontology, OntologyAlgebra } from "./types"

/**
 * cata: Catamorphism for Ontology
 *
 * The unique homomorphism from the initial algebra (Ontology)
 * to any other algebra R
 *
 * This recursively folds the ontology structure
 */
export const cata = <R>(ont: Ontology, alg: OntologyAlgebra<R>): R => {
  switch (ont._tag) {
    case "Leaf":
      return alg.foldLeaf(ont.classData)

    case "Node": {
      // Recursively fold subclasses first
      const subResults = ont.subclasses.map((sub) => cata(sub, alg))
      return alg.foldNode(ont.classData, subResults)
    }

    case "Property":
      return alg.foldProperty(ont.propertyData, ont.domain, ont.range)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- catamorphism.test.ts`
Expected: PASS

**Step 5: Add catamorphism fusion law test**

Add to `src/ontology/catamorphism.test.ts`:

```typescript
import * as fc from "fast-check"

describe("Catamorphism Laws", () => {
  test("fusion law: f ∘ cata(ont, alg1) = cata(ont, alg2)", () => {
    // Arbitrary ontology generator (simple)
    const arbOntology = fc.oneof(
      fc.record({
        _tag: fc.constant("Leaf" as const),
        classData: fc.record({
          iri: fc.webUrl(),
          label: fc.string(),
          disjointWith: fc.array(fc.webUrl())
        })
      }),
      fc.record({
        _tag: fc.constant("Property" as const),
        propertyData: fc.record({
          iri: fc.webUrl(),
          label: fc.string(),
          functional: fc.boolean(),
          inverseOf: fc.option(fc.webUrl())
        }),
        domain: fc.webUrl(),
        range: fc.webUrl()
      })
    ) as fc.Arbitrary<Ontology>

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

        expect(result1).toBe(result2)
      })
    )
  })
})
```

**Step 6: Run tests to verify fusion law passes**

Run: `npm test -- catamorphism.test.ts`
Expected: PASS (all tests including property-based)

**Step 7: Commit**

```bash
git add src/ontology/catamorphism.ts src/ontology/catamorphism.test.ts
git commit -m "feat: add catamorphism with fusion law tests"
```

---

## Task 4: Doc Monoid Implementation

**Files:**
- Create: `src/prompt/monoids.ts`
- Create: `src/prompt/monoids.test.ts`

**Step 1: Write failing test for DocMonoid**

File: `src/prompt/monoids.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import * as fc from "fast-check"
import { DocMonoid } from "./monoids"

describe("DocMonoid", () => {
  test("identity law: combine(empty, x) = x", () => {
    const doc = ["Line 1", "Line 2"]
    const leftId = DocMonoid.combine(DocMonoid.empty, doc)
    const rightId = DocMonoid.combine(doc, DocMonoid.empty)

    expect(leftId).toEqual(doc)
    expect(rightId).toEqual(doc)
  })

  test("associativity law: combine(combine(x, y), z) = combine(x, combine(y, z))", () => {
    const x = ["A"]
    const y = ["B"]
    const z = ["C"]

    const leftAssoc = DocMonoid.combine(DocMonoid.combine(x, y), z)
    const rightAssoc = DocMonoid.combine(x, DocMonoid.combine(y, z))

    expect(leftAssoc).toEqual(rightAssoc)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- monoids.test.ts`
Expected: FAIL with "Cannot find module './monoids'"

**Step 3: Write minimal implementation**

File: `src/prompt/monoids.ts`

```typescript
import { Monoid } from "@effect/typeclass"

/**
 * Doc - A document represented as lines of text
 *
 * This is our fundamental monoid for prompt composition
 */
export type Doc = ReadonlyArray<string>

/**
 * DocMonoid - Monoid instance for Doc
 *
 * - Identity: []
 * - Combine: array concatenation
 */
export const DocMonoid: Monoid.Monoid<Doc> = Monoid.array<string>()
```

**Step 4: Run test to verify it passes**

Run: `npm test -- monoids.test.ts`
Expected: PASS

**Step 5: Add property-based tests**

Add to `src/prompt/monoids.test.ts`:

```typescript
describe("DocMonoid (property-based)", () => {
  const arbDoc = fc.array(fc.string())

  test("identity law (property-based)", () => {
    fc.assert(
      fc.property(arbDoc, (doc) => {
        const leftId = DocMonoid.combine(DocMonoid.empty, doc)
        const rightId = DocMonoid.combine(doc, DocMonoid.empty)

        expect(leftId).toEqual(doc)
        expect(rightId).toEqual(doc)
      })
    )
  })

  test("associativity law (property-based)", () => {
    fc.assert(
      fc.property(arbDoc, arbDoc, arbDoc, (x, y, z) => {
        const leftAssoc = DocMonoid.combine(DocMonoid.combine(x, y), z)
        const rightAssoc = DocMonoid.combine(x, DocMonoid.combine(y, z))

        expect(leftAssoc).toEqual(rightAssoc)
      })
    )
  })
})
```

**Step 6: Run tests to verify property-based tests pass**

Run: `npm test -- monoids.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/prompt/monoids.ts src/prompt/monoids.test.ts
git commit -m "feat: add Doc monoid with property-based law tests"
```

---

## Task 5: StructuredPrompt Monoid Implementation

**Files:**
- Modify: `src/prompt/monoids.ts`
- Modify: `src/prompt/monoids.test.ts`

**Step 1: Write failing test for StructuredPromptMonoid**

Add to `src/prompt/monoids.test.ts`:

```typescript
import { StructuredPromptMonoid, type StructuredPrompt } from "./monoids"

describe("StructuredPromptMonoid", () => {
  test("combines prompts correctly", () => {
    const p1: StructuredPrompt = {
      systemFragments: ["You are an expert"],
      userFragments: [],
      exampleFragments: []
    }

    const p2: StructuredPrompt = {
      systemFragments: ["Follow these rules:"],
      userFragments: ["Extract from:"],
      exampleFragments: []
    }

    const combined = StructuredPromptMonoid.combine(p1, p2)

    expect(combined).toEqual({
      systemFragments: ["You are an expert", "Follow these rules:"],
      userFragments: ["Extract from:"],
      exampleFragments: []
    })
  })

  test("identity law", () => {
    const p: StructuredPrompt = {
      systemFragments: ["System"],
      userFragments: ["User"],
      exampleFragments: ["Example"]
    }

    const leftId = StructuredPromptMonoid.combine(StructuredPromptMonoid.empty, p)
    const rightId = StructuredPromptMonoid.combine(p, StructuredPromptMonoid.empty)

    expect(leftId).toEqual(p)
    expect(rightId).toEqual(p)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- monoids.test.ts`
Expected: FAIL with "Cannot find export 'StructuredPromptMonoid'"

**Step 3: Write minimal implementation**

Add to `src/prompt/monoids.ts`:

```typescript
/**
 * StructuredPrompt - Prompts organized by section
 *
 * Each section is a Doc (array of lines)
 */
export interface StructuredPrompt {
  readonly systemFragments: Doc
  readonly userFragments: Doc
  readonly exampleFragments: Doc
}

/**
 * StructuredPromptMonoid - Monoid instance for StructuredPrompt
 *
 * Uses Effect's Monoid.struct to derive monoid from record of monoids
 */
export const StructuredPromptMonoid: Monoid.Monoid<StructuredPrompt> =
  Monoid.struct({
    systemFragments: DocMonoid,
    userFragments: DocMonoid,
    exampleFragments: DocMonoid
  })
```

**Step 4: Run test to verify it passes**

Run: `npm test -- monoids.test.ts`
Expected: PASS

**Step 5: Add property-based tests for StructuredPromptMonoid**

Add to `src/prompt/monoids.test.ts`:

```typescript
describe("StructuredPromptMonoid (property-based)", () => {
  const arbStructuredPrompt = fc.record({
    systemFragments: fc.array(fc.string()),
    userFragments: fc.array(fc.string()),
    exampleFragments: fc.array(fc.string())
  }) as fc.Arbitrary<StructuredPrompt>

  test("associativity law (property-based)", () => {
    fc.assert(
      fc.property(arbStructuredPrompt, arbStructuredPrompt, arbStructuredPrompt, (x, y, z) => {
        const leftAssoc = StructuredPromptMonoid.combine(
          StructuredPromptMonoid.combine(x, y),
          z
        )
        const rightAssoc = StructuredPromptMonoid.combine(
          x,
          StructuredPromptMonoid.combine(y, z)
        )

        expect(leftAssoc).toEqual(rightAssoc)
      })
    )
  })
})
```

**Step 6: Run tests to verify property-based tests pass**

Run: `npm test -- monoids.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/prompt/monoids.ts src/prompt/monoids.test.ts
git commit -m "feat: add StructuredPrompt monoid with property-based tests"
```

---

## Task 6: Turtle Parser (Minimal)

**Files:**
- Create: `src/parser/turtle-parser.ts`
- Create: `src/parser/turtle-parser.test.ts`

**Step 1: Write failing test for parsing pet ontology**

File: `src/parser/turtle-parser.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import { Effect } from "effect"
import { parseTurtleToOntology } from "./turtle-parser"
import { readFileSync } from "fs"

describe("Turtle Parser", () => {
  test("parses pet-ontology.ttl", async () => {
    const turtleContent = readFileSync("test-data/pet-ontology.ttl", "utf-8")

    const result = await Effect.runPromise(parseTurtleToOntology(turtleContent))

    // Should find Pet class
    const petClass = result.find(
      (ont) => ont._tag === "Node" && ont.classData.iri === "http://example.org/pets#Pet"
    )
    expect(petClass).toBeDefined()

    // Pet should have Dog and Cat as subclasses
    if (petClass && petClass._tag === "Node") {
      expect(petClass.subclasses).toHaveLength(2)
    }
  })

  test("parses properties from pet ontology", async () => {
    const turtleContent = readFileSync("test-data/pet-ontology.ttl", "utf-8")

    const result = await Effect.runPromise(parseTurtleToOntology(turtleContent))

    // Should find hasAge property
    const hasAgeProp = result.find(
      (ont) => ont._tag === "Property" && ont.propertyData.iri === "http://example.org/pets#hasAge"
    )
    expect(hasAgeProp).toBeDefined()

    if (hasAgeProp && hasAgeProp._tag === "Property") {
      expect(hasAgeProp.propertyData.functional).toBe(true)
      expect(hasAgeProp.domain).toBe("http://example.org/pets#Pet")
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- turtle-parser.test.ts`
Expected: FAIL with "Cannot find module './turtle-parser'"

**Step 3: Write minimal implementation**

File: `src/parser/turtle-parser.ts`

```typescript
import { Effect, Data } from "effect"
import * as N3 from "n3"
import { OntologyF, type Ontology, type ClassData, type PropertyData } from "../ontology/types"

class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown
}> {}

/**
 * Parse Turtle RDF to Ontology F-Algebra structure
 *
 * Strategy:
 * 1. Parse all triples with N3
 * 2. Extract classes (owl:Class) and build hierarchy (rdfs:subClassOf)
 * 3. Extract properties (owl:ObjectProperty, owl:DatatypeProperty)
 * 4. Build F-Algebra structure
 */
export const parseTurtleToOntology = (
  turtleContent: string
): Effect.Effect<ReadonlyArray<Ontology>, ParseError> =>
  Effect.gen(function* () {
    // Parse triples
    const store = yield* Effect.tryPromise({
      try: () =>
        new Promise<N3.Store>((resolve, reject) => {
          const parser = new N3.Parser()
          const store = new N3.Store()

          parser.parse(turtleContent, (error, quad) => {
            if (error) reject(error)
            else if (quad) store.addQuad(quad)
            else resolve(store)
          })
        }),
      catch: (error) => new ParseError({ cause: error })
    })

    // Extract classes
    const classTriples = store.getQuads(null, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "http://www.w3.org/2002/07/owl#Class", null)
    const classes = new Map<string, ClassData>()

    for (const quad of classTriples) {
      const classIri = quad.subject.value

      // Get label
      const labelQuad = store.getQuads(classIri, "http://www.w3.org/2000/01/rdf-schema#label", null, null)[0]
      const label = labelQuad?.object.value || classIri

      // Get comment
      const commentQuad = store.getQuads(classIri, "http://www.w3.org/2000/01/rdf-schema#comment", null, null)[0]
      const comment = commentQuad?.object.value

      // Get disjoint classes
      const disjointQuads = store.getQuads(classIri, "http://www.w3.org/2002/07/owl#disjointWith", null, null)
      const disjointWith = disjointQuads.map(q => q.object.value)

      classes.set(classIri, {
        iri: classIri,
        label,
        comment,
        disjointWith
      })
    }

    // Build hierarchy
    const subClassMap = new Map<string, string[]>()
    const subClassQuads = store.getQuads(null, "http://www.w3.org/2000/01/rdf-schema#subClassOf", null, null)

    for (const quad of subClassQuads) {
      const subClass = quad.subject.value
      const superClass = quad.object.value

      if (!subClassMap.has(superClass)) {
        subClassMap.set(superClass, [])
      }
      subClassMap.get(superClass)!.push(subClass)
    }

    // Build ontology structures
    const result: Ontology[] = []

    // Helper: build ontology for class (recursive for hierarchy)
    const buildClassOntology = (classIri: string): Ontology | null => {
      const classData = classes.get(classIri)
      if (!classData) return null

      const subClasses = subClassMap.get(classIri) || []

      if (subClasses.length === 0) {
        return OntologyF.Leaf(classData)
      } else {
        const subOntologies = subClasses
          .map(buildClassOntology)
          .filter((ont): ont is Ontology => ont !== null)

        return OntologyF.Node(classData, subOntologies)
      }
    }

    // Find root classes (those without superclass)
    const allSubClasses = new Set(subClassQuads.map(q => q.subject.value))
    const rootClasses = Array.from(classes.keys()).filter(
      classIri => !allSubClasses.has(classIri)
    )

    for (const rootClass of rootClasses) {
      const ont = buildClassOntology(rootClass)
      if (ont) result.push(ont)
    }

    // Extract properties
    const propertyTypes = [
      "http://www.w3.org/2002/07/owl#ObjectProperty",
      "http://www.w3.org/2002/07/owl#DatatypeProperty"
    ]

    for (const propType of propertyTypes) {
      const propQuads = store.getQuads(null, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", propType, null)

      for (const quad of propQuads) {
        const propIri = quad.subject.value

        // Get label
        const labelQuad = store.getQuads(propIri, "http://www.w3.org/2000/01/rdf-schema#label", null, null)[0]
        const label = labelQuad?.object.value || propIri

        // Get comment
        const commentQuad = store.getQuads(propIri, "http://www.w3.org/2000/01/rdf-schema#comment", null, null)[0]
        const comment = commentQuad?.object.value

        // Get domain
        const domainQuad = store.getQuads(propIri, "http://www.w3.org/2000/01/rdf-schema#domain", null, null)[0]
        const domain = domainQuad?.object.value || "http://www.w3.org/2002/07/owl#Thing"

        // Get range
        const rangeQuad = store.getQuads(propIri, "http://www.w3.org/2000/01/rdf-schema#range", null, null)[0]
        const range = rangeQuad?.object.value || "http://www.w3.org/2001/XMLSchema#string"

        // Check if functional
        const functionalQuad = store.getQuads(propIri, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "http://www.w3.org/2002/07/owl#FunctionalProperty", null)[0]
        const functional = !!functionalQuad

        // Get inverse
        const inverseQuad = store.getQuads(propIri, "http://www.w3.org/2002/07/owl#inverseOf", null, null)[0]
        const inverseOf = inverseQuad?.object.value

        const propertyData: PropertyData = {
          iri: propIri,
          label,
          comment,
          functional,
          inverseOf
        }

        result.push(OntologyF.Property(propertyData, domain, range))
      }
    }

    return result
  })
```

**Step 4: Run test to verify it passes**

Run: `npm test -- turtle-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/turtle-parser.ts src/parser/turtle-parser.test.ts
git commit -m "feat: add Turtle parser to F-Algebra conversion"
```

---

## Task 7: Prompt Generation Algebra

**Files:**
- Create: `src/prompt/extraction-algebra.ts`
- Create: `src/prompt/extraction-algebra.test.ts`

**Step 1: Write failing test for ExtractionPromptAlgebra**

File: `src/prompt/extraction-algebra.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import { OntologyF } from "../ontology/types"
import { cata } from "../ontology/catamorphism"
import { ExtractionPromptAlgebra } from "./extraction-algebra"

describe("ExtractionPromptAlgebra", () => {
  test("generates prompt for leaf class", () => {
    const catLeaf = OntologyF.Leaf({
      iri: "http://example.org/Cat",
      label: "Cat",
      comment: "A domesticated feline",
      disjointWith: []
    })

    const result = cata(catLeaf, ExtractionPromptAlgebra)

    expect(result.systemFragments).toContain("Extract instances of class 'Cat' (http://example.org/Cat)")
    expect(result.systemFragments).toContain("Definition: A domesticated feline")
  })

  test("generates prompt for node with subclasses", () => {
    const dogLeaf = OntologyF.Leaf({
      iri: "http://example.org/Dog",
      label: "Dog",
      disjointWith: []
    })

    const catLeaf = OntologyF.Leaf({
      iri: "http://example.org/Cat",
      label: "Cat",
      disjointWith: []
    })

    const petNode = OntologyF.Node(
      {
        iri: "http://example.org/Pet",
        label: "Pet",
        comment: "An animal companion",
        disjointWith: []
      },
      [dogLeaf, catLeaf]
    )

    const result = cata(petNode, ExtractionPromptAlgebra)

    // Should include parent class
    expect(result.systemFragments).toContain("Extract instances of class 'Pet' (http://example.org/Pet)")

    // Should include subclasses
    expect(result.systemFragments).toContain("Extract instances of class 'Dog' (http://example.org/Dog)")
    expect(result.systemFragments).toContain("Extract instances of class 'Cat' (http://example.org/Cat)")
  })

  test("generates prompt for property", () => {
    const hasOwnerProp = OntologyF.Property(
      {
        iri: "http://example.org/hasOwner",
        label: "has owner",
        comment: "The person who owns a pet",
        functional: false
      },
      "http://example.org/Pet",
      "http://example.org/Person"
    )

    const result = cata(hasOwnerProp, ExtractionPromptAlgebra)

    expect(result.systemFragments).toContain("Extract property 'has owner' (http://example.org/hasOwner)")
    expect(result.systemFragments).toContain("Domain: http://example.org/Pet, Range: http://example.org/Person")
    expect(result.exampleFragments.length).toBeGreaterThan(0)
  })

  test("generates prompt for functional property", () => {
    const hasAgeProp = OntologyF.Property(
      {
        iri: "http://example.org/hasAge",
        label: "has age",
        functional: true
      },
      "http://example.org/Pet",
      "http://www.w3.org/2001/XMLSchema#integer"
    )

    const result = cata(hasAgeProp, ExtractionPromptAlgebra)

    expect(result.systemFragments).toContain("Note: This is a functional property (max 1 value)")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- extraction-algebra.test.ts`
Expected: FAIL with "Cannot find module './extraction-algebra'"

**Step 3: Write minimal implementation**

File: `src/prompt/extraction-algebra.ts`

```typescript
import { Monoid } from "@effect/typeclass"
import type { OntologyAlgebra, ClassData, PropertyData } from "../ontology/types"
import { StructuredPromptMonoid, type StructuredPrompt } from "./monoids"

/**
 * ExtractionPromptAlgebra
 *
 * Algebra for generating extraction prompts from ontology structure
 *
 * Strategy:
 * - Leaf classes: generate extraction instruction
 * - Node classes: combine parent + subclass instructions
 * - Properties: generate property extraction with domain/range
 */
export const ExtractionPromptAlgebra: OntologyAlgebra<StructuredPrompt> = {
  foldLeaf: (classData: ClassData): StructuredPrompt => ({
    systemFragments: [
      `Extract instances of class '${classData.label}' (${classData.iri})`,
      classData.comment ? `Definition: ${classData.comment}` : ""
    ].filter(Boolean),
    userFragments: [],
    exampleFragments: []
  }),

  foldNode: (classData: ClassData, subResults: ReadonlyArray<StructuredPrompt>): StructuredPrompt => {
    // Parent class prompt
    const parentPrompt: StructuredPrompt = {
      systemFragments: [
        `Extract instances of class '${classData.label}' (${classData.iri})`,
        classData.comment ? `Definition: ${classData.comment}` : "",
        subResults.length > 0 ? "This class has the following subclasses:" : ""
      ].filter(Boolean),
      userFragments: [],
      exampleFragments: []
    }

    // Combine parent with all subclass prompts using monoid
    return Monoid.combineAll(StructuredPromptMonoid)([parentPrompt, ...subResults])
  },

  foldProperty: (propertyData: PropertyData, domain: string, range: string): StructuredPrompt => ({
    systemFragments: [
      `Extract property '${propertyData.label}' (${propertyData.iri})`,
      propertyData.comment ? `Definition: ${propertyData.comment}` : "",
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

**Step 4: Run test to verify it passes**

Run: `npm test -- extraction-algebra.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/prompt/extraction-algebra.ts src/prompt/extraction-algebra.test.ts
git commit -m "feat: add extraction prompt algebra"
```

---

## Task 8: End-to-End Prompt Generation

**Files:**
- Create: `src/prompt/generate-prompt.ts`
- Create: `src/prompt/generate-prompt.test.ts`

**Step 1: Write failing end-to-end test**

File: `src/prompt/generate-prompt.test.ts`

```typescript
import { describe, test, expect } from "vitest"
import { Effect } from "effect"
import { generateExtractionPrompt } from "./generate-prompt"
import { parseTurtleToOntology } from "../parser/turtle-parser"
import { readFileSync } from "fs"

describe("Generate Extraction Prompt (End-to-End)", () => {
  test("generates extraction prompt from pet ontology", async () => {
    const turtleContent = readFileSync("test-data/pet-ontology.ttl", "utf-8")

    const program = Effect.gen(function* () {
      const ontologyElements = yield* parseTurtleToOntology(turtleContent)
      const prompt = yield* generateExtractionPrompt(ontologyElements)
      return prompt
    })

    const result = await Effect.runPromise(program)

    // Verify system prompt includes classes
    expect(result.system).toContain("Pet")
    expect(result.system).toContain("Dog")
    expect(result.system).toContain("Cat")
    expect(result.system).toContain("Person")

    // Verify system prompt includes properties
    expect(result.system).toContain("has owner")
    expect(result.system).toContain("has age")

    // Verify functional property note
    expect(result.system).toContain("functional property")

    // Verify examples section has property examples
    expect(result.examples).toContain("hasOwner")
    expect(result.examples).toContain("hasAge")

    // Verify structure (should have newlines separating sections)
    expect(result.system.length).toBeGreaterThan(100)
  })

  test("prompt includes hierarchy information", async () => {
    const turtleContent = readFileSync("test-data/pet-ontology.ttl", "utf-8")

    const program = Effect.gen(function* () {
      const ontologyElements = yield* parseTurtleToOntology(turtleContent)
      const prompt = yield* generateExtractionPrompt(ontologyElements)
      return prompt
    })

    const result = await Effect.runPromise(program)

    // Pet should appear before its subclasses (hierarchy respected)
    const petIndex = result.system.indexOf("Pet")
    const dogIndex = result.system.indexOf("Dog")
    const catIndex = result.system.indexOf("Cat")

    expect(petIndex).toBeGreaterThan(-1)
    expect(dogIndex).toBeGreaterThan(petIndex)
    expect(catIndex).toBeGreaterThan(petIndex)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- generate-prompt.test.ts`
Expected: FAIL with "Cannot find module './generate-prompt'"

**Step 3: Write minimal implementation**

File: `src/prompt/generate-prompt.ts`

```typescript
import { Effect } from "effect"
import { Monoid } from "@effect/typeclass"
import type { Ontology } from "../ontology/types"
import { cata } from "../ontology/catamorphism"
import { ExtractionPromptAlgebra } from "./extraction-algebra"
import { StructuredPromptMonoid } from "./monoids"

/**
 * Generate extraction prompt from ontology elements
 *
 * Takes parsed ontology F-Algebra structures and generates
 * a structured prompt for LLM-based data extraction
 */
export const generateExtractionPrompt = (
  ontologyElements: ReadonlyArray<Ontology>
): Effect.Effect<
  {
    readonly system: string
    readonly user: string
    readonly examples: string
  },
  never,
  never
> =>
  Effect.gen(function* () {
    // Fold each ontology element using the extraction algebra
    const prompts = ontologyElements.map((ont) => cata(ont, ExtractionPromptAlgebra))

    // Combine all prompts using the StructuredPrompt monoid
    const combined = Monoid.combineAll(StructuredPromptMonoid)(prompts)

    // Render to strings (join lines with double newlines)
    return {
      system: combined.systemFragments.join("\n\n"),
      user: combined.userFragments.join("\n\n"),
      examples: combined.exampleFragments.join("\n")
    }
  })
```

**Step 4: Run test to verify it passes**

Run: `npm test -- generate-prompt.test.ts`
Expected: PASS

**Step 5: Add test for empty ontology**

Add to `src/prompt/generate-prompt.test.ts`:

```typescript
test("generates empty prompt for empty ontology", async () => {
  const result = await Effect.runPromise(generateExtractionPrompt([]))

  expect(result.system).toBe("")
  expect(result.user).toBe("")
  expect(result.examples).toBe("")
})
```

**Step 6: Run test to verify edge case passes**

Run: `npm test -- generate-prompt.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/prompt/generate-prompt.ts src/prompt/generate-prompt.test.ts
git commit -m "feat: add end-to-end prompt generation from ontology"
```

---

## Task 9: Export Public API and Final Testing

**Files:**
- Modify: `src/index.ts`
- Create: `examples/pet-ontology-prompt.ts`

**Step 1: Export public API**

File: `src/index.ts`

```typescript
// Prompt Algebra Implementation - Public API

// Types
export type { Ontology, OntologyAlgebra, ClassData, PropertyData } from "./ontology/types"
export type { StructuredPrompt, Doc } from "./prompt/monoids"

// Core functions
export { OntologyF } from "./ontology/types"
export { cata } from "./ontology/catamorphism"
export { DocMonoid, StructuredPromptMonoid } from "./prompt/monoids"
export { ExtractionPromptAlgebra } from "./prompt/extraction-algebra"
export { generateExtractionPrompt } from "./prompt/generate-prompt"
export { parseTurtleToOntology } from "./parser/turtle-parser"
```

**Step 2: Create example usage**

File: `examples/pet-ontology-prompt.ts`

```typescript
import { Effect } from "effect"
import { readFileSync } from "fs"
import { parseTurtleToOntology, generateExtractionPrompt } from "../src/index"

/**
 * Example: Generate extraction prompt from Pet ontology
 */
const program = Effect.gen(function* () {
  console.log("📖 Reading pet-ontology.ttl...")
  const turtleContent = readFileSync("test-data/pet-ontology.ttl", "utf-8")

  console.log("🔍 Parsing ontology...")
  const ontologyElements = yield* parseTurtleToOntology(turtleContent)
  console.log(`   Found ${ontologyElements.length} ontology elements`)

  console.log("✨ Generating extraction prompt...")
  const prompt = yield* generateExtractionPrompt(ontologyElements)

  console.log("\n" + "=".repeat(80))
  console.log("SYSTEM PROMPT:")
  console.log("=".repeat(80))
  console.log(prompt.system)

  console.log("\n" + "=".repeat(80))
  console.log("EXAMPLES:")
  console.log("=".repeat(80))
  console.log(prompt.examples)

  return prompt
})

Effect.runPromise(program)
  .then(() => console.log("\n✅ Done!"))
  .catch(console.error)
```

**Step 3: Add script to package.json**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "example:pet": "tsx examples/pet-ontology-prompt.ts"
  }
}
```

Install tsx:
```bash
npm install --save-dev tsx
```

**Step 4: Run example to verify**

Run: `npm run example:pet`

Expected output:
```
📖 Reading pet-ontology.ttl...
🔍 Parsing ontology...
   Found 7 ontology elements
✨ Generating extraction prompt...

================================================================================
SYSTEM PROMPT:
================================================================================
Extract instances of class 'Pet' (http://example.org/pets#Pet)
Definition: An animal kept as a companion
This class has the following subclasses:

Extract instances of class 'Dog' (http://example.org/pets#Dog)
Definition: A domesticated canine

Extract instances of class 'Cat' (http://example.org/pets#Cat)
Definition: A domesticated feline

Extract instances of class 'Person' (http://example.org/pets#Person)
Definition: A human being

Extract property 'has name' (http://example.org/pets#hasName)
...

================================================================================
EXAMPLES:
================================================================================
Example: <http://example.org/pets#Pet_instance> <http://example.org/pets#hasOwner> <http://example.org/pets#Person_instance> .
...

✅ Done!
```

**Step 5: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 7: Commit**

```bash
git add src/index.ts examples/pet-ontology-prompt.ts package.json
git commit -m "feat: export public API and add example usage"
```

---

## Summary

**Implemented:**
1. ✅ F-Algebra ontology types (Leaf, Node, Property)
2. ✅ True catamorphism with fusion law tests
3. ✅ Doc monoid with property-based tests
4. ✅ StructuredPrompt monoid with property-based tests
5. ✅ Turtle parser converting RDF to F-Algebra
6. ✅ Extraction prompt algebra
7. ✅ End-to-end prompt generation
8. ✅ Example usage with pet-ontology.ttl

**Testable at every step:**
- Each task has TDD cycle (write test → fail → implement → pass)
- Property-based tests verify algebraic laws
- End-to-end test with real Turtle file
- Example demonstrates working system

*Reviewer status note (2025-11-18): the checklist above describes the **target state** of this plan as if it were fully executed in a clean project. In the current `effect-ontology` repo, these steps have **not yet been implemented**; use the tasks (especially the Phase 0 pipeline described in the reviewer annotations) as a roadmap and tick items off as you actually add the corresponding modules and tests to this codebase.*

**Next steps:**
- Add LLM integration (Effect AI)
- Add N3 streaming parser
- Add SHACL validation
- Implement refinement loop

**Architecture alignment:**
- ✅ Uses Effect's `@effect/typeclass` for monoids
- ✅ True catamorphism over F-Algebra (not just map+combine)
- ✅ Law-abiding monoids verified with property-based tests
- ✅ Concrete example ontology (Pet) for testing
- ✅ DRY, YAGNI, TDD throughout
