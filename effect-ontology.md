This file is a merged representation of the entire codebase, combined into a single document by Repomix.

================================================================
File Summary
================================================================

Purpose:
--------
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

File Format:
------------
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A separator line (================)
  b. The file path (File: path/to/file)
  c. Another separator line
  d. The full contents of the file
  e. A blank line

Usage Guidelines:
-----------------
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

Notes:
------
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded

Additional Info:
----------------

================================================================
Directory Structure
================================================================
.github/
  actions/
    setup/
      action.yml
  workflows/
    check.yml
    snapshot.yml
packages/
  core/
    src/
      Graph/
        Builder.ts
        Types.ts
      inspect.ts
      Program.ts
    test/
      Graph/
        Builder.test.ts
        Types.test.ts
      Dummy.test.ts
    test-data/
      dcterms.ttl
      foaf.ttl
      organization.ttl
      pet-ontology.ttl
      zoo.ttl
    package.json
    tsconfig.json
  ui/
    .github/
      workflows/
        check.yml
        snapshot.yml
    src/
      components/
        NodeInspector.tsx
        TopologicalRail.tsx
        TurtleEditor.tsx
      lib/
        utils.ts
      state/
        store.ts
      App.tsx
      index.css
      main.tsx
    index.html
    package.json
    tailwind.config.js
    tsconfig.json
    vite.config.ts
scratchpad/
  tsconfig.json
.gitignore
.prettierignore
.repomixignore
CLAUDE.md
eslint.config.mjs
LICENSE
package.json
README.md
setupTests.ts
tsconfig.base.json
tsconfig.build.json
tsconfig.json
tsconfig.src.json
tsconfig.test.json
vitest.config.ts

================================================================
Files
================================================================

================
File: .github/actions/setup/action.yml
================
name: Setup
description: Perform standard setup and install dependencies using pnpm.
inputs:
  node-version:
    description: The version of Node.js to install
    required: true
    default: 20.16.0

runs:
  using: composite
  steps:
    - name: Install pnpm
      uses: pnpm/action-setup@v3
    - name: Install node
      uses: actions/setup-node@v4
      with:
        cache: pnpm
        node-version: ${{ inputs.node-version }}
    - name: Install dependencies
      shell: bash
      run: pnpm install

================
File: .github/workflows/check.yml
================
name: Check

on:
  workflow_dispatch:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm codegen
      - name: Check source state
        run: git add src && git diff-index --cached HEAD --exit-code src

  types:
    name: Types
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm lint

  test:
    name: Test 
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm test

================
File: .github/workflows/snapshot.yml
================
name: Snapshot

on:
  pull_request:
    branches: [main, next-minor, next-major]
  workflow_dispatch:

permissions: {}

jobs:
  snapshot:
    name: Snapshot
    if: github.repository_owner == 'Effect-Ts'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - name: Build package
        run: pnpm build
      - name: Create snapshot
        id: snapshot
        run: pnpx pkg-pr-new@0.0.24 publish --pnpm --comment=off

================
File: packages/core/src/Graph/Builder.ts
================
/**
 * Graph Builder - Parses Turtle RDF to Effect Graph structure
 *
 * Strategy (from docs/effect_graph_implementation.md):
 * 1. Parse all triples with N3
 * 2. Identify all owl:Class subjects -> create ClassNodes
 * 3. For each ClassNode, scan for properties where domain == Node -> attach to node.properties
 * 4. Scan for rdfs:subClassOf triples -> add Edge: Child -> Parent (dependency direction)
 * 5. Return Graph + Context
 */

import { Data, Effect, Graph, HashMap, Option } from "effect"
import * as N3 from "n3"
import { ClassNode, type NodeId, type OntologyContext, type PropertyData } from "./Types.js"

class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown
}> {}

/**
 * Result of parsing Turtle to Graph
 */
export interface ParsedOntologyGraph {
  readonly graph: Graph.Graph<NodeId, unknown>
  readonly context: OntologyContext
}

/**
 * Parse Turtle RDF string into Effect Graph structure
 *
 * Returns both:
 * - graph: The dependency graph (Child -> Parent edges for subClassOf)
 * - context: The data store (NodeId -> OntologyNode)
 */
export const parseTurtleToGraph = (
  turtleContent: string
): Effect.Effect<ParsedOntologyGraph, ParseError> =>
  Effect.gen(function*() {
    // 1. Parse all triples using N3
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

    // 2. Extract all OWL Classes
    const classTriples = store.getQuads(
      null,
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "http://www.w3.org/2002/07/owl#Class",
      null
    )

    let classNodes = HashMap.empty<NodeId, ClassNode>()

    for (const quad of classTriples) {
      const classIri = quad.subject.value

      // Get label
      const labelQuad = store.getQuads(
        classIri,
        "http://www.w3.org/2000/01/rdf-schema#label",
        null,
        null
      )[0]
      const label = labelQuad?.object.value || classIri.split("#")[1] || classIri

      // Initially empty properties array (will populate next)
      classNodes = HashMap.set(
        classNodes,
        classIri,
        ClassNode.make({
          id: classIri,
          label,
          properties: []
        })
      )
    }

    // 3. Extract all properties and attach to their domain classes
    // Properties without domains are collected as "universal properties"
    const propertyTypes = [
      "http://www.w3.org/2002/07/owl#ObjectProperty",
      "http://www.w3.org/2002/07/owl#DatatypeProperty"
    ]

    const universalProperties: Array<PropertyData> = []

    for (const propType of propertyTypes) {
      const propTriples = store.getQuads(
        null,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        propType,
        null
      )

      for (const quad of propTriples) {
        const propIri = quad.subject.value

        // Get label
        const labelQuad = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#label",
          null,
          null
        )[0]
        const label = labelQuad?.object.value || propIri.split("#")[1] || propIri

        // Get range
        const rangeQuad = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#range",
          null,
          null
        )[0]
        const range = rangeQuad?.object.value || "http://www.w3.org/2001/XMLSchema#string"

        // Get domain(s)
        const domainQuads = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#domain",
          null,
          null
        )

        const propertyData: PropertyData = {
          iri: propIri,
          label,
          range
        }

        if (domainQuads.length === 0) {
          // CASE A: No Domain -> Universal Property (e.g., Dublin Core)
          universalProperties.push(propertyData)
        } else {
          // CASE B: Explicit Domain -> Attach to specific ClassNode(s)
          for (const domainQuad of domainQuads) {
            const domainIri = domainQuad.object.value

            // Use Option.match to update the node if it exists
            classNodes = Option.match(HashMap.get(classNodes, domainIri), {
              onNone: () => classNodes, // No change if class not found
              onSome: (classNode) =>
                HashMap.set(
                  classNodes,
                  domainIri,
                  ClassNode.make({
                    ...classNode,
                    properties: [...classNode.properties, propertyData]
                  })
                )
            })
          }
        }
      }
    }

    // 4. Build Graph edges from subClassOf relationships
    // Edge semantics: Child -> Parent (Child depends on Parent for rendering)
    const subClassTriples = store.getQuads(
      null,
      "http://www.w3.org/2000/01/rdf-schema#subClassOf",
      null,
      null
    )

    // Build graph using Effect's Graph API
    // HashMap to store NodeId -> GraphNodeIndex
    let nodeIndexMap = HashMap.empty<NodeId, number>()

    const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
      // Add all class nodes first
      for (const classIri of HashMap.keys(classNodes)) {
        const nodeIndex = Graph.addNode(mutable, classIri)
        nodeIndexMap = HashMap.set(nodeIndexMap, classIri, nodeIndex)
      }

      // Add edges: Child -> Parent (dependency direction)
      for (const quad of subClassTriples) {
        const childIri = quad.subject.value // subClass
        const parentIri = quad.object.value // superClass

        // Use Option.flatMap to add edge only if both nodes exist
        Option.flatMap(
          HashMap.get(nodeIndexMap, childIri),
          (childIdx) =>
            Option.map(
              HashMap.get(nodeIndexMap, parentIri),
              (parentIdx) => {
                // Child depends on Parent (render children before parents)
                Graph.addEdge(mutable, childIdx, parentIdx, null)
              }
            )
        )
      }
    })

    // 5. Build context (node data store)
    const context: OntologyContext = {
      nodes: classNodes,
      universalProperties,
      nodeIndexMap
    }

    return {
      graph,
      context
    }
  })

================
File: packages/core/src/Graph/Types.ts
================
/**
 * Graph-Based Ontology Types
 *
 * Following the architecture from docs/effect_graph_implementation.md:
 * - Classes are nodes in the Graph
 * - Properties are data attached to class nodes (NOT graph nodes, to avoid cycles)
 * - Graph edges represent subClassOf relationships (Child -> Parent dependency)
 */

import type { HashMap } from "effect"
import { Schema } from "effect"

/**
 * NodeId - Unique identifier for graph nodes (typically IRI)
 */
export const NodeIdSchema = Schema.String
export type NodeId = typeof NodeIdSchema.Type

/**
 * PropertyData - Information attached to a ClassNode
 *
 * Properties are stored as data on their domain class, not as separate graph nodes.
 * This prevents cycles: if Property were a node, then
 *   Dog -> hasOwner (domain) and hasOwner -> Dog (creates cycle)
 */
export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  range: Schema.String // IRI or datatype - stored as string reference (not graph edge)
})
export type PropertyData = typeof PropertyDataSchema.Type

/**
 * ClassNode - A node representing an OWL Class
 */
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  _tag: Schema.Literal("Class").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Class" as const,
      decoding: () => "Class" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String,
  properties: Schema.Array(PropertyDataSchema)
}) {}

/**
 * PropertyNode - A separate node for properties (optional, for flexibility)
 *
 * In the main graph, properties are attached to ClassNode.
 * This type exists for cases where we need to treat properties as first-class entities.
 */
export class PropertyNode extends Schema.Class<PropertyNode>("PropertyNode")({
  _tag: Schema.Literal("Property").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Property" as const,
      decoding: () => "Property" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String,
  domain: NodeIdSchema, // Class IRI reference
  range: Schema.String, // IRI or datatype
  functional: Schema.Boolean
}) {}

/**
 * OntologyNode - Discriminated union of all node types
 */
export const OntologyNodeSchema = Schema.Union(ClassNode, PropertyNode)
export type OntologyNode = typeof OntologyNodeSchema.Type

/**
 * OntologyContext - The data store mapping NodeId to Node data
 *
 * The Graph structure (Effect.Graph) holds relationships.
 * This context holds the actual data for each node.
 */
export interface OntologyContext {
  readonly nodes: HashMap.HashMap<NodeId, OntologyNode>
  /**
   * Universal Properties - Properties without explicit rdfs:domain
   *
   * These are domain-agnostic properties (e.g., Dublin Core metadata)
   * that can apply to any resource. Kept separate from the graph to:
   * - Avoid token bloat (not repeated on every class)
   * - Maintain graph hygiene (strict dependencies only)
   * - Improve LLM comprehension (global context)
   */
  readonly universalProperties: ReadonlyArray<PropertyData>
  /**
   * Mapping from NodeId (IRI) to Graph NodeIndex (number)
   * Needed because Effect.Graph uses numeric indices internally
   */
  readonly nodeIndexMap: HashMap.HashMap<NodeId, number>
}

================
File: packages/core/src/inspect.ts
================
/**
 * CLI tool to inspect parsed ontologies
 *
 * Usage: bun run src/inspect.ts <path-to-turtle-file>
 */

import { Console, Effect, Graph, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { parseTurtleToGraph } from "./Graph/Builder.js"

const inspectOntology = (turtlePath: string) =>
  Effect.gen(function*() {
    // Read the turtle file
    const turtleContent = readFileSync(turtlePath, "utf-8")

    yield* Console.log(`\n📋 Parsing ontology from: ${turtlePath}\n`)

    // Parse to graph
    const { context, graph } = yield* parseTurtleToGraph(turtleContent)

    // Display statistics
    const nodeCount = HashMap.size(context.nodes)
    yield* Console.log(`📊 Statistics:`)
    yield* Console.log(`  - Classes: ${nodeCount}`)
    yield* Console.log(`  - Graph nodes: ${nodeCount}`)

    // Count total scoped properties (attached to classes)
    let scopedProps = 0
    for (const [_id, node] of context.nodes) {
      if (node._tag === "Class") {
        scopedProps += node.properties.length
      }
    }
    yield* Console.log(`  - Domain-scoped properties: ${scopedProps}`)
    yield* Console.log(`  - Universal properties: ${context.universalProperties.length}`)

    // Display class hierarchy
    yield* Console.log(`\n🏗️  Class Hierarchy (topological order):`)
    const sortedClasses: Array<string> = []
    for (const [_idx, nodeId] of Graph.topo(graph)) {
      sortedClasses.push(nodeId)
    }

    for (const classId of sortedClasses) {
      const nodeOption = HashMap.get(context.nodes, classId)
      if (nodeOption._tag === "Some" && nodeOption.value._tag === "Class") {
        const node = nodeOption.value
        const indent = "  "
        yield* Console.log(`${indent}${node.label} (${node.properties.length} properties)`)

        // Show properties
        if (node.properties.length > 0) {
          for (const prop of node.properties) {
            const rangeLabel = prop.range.split("#").pop() || prop.range.split("/").pop() || prop.range
            yield* Console.log(`${indent}  - ${prop.label}: ${rangeLabel}`)
          }
        }
      }
    }

    // Display universal properties (domain-agnostic)
    if (context.universalProperties.length > 0) {
      yield* Console.log(`\n🌐 Universal Properties (no explicit domain):`)
      for (const prop of context.universalProperties) {
        const rangeLabel = prop.range.split("#").pop() || prop.range.split("/").pop() || prop.range
        yield* Console.log(`  - ${prop.label}: ${rangeLabel}`)
      }
    }

    yield* Console.log(`\n✅ Parsing complete!\n`)
  })

// Main execution
const main = Effect.gen(function*() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    yield* Console.error("Usage: bun run src/inspect.ts <path-to-turtle-file>")
    return yield* Effect.fail(new Error("Missing file path"))
  }

  const turtlePath = args[0]
  yield* inspectOntology(turtlePath)
})

Effect.runPromise(main).catch(console.error)

================
File: packages/core/src/Program.ts
================
import * as Effect from "effect/Effect"

Effect.runPromise(Effect.log("Hello, World!"))

================
File: packages/core/test/Graph/Builder.test.ts
================
import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"

describe("Graph Builder", () => {
  const zooTurtle = readFileSync("test-data/zoo.ttl", "utf-8")
  const organizationTurtle = readFileSync("test-data/organization.ttl", "utf-8")
  const dctermsTurtle = readFileSync("test-data/dcterms.ttl", "utf-8")
  const foafTurtle = readFileSync("test-data/foaf.ttl", "utf-8")

  it.effect("parses classes from zoo.ttl", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Should have nodes for all classes
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Animal")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Mammal")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Pet")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Dog")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Cat")).toBe(true)
    }))

  it.effect("parses class labels correctly", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Use Option.match for cleaner code
      const dogLabel = Option.match(HashMap.get(result.context.nodes, "http://example.org/zoo#Dog"), {
        onNone: () => null,
        onSome: (node) => node._tag === "Class" ? node.label : null
      })
      expect(dogLabel).toBe("Dog")

      const animalLabel = Option.match(HashMap.get(result.context.nodes, "http://example.org/zoo#Animal"), {
        onNone: () => null,
        onSome: (node) => node._tag === "Class" ? node.label : null
      })
      expect(animalLabel).toBe("Animal")
    }))

  it.effect("creates graph edges for subClassOf relationships", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Dog subClassOf Mammal -> edge from Dog to Mammal
      const dogIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Dog")
      expect(dogIdxOption._tag).toBe("Some")
      const dogIdx = dogIdxOption._tag === "Some" ? dogIdxOption.value : 0
      const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

      const mammalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Mammal")
      const mammalIdx = mammalIdxOption._tag === "Some" ? mammalIdxOption.value : 0
      const petIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Pet")
      const petIdx = petIdxOption._tag === "Some" ? petIdxOption.value : 0

      expect(dogNeighbors).toContain(mammalIdx)
      expect(dogNeighbors).toContain(petIdx)

      // Mammal subClassOf Animal -> edge from Mammal to Animal
      const mammalNeighbors = Graph.neighbors(result.graph, mammalIdx)
      const animalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Animal")
      const animalIdx = animalIdxOption._tag === "Some" ? animalIdxOption.value : 0
      expect(mammalNeighbors).toContain(animalIdx)
    }))

  it.effect("attaches properties to domain classes", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      const animalNodeOption = HashMap.get(result.context.nodes, "http://example.org/zoo#Animal")
      expect(animalNodeOption._tag).toBe("Some")

      if (animalNodeOption._tag === "Some") {
        const animalNode = animalNodeOption.value
        if (animalNode._tag === "Class") {
          // hasName has domain Animal
          const hasNameProp = animalNode.properties.find(
            (p) => p.iri === "http://example.org/zoo#hasName"
          )
          expect(hasNameProp).toBeDefined()
          expect(hasNameProp?.label).toBe("has name")
          expect(hasNameProp?.range).toBe("http://www.w3.org/2001/XMLSchema#string")
        }
      }

      const petNodeOption = HashMap.get(result.context.nodes, "http://example.org/zoo#Pet")
      if (petNodeOption._tag === "Some") {
        const petNode = petNodeOption.value
        if (petNode._tag === "Class") {
          // ownedBy has domain Pet
          const ownedByProp = petNode.properties.find(
            (p) => p.iri === "http://example.org/zoo#ownedBy"
          )
          expect(ownedByProp).toBeDefined()
          expect(ownedByProp?.label).toBe("owned by")
        }
      }
    }))

  it.effect("handles poly-hierarchy (multiple inheritance)", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Dog has two parents: Mammal and Pet
      const dogIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Dog")
      const dogIdx = dogIdxOption._tag === "Some" ? dogIdxOption.value : 0
      const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

      const mammalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Mammal")
      const mammalIdx = mammalIdxOption._tag === "Some" ? mammalIdxOption.value : 0
      const petIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Pet")
      const petIdx = petIdxOption._tag === "Some" ? petIdxOption.value : 0

      expect(dogNeighbors).toHaveLength(2)
      expect(dogNeighbors).toContain(mammalIdx)
      expect(dogNeighbors).toContain(petIdx)

      // Cat also has two parents
      const catIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Cat")
      const catIdx = catIdxOption._tag === "Some" ? catIdxOption.value : 0
      const catNeighbors = Graph.neighbors(result.graph, catIdx)

      expect(catNeighbors).toHaveLength(2)
      expect(catNeighbors).toContain(mammalIdx)
      expect(catNeighbors).toContain(petIdx)
    }))

  it.effect("topological sort processes children before parents", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Verify graph is acyclic (required for topological sort)
      expect(Graph.isAcyclic(result.graph)).toBe(true)

      // Get topological order
      // Graph.topo() yields [nodeIndex, nodeData] tuples
      const sortedIds: Array<string> = []
      for (const [_nodeIdx, nodeData] of Graph.topo(result.graph)) {
        sortedIds.push(nodeData)
      }

      // Verify all nodes are in the sort
      expect(sortedIds.length).toBe(5) // Should have all 5 classes

      // Find positions
      const dogIdx = sortedIds.indexOf("http://example.org/zoo#Dog")
      const mammalIdx = sortedIds.indexOf("http://example.org/zoo#Mammal")
      const animalIdx = sortedIds.indexOf("http://example.org/zoo#Animal")

      // All nodes should be in sorted output
      expect(dogIdx).toBeGreaterThanOrEqual(0)
      expect(mammalIdx).toBeGreaterThanOrEqual(0)
      expect(animalIdx).toBeGreaterThanOrEqual(0)

      // Dog should come before Mammal (child before parent)
      expect(dogIdx).toBeLessThan(mammalIdx)

      // Mammal should come before Animal
      expect(mammalIdx).toBeLessThan(animalIdx)
    }))

  describe("Complex Organization Ontology", () => {
    it.effect("parses all organization classes", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // Verify all classes exist
        const expectedClasses = [
          "http://example.org/org#Organization",
          "http://example.org/org#Company",
          "http://example.org/org#NonProfit",
          "http://example.org/org#StartupCompany",
          "http://example.org/org#Person",
          "http://example.org/org#Employee",
          "http://example.org/org#Manager",
          "http://example.org/org#Address"
        ]

        for (const classIri of expectedClasses) {
          expect(HashMap.has(result.context.nodes, classIri)).toBe(true)
        }
      }))

    it.effect("creates correct inheritance hierarchy", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // StartupCompany -> Company -> Organization (2-level hierarchy)
        const startupIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#StartupCompany")
        )
        const companyIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#Company")
        )
        const orgIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#Organization")
        )

        const startupNeighbors = Graph.neighbors(result.graph, startupIdx)
        expect(startupNeighbors).toContain(companyIdx)

        const companyNeighbors = Graph.neighbors(result.graph, companyIdx)
        expect(companyNeighbors).toContain(orgIdx)
      }))

    it.effect("attaches properties to correct domain classes", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // Organization should have hasName, foundedDate, hasAddress, hasEmployee
        const orgNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Organization")
        )
        if (orgNode._tag === "Class") {
          const propLabels = orgNode.properties.map((p) => p.label)
          expect(propLabels).toContain("has name")
          expect(propLabels).toContain("founded date")
          expect(propLabels).toContain("has address")
          expect(propLabels).toContain("has employee")
        }

        // Company should have stockSymbol and revenue (in addition to inherited)
        const companyNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Company")
        )
        if (companyNode._tag === "Class") {
          const propLabels = companyNode.properties.map((p) => p.label)
          expect(propLabels).toContain("stock symbol")
          expect(propLabels).toContain("revenue")
        }

        // Manager should have manages property
        const managerNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Manager")
        )
        if (managerNode._tag === "Class") {
          const managesProp = managerNode.properties.find((p) => p.label === "manages")
          expect(managesProp).toBeDefined()
          expect(managesProp?.range).toBe("http://example.org/org#Employee")
        }
      }))

    it.effect("handles object properties with correct ranges", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        const orgNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Organization")
        )
        if (orgNode._tag === "Class") {
          // hasAddress should point to Address class
          const hasAddressProp = orgNode.properties.find((p) => p.label === "has address")
          expect(hasAddressProp?.range).toBe("http://example.org/org#Address")

          // hasEmployee should point to Employee class
          const hasEmployeeProp = orgNode.properties.find((p) => p.label === "has employee")
          expect(hasEmployeeProp?.range).toBe("http://example.org/org#Employee")
        }
      }))

    it.effect("correctly orders classes in topological sort", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        expect(Graph.isAcyclic(result.graph)).toBe(true)

        const sortedIds: Array<string> = []
        for (const [_idx, nodeData] of Graph.topo(result.graph)) {
          sortedIds.push(nodeData)
        }

        // StartupCompany should come before Company
        const startupIdx = sortedIds.indexOf("http://example.org/org#StartupCompany")
        const companyIdx = sortedIds.indexOf("http://example.org/org#Company")
        const orgIdx = sortedIds.indexOf("http://example.org/org#Organization")

        expect(startupIdx).toBeLessThan(companyIdx)
        expect(companyIdx).toBeLessThan(orgIdx)

        // Manager should come before Employee
        const managerIdx = sortedIds.indexOf("http://example.org/org#Manager")
        const employeeIdx = sortedIds.indexOf("http://example.org/org#Employee")
        const personIdx = sortedIds.indexOf("http://example.org/org#Person")

        expect(managerIdx).toBeLessThan(employeeIdx)
        expect(employeeIdx).toBeLessThan(personIdx)
      }))
  })

  describe("Universal Properties (Domain-Agnostic)", () => {
    it.effect("collects properties without domains as universal properties", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Dublin Core has no domain-scoped properties
        let scopedPropCount = 0
        for (const [_id, node] of result.context.nodes) {
          if (node._tag === "Class") {
            scopedPropCount += node.properties.length
          }
        }
        expect(scopedPropCount).toBe(0)

        // All properties should be universal
        expect(result.context.universalProperties.length).toBeGreaterThan(30)

        // Check some key Dublin Core properties are present
        const propLabels = result.context.universalProperties.map((p) => p.label)
        expect(propLabels).toContain("Title")
        expect(propLabels).toContain("Creator")
        expect(propLabels).toContain("Description")
        expect(propLabels).toContain("Date Created")
      }))

    it.effect("FOAF has domain-scoped properties, not universal", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(foafTurtle)

        // FOAF has explicit domains, so should have 0 universal properties
        expect(result.context.universalProperties.length).toBe(0)

        // All properties should be scoped to classes
        let totalProps = 0
        for (const [_id, node] of result.context.nodes) {
          if (node._tag === "Class") {
            totalProps += node.properties.length
          }
        }
        expect(totalProps).toBeGreaterThan(20)
      }))

    it.effect("universal properties have correct ranges", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Find creator property
        const creatorProp = result.context.universalProperties.find(
          (p) => p.label === "Creator"
        )
        expect(creatorProp).toBeDefined()
        expect(creatorProp?.range).toBe("http://purl.org/dc/terms/Agent")

        // Find title property
        const titleProp = result.context.universalProperties.find(
          (p) => p.label === "Title"
        )
        expect(titleProp).toBeDefined()
        expect(titleProp?.range).toBe("http://www.w3.org/2001/XMLSchema#string")
      }))

    it.effect("classes are still parsed even with no scoped properties", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Should still have all classes
        expect(HashMap.size(result.context.nodes)).toBeGreaterThan(20)

        // Classes should exist
        expect(HashMap.has(result.context.nodes, "http://purl.org/dc/terms/Agent")).toBe(true)
        expect(HashMap.has(result.context.nodes, "http://purl.org/dc/terms/BibliographicResource")).toBe(
          true
        )
      }))
  })
})

================
File: packages/core/test/Graph/Types.test.ts
================
import { describe, expect, it } from "@effect/vitest"
import type { ClassNode, OntologyNode, PropertyNode } from "../../src/Graph/Types.js"

describe("Graph Types", () => {
  it("ClassNode has required fields", () => {
    const classNode: ClassNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Dog",
      label: "Dog",
      properties: []
    }

    expect(classNode._tag).toBe("Class")
    expect(classNode.id).toBe("http://example.org/zoo#Dog")
    expect(classNode.label).toBe("Dog")
    expect(classNode.properties).toEqual([])
  })

  it("ClassNode can have properties", () => {
    const classNode: ClassNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Animal",
      label: "Animal",
      properties: [
        {
          iri: "http://example.org/zoo#hasName",
          label: "has name",
          range: "http://www.w3.org/2001/XMLSchema#string"
        }
      ]
    }

    expect(classNode.properties).toHaveLength(1)
    expect(classNode.properties[0].iri).toBe("http://example.org/zoo#hasName")
  })

  it("PropertyNode has required fields", () => {
    const propNode: PropertyNode = {
      _tag: "Property",
      id: "http://example.org/zoo#hasName",
      label: "has name",
      domain: "http://example.org/zoo#Animal",
      range: "http://www.w3.org/2001/XMLSchema#string",
      functional: false
    }

    expect(propNode._tag).toBe("Property")
    expect(propNode.domain).toBe("http://example.org/zoo#Animal")
    expect(propNode.range).toBe("http://www.w3.org/2001/XMLSchema#string")
    expect(propNode.functional).toBe(false)
  })

  it("OntologyNode discriminated union", () => {
    const classNode: OntologyNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Dog",
      label: "Dog",
      properties: []
    }

    const propNode: OntologyNode = {
      _tag: "Property",
      id: "http://example.org/zoo#hasName",
      label: "has name",
      domain: "http://example.org/zoo#Animal",
      range: "http://www.w3.org/2001/XMLSchema#string",
      functional: false
    }

    // Type narrowing works
    if (classNode._tag === "Class") {
      expect(classNode.properties).toBeDefined()
    }

    if (propNode._tag === "Property") {
      expect(propNode.domain).toBeDefined()
    }
  })
})

================
File: packages/core/test/Dummy.test.ts
================
import { describe, expect, it } from "@effect/vitest"

describe("Dummy", () => {
  it("should pass", () => {
    expect(true).toBe(true)
  })
})

================
File: packages/core/test-data/dcterms.ttl
================
@prefix : <http://purl.org/dc/terms/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Dublin Core Metadata Terms (DCMI) - Subset
# Based on https://www.dublincore.org/specifications/dublin-core/dcmi-terms/

### Resource Types (Classes)

:BibliographicResource a owl:Class ;
    rdfs:label "Bibliographic Resource" ;
    rdfs:comment "A book, article, or other documentary resource." .

:Collection a owl:Class ;
    rdfs:label "Collection" ;
    rdfs:comment "An aggregation of resources." .

:Dataset a owl:Class ;
    rdfs:label "Dataset" ;
    rdfs:comment "Data encoded in a defined structure." .

:Event a owl:Class ;
    rdfs:label "Event" ;
    rdfs:comment "A non-persistent, time-based occurrence." .

:Image a owl:Class ;
    rdfs:label "Image" ;
    rdfs:comment "A visual representation other than text." .

:InteractiveResource a owl:Class ;
    rdfs:label "Interactive Resource" ;
    rdfs:comment "A resource requiring interaction from the user to be understood." .

:MovingImage a owl:Class ;
    rdfs:subClassOf :Image ;
    rdfs:label "Moving Image" ;
    rdfs:comment "A series of visual representations imparting an impression of motion when shown in succession." .

:PhysicalObject a owl:Class ;
    rdfs:label "Physical Object" ;
    rdfs:comment "An inanimate, three-dimensional object or substance." .

:Service a owl:Class ;
    rdfs:label "Service" ;
    rdfs:comment "A system that provides one or more functions." .

:Software a owl:Class ;
    rdfs:label "Software" ;
    rdfs:comment "A computer program in source or compiled form." .

:Sound a owl:Class ;
    rdfs:label "Sound" ;
    rdfs:comment "A resource primarily intended to be heard." .

:StillImage a owl:Class ;
    rdfs:subClassOf :Image ;
    rdfs:label "Still Image" ;
    rdfs:comment "A static visual representation." .

:Text a owl:Class ;
    rdfs:label "Text" ;
    rdfs:comment "A resource consisting primarily of words for reading." .

### Agent Classes

:Agent a owl:Class ;
    rdfs:label "Agent" ;
    rdfs:comment "A resource that acts or has the power to act." .

:AgentClass a owl:Class ;
    rdfs:label "Agent Class" ;
    rdfs:comment "A group of agents." .

:Person a owl:Class ;
    rdfs:subClassOf :Agent ;
    rdfs:label "Person" ;
    rdfs:comment "An individual person." .

:Organization a owl:Class ;
    rdfs:subClassOf :Agent ;
    rdfs:label "Organization" ;
    rdfs:comment "A social or legal structure formed by human beings." .

### Location and Jurisdiction Classes

:Location a owl:Class ;
    rdfs:label "Location" ;
    rdfs:comment "A spatial region or named place." .

:LocationPeriodOrJurisdiction a owl:Class ;
    rdfs:label "Location, Period, or Jurisdiction" ;
    rdfs:comment "A location, period of time, or jurisdiction." .

:Jurisdiction a owl:Class ;
    rdfs:subClassOf :LocationPeriodOrJurisdiction ;
    rdfs:label "Jurisdiction" ;
    rdfs:comment "The extent or range of judicial, law enforcement, or other authority." .

### Time Classes

:PeriodOfTime a owl:Class ;
    rdfs:label "Period of Time" ;
    rdfs:comment "An interval of time that is named or defined by its start and end dates." .

### Core Metadata Properties

# Title and Description
:title a owl:DatatypeProperty ;
    rdfs:label "Title" ;
    rdfs:comment "A name given to the resource." ;
    rdfs:range xsd:string .

:description a owl:DatatypeProperty ;
    rdfs:label "Description" ;
    rdfs:comment "An account of the resource." ;
    rdfs:range xsd:string .

:abstract a owl:DatatypeProperty ;
    rdfs:subPropertyOf :description ;
    rdfs:label "Abstract" ;
    rdfs:comment "A summary of the resource." ;
    rdfs:range xsd:string .

:alternative a owl:DatatypeProperty ;
    rdfs:subPropertyOf :title ;
    rdfs:label "Alternative Title" ;
    rdfs:comment "An alternative name for the resource." ;
    rdfs:range xsd:string .

# Creator and Contributors
:creator a owl:ObjectProperty ;
    rdfs:label "Creator" ;
    rdfs:comment "An entity responsible for making the resource." ;
    rdfs:range :Agent .

:contributor a owl:ObjectProperty ;
    rdfs:label "Contributor" ;
    rdfs:comment "An entity responsible for making contributions to the resource." ;
    rdfs:range :Agent .

:publisher a owl:ObjectProperty ;
    rdfs:label "Publisher" ;
    rdfs:comment "An entity responsible for making the resource available." ;
    rdfs:range :Agent .

:rightsHolder a owl:ObjectProperty ;
    rdfs:label "Rights Holder" ;
    rdfs:comment "A person or organization owning or managing rights over the resource." ;
    rdfs:range :Agent .

# Dates
:created a owl:DatatypeProperty ;
    rdfs:label "Date Created" ;
    rdfs:comment "Date of creation of the resource." ;
    rdfs:range xsd:date .

:modified a owl:DatatypeProperty ;
    rdfs:label "Date Modified" ;
    rdfs:comment "Date on which the resource was changed." ;
    rdfs:range xsd:date .

:issued a owl:DatatypeProperty ;
    rdfs:label "Date Issued" ;
    rdfs:comment "Date of formal issuance of the resource." ;
    rdfs:range xsd:date .

:valid a owl:DatatypeProperty ;
    rdfs:label "Date Valid" ;
    rdfs:comment "Date (often a range) of validity of a resource." ;
    rdfs:range xsd:string .

:available a owl:DatatypeProperty ;
    rdfs:label "Date Available" ;
    rdfs:comment "Date that the resource became or will become available." ;
    rdfs:range xsd:date .

# Subject and Coverage
:subject a owl:ObjectProperty ;
    rdfs:label "Subject" ;
    rdfs:comment "A topic of the resource." .

:coverage a owl:ObjectProperty ;
    rdfs:label "Coverage" ;
    rdfs:comment "The spatial or temporal topic of the resource." ;
    rdfs:range :LocationPeriodOrJurisdiction .

:spatial a owl:ObjectProperty ;
    rdfs:subPropertyOf :coverage ;
    rdfs:label "Spatial Coverage" ;
    rdfs:comment "Spatial characteristics of the resource." ;
    rdfs:range :Location .

:temporal a owl:ObjectProperty ;
    rdfs:subPropertyOf :coverage ;
    rdfs:label "Temporal Coverage" ;
    rdfs:comment "Temporal characteristics of the resource." ;
    rdfs:range :PeriodOfTime .

# Type and Format
:type a owl:ObjectProperty ;
    rdfs:label "Type" ;
    rdfs:comment "The nature or genre of the resource." .

:format a owl:DatatypeProperty ;
    rdfs:label "Format" ;
    rdfs:comment "The file format, physical medium, or dimensions of the resource." ;
    rdfs:range xsd:string .

:extent a owl:DatatypeProperty ;
    rdfs:label "Extent" ;
    rdfs:comment "The size or duration of the resource." ;
    rdfs:range xsd:string .

:medium a owl:ObjectProperty ;
    rdfs:label "Medium" ;
    rdfs:comment "The material or physical carrier of the resource." ;
    rdfs:range :PhysicalObject .

# Identifiers
:identifier a owl:DatatypeProperty ;
    rdfs:label "Identifier" ;
    rdfs:comment "An unambiguous reference to the resource within a given context." ;
    rdfs:range xsd:string .

:bibliographicCitation a owl:DatatypeProperty ;
    rdfs:label "Bibliographic Citation" ;
    rdfs:comment "A bibliographic reference for the resource." ;
    rdfs:range xsd:string .

# Relations
:relation a owl:ObjectProperty ;
    rdfs:label "Relation" ;
    rdfs:comment "A related resource." .

:isPartOf a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "Is Part Of" ;
    rdfs:comment "A related resource in which the described resource is physically or logically included." ;
    rdfs:range :Collection .

:hasPart a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "Has Part" ;
    rdfs:comment "A related resource that is included either physically or logically in the described resource." .

:isVersionOf a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "Is Version Of" ;
    rdfs:comment "A related resource of which the described resource is a version, edition, or adaptation." .

:hasVersion a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "Has Version" ;
    rdfs:comment "A related resource that is a version, edition, or adaptation of the described resource." .

:isReferencedBy a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "Is Referenced By" ;
    rdfs:comment "A related resource that references, cites, or otherwise points to the described resource." .

:references a owl:ObjectProperty ;
    rdfs:subPropertyOf :relation ;
    rdfs:label "References" ;
    rdfs:comment "A related resource that is referenced, cited, or otherwise pointed to by the described resource." .

# Language and Audience
:language a owl:DatatypeProperty ;
    rdfs:label "Language" ;
    rdfs:comment "A language of the resource." ;
    rdfs:range xsd:string .

:audience a owl:ObjectProperty ;
    rdfs:label "Audience" ;
    rdfs:comment "A class of agents for whom the resource is intended or useful." ;
    rdfs:range :AgentClass .

:educationLevel a owl:ObjectProperty ;
    rdfs:label "Audience Education Level" ;
    rdfs:comment "A class of agents, defined in terms of progression through an educational or training context." ;
    rdfs:range :AgentClass .

# Rights
:rights a owl:DatatypeProperty ;
    rdfs:label "Rights" ;
    rdfs:comment "Information about rights held in and over the resource." ;
    rdfs:range xsd:string .

:license a owl:ObjectProperty ;
    rdfs:label "License" ;
    rdfs:comment "A legal document giving official permission to do something with the resource." .

:accessRights a owl:DatatypeProperty ;
    rdfs:label "Access Rights" ;
    rdfs:comment "Information about who access the resource or an indication of its security status." ;
    rdfs:range xsd:string .

# Source and Provenance
:source a owl:ObjectProperty ;
    rdfs:label "Source" ;
    rdfs:comment "A related resource from which the described resource is derived." .

:provenance a owl:DatatypeProperty ;
    rdfs:label "Provenance" ;
    rdfs:comment "A statement of any changes in ownership and custody of the resource." ;
    rdfs:range xsd:string .

================
File: packages/core/test-data/foaf.ttl
================
@prefix : <http://xmlns.com/foaf/0.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

# FOAF (Friend of a Friend) Ontology Subset
# Based on http://xmlns.com/foaf/spec/

### Core Classes

:Agent a owl:Class ;
    rdfs:label "Agent" ;
    rdfs:comment "An agent (eg. person, group, software or physical artifact)." .

:Person a owl:Class ;
    rdfs:subClassOf :Agent ;
    rdfs:label "Person" ;
    rdfs:comment "A person." .

:Organization a owl:Class ;
    rdfs:subClassOf :Agent ;
    rdfs:label "Organization" ;
    rdfs:comment "An organization." .

:Group a owl:Class ;
    rdfs:subClassOf :Agent ;
    rdfs:label "Group" ;
    rdfs:comment "A class of Agents." .

:Project a owl:Class ;
    rdfs:label "Project" ;
    rdfs:comment "A project (a collective endeavour of some kind)." .

:Document a owl:Class ;
    rdfs:label "Document" ;
    rdfs:comment "A document." .

:Image a owl:Class ;
    rdfs:subClassOf :Document ;
    rdfs:label "Image" ;
    rdfs:comment "An image." .

:OnlineAccount a owl:Class ;
    rdfs:label "Online Account" ;
    rdfs:comment "An online account." .

:PersonalProfileDocument a owl:Class ;
    rdfs:subClassOf :Document ;
    rdfs:label "Personal Profile Document" ;
    rdfs:comment "A personal profile RDF document." .

### Person Properties

:name a owl:DatatypeProperty ;
    rdfs:domain :Agent ;
    rdfs:range xsd:string ;
    rdfs:label "name" ;
    rdfs:comment "A name for some thing." .

:title a owl:DatatypeProperty ;
    rdfs:domain :Agent ;
    rdfs:range xsd:string ;
    rdfs:label "title" ;
    rdfs:comment "Title (Mr, Mrs, Ms, Dr. etc)" .

:firstName a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "firstName" ;
    rdfs:comment "The first name of a person." .

:lastName a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "lastName" ;
    rdfs:comment "The last name of a person." .

:nick a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "nickname" ;
    rdfs:comment "A short informal nickname characterising an agent." .

:mbox a owl:ObjectProperty ;
    rdfs:domain :Agent ;
    rdfs:label "personal mailbox" ;
    rdfs:comment "A personal mailbox, ie. an Internet mailbox associated with exactly one owner." .

:homepage a owl:ObjectProperty ;
    rdfs:domain :Agent ;
    rdfs:range :Document ;
    rdfs:label "homepage" ;
    rdfs:comment "A homepage for some thing." .

:weblog a owl:ObjectProperty ;
    rdfs:domain :Agent ;
    rdfs:range :Document ;
    rdfs:label "weblog" ;
    rdfs:comment "A weblog of some thing (whether person, group, company etc.)." .

:age a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:integer ;
    rdfs:label "age" ;
    rdfs:comment "The age in years of some agent." .

:birthday a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "birthday" ;
    rdfs:comment "The birthday of this Agent, represented in mm-dd string form." .

### Relationship Properties

:knows a owl:ObjectProperty ;
    rdfs:domain :Person ;
    rdfs:range :Person ;
    rdfs:label "knows" ;
    rdfs:comment "A person known by this person (indicating some level of reciprocated interaction)." .

:member a owl:ObjectProperty ;
    rdfs:domain :Agent ;
    rdfs:range :Group ;
    rdfs:label "member" ;
    rdfs:comment "Indicates a member of a Group" .

:membershipClass a owl:ObjectProperty ;
    rdfs:domain :Group ;
    rdfs:label "membershipClass" ;
    rdfs:comment "Indicates the class of individuals that are a member of a Group" .

### Online Presence

:account a owl:ObjectProperty ;
    rdfs:domain :Agent ;
    rdfs:range :OnlineAccount ;
    rdfs:label "account" ;
    rdfs:comment "Indicates an account held by this agent." .

:accountName a owl:DatatypeProperty ;
    rdfs:domain :OnlineAccount ;
    rdfs:range xsd:string ;
    rdfs:label "account name" ;
    rdfs:comment "Indicates the name (identifier) associated with this online account." .

### Work Related

:currentProject a owl:ObjectProperty ;
    rdfs:domain :Person ;
    rdfs:range :Project ;
    rdfs:label "current project" ;
    rdfs:comment "A current project this person works on." .

:pastProject a owl:ObjectProperty ;
    rdfs:domain :Person ;
    rdfs:range :Project ;
    rdfs:label "past project" ;
    rdfs:comment "A project this person has previously worked on." .

:workplaceHomepage a owl:ObjectProperty ;
    rdfs:domain :Person ;
    rdfs:range :Document ;
    rdfs:label "workplace homepage" ;
    rdfs:comment "A workplace homepage of some person." .

:workInfoHomepage a owl:ObjectProperty ;
    rdfs:domain :Person ;
    rdfs:range :Document ;
    rdfs:label "work info homepage" ;
    rdfs:comment "A work info homepage of some person." .

### Document Properties

:topic a owl:ObjectProperty ;
    rdfs:domain :Document ;
    rdfs:label "topic" ;
    rdfs:comment "A topic of some page or document." .

:primaryTopic a owl:ObjectProperty ;
    rdfs:domain :Document ;
    rdfs:label "primary topic" ;
    rdfs:comment "The primary topic of some page or document." .

:depicts a owl:ObjectProperty ;
    rdfs:domain :Image ;
    rdfs:label "depicts" ;
    rdfs:comment "A thing depicted in this representation." .

:thumbnail a owl:ObjectProperty ;
    rdfs:domain :Image ;
    rdfs:range :Image ;
    rdfs:label "thumbnail" ;
    rdfs:comment "A derived thumbnail image." .

### Organization Properties

:fundedBy a owl:ObjectProperty ;
    rdfs:domain :Project ;
    rdfs:range :Organization ;
    rdfs:label "funded by" ;
    rdfs:comment "An organization funding a project or person." .

================
File: packages/core/test-data/organization.ttl
================
@prefix : <http://example.org/org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Organization Ontology - More realistic example

### Classes

:Organization a owl:Class ;
    rdfs:label "Organization" ;
    rdfs:comment "A group of people organized for a particular purpose" .

:Company a owl:Class ;
    rdfs:subClassOf :Organization ;
    rdfs:label "Company" ;
    rdfs:comment "A commercial business" .

:NonProfit a owl:Class ;
    rdfs:subClassOf :Organization ;
    rdfs:label "NonProfit" ;
    rdfs:comment "A non-profit organization" .

:StartupCompany a owl:Class ;
    rdfs:subClassOf :Company ;
    rdfs:label "Startup Company" ;
    rdfs:comment "A newly established business" .

:Person a owl:Class ;
    rdfs:label "Person" ;
    rdfs:comment "An individual human being" .

:Employee a owl:Class ;
    rdfs:subClassOf :Person ;
    rdfs:label "Employee" ;
    rdfs:comment "A person employed by an organization" .

:Manager a owl:Class ;
    rdfs:subClassOf :Employee ;
    rdfs:label "Manager" ;
    rdfs:comment "An employee who manages others" .

:Address a owl:Class ;
    rdfs:label "Address" ;
    rdfs:comment "A physical location" .

### Properties

# Organization properties
:hasName a owl:DatatypeProperty ;
    rdfs:domain :Organization ;
    rdfs:range xsd:string ;
    rdfs:label "has name" ;
    rdfs:comment "The official name of the organization" .

:foundedDate a owl:DatatypeProperty ;
    rdfs:domain :Organization ;
    rdfs:range xsd:date ;
    rdfs:label "founded date" ;
    rdfs:comment "The date when the organization was founded" .

:hasAddress a owl:ObjectProperty ;
    rdfs:domain :Organization ;
    rdfs:range :Address ;
    rdfs:label "has address" ;
    rdfs:comment "The physical address of the organization" .

:hasEmployee a owl:ObjectProperty ;
    rdfs:domain :Organization ;
    rdfs:range :Employee ;
    rdfs:label "has employee" ;
    rdfs:comment "An employee of the organization" .

# Company-specific properties
:stockSymbol a owl:DatatypeProperty ;
    rdfs:domain :Company ;
    rdfs:range xsd:string ;
    rdfs:label "stock symbol" ;
    rdfs:comment "The stock ticker symbol" .

:revenue a owl:DatatypeProperty ;
    rdfs:domain :Company ;
    rdfs:range xsd:decimal ;
    rdfs:label "revenue" ;
    rdfs:comment "Annual revenue in USD" .

# Person properties
:firstName a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "first name" .

:lastName a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "last name" .

:email a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:range xsd:string ;
    rdfs:label "email" .

# Employee properties
:employeeId a owl:DatatypeProperty ;
    rdfs:domain :Employee ;
    rdfs:range xsd:string ;
    rdfs:label "employee ID" .

:worksFor a owl:ObjectProperty ;
    rdfs:domain :Employee ;
    rdfs:range :Organization ;
    rdfs:label "works for" ;
    rdfs:comment "The organization this person works for" .

# Manager properties
:manages a owl:ObjectProperty ;
    rdfs:domain :Manager ;
    rdfs:range :Employee ;
    rdfs:label "manages" ;
    rdfs:comment "Employees managed by this manager" .

# Address properties
:streetAddress a owl:DatatypeProperty ;
    rdfs:domain :Address ;
    rdfs:range xsd:string ;
    rdfs:label "street address" .

:city a owl:DatatypeProperty ;
    rdfs:domain :Address ;
    rdfs:range xsd:string ;
    rdfs:label "city" .

:postalCode a owl:DatatypeProperty ;
    rdfs:domain :Address ;
    rdfs:range xsd:string ;
    rdfs:label "postal code" .

================
File: packages/core/test-data/pet-ontology.ttl
================
@prefix : <http://example.org/pets#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Ontology declaration
: a owl:Ontology ;
    rdfs:label "Pet Ontology" ;
    rdfs:comment "A simple ontology for testing ontology population" .

# Classes
:Pet a owl:Class ;
    rdfs:label "Pet" ;
    rdfs:comment "An animal kept as a companion" .

:Dog a owl:Class ;
    rdfs:subClassOf :Pet ;
    rdfs:label "Dog" ;
    rdfs:comment "A domesticated canine" .

:Cat a owl:Class ;
    rdfs:subClassOf :Pet ;
    rdfs:label "Cat" ;
    rdfs:comment "A domesticated feline" .

:Person a owl:Class ;
    rdfs:label "Person" ;
    rdfs:comment "A human being" ;
    owl:disjointWith :Pet .

# Properties
:hasName a owl:DatatypeProperty ;
    rdfs:label "has name" ;
    rdfs:comment "The name of a pet or person" ;
    rdfs:domain [ a owl:Class ; owl:unionOf ( :Pet :Person ) ] ;
    rdfs:range xsd:string .

:hasOwner a owl:ObjectProperty ;
    rdfs:label "has owner" ;
    rdfs:comment "The person who owns a pet" ;
    rdfs:domain :Pet ;
    rdfs:range :Person ;
    owl:inverseOf :ownsPet .

:ownsPet a owl:ObjectProperty ;
    rdfs:label "owns pet" ;
    rdfs:comment "The pet owned by a person" ;
    rdfs:domain :Person ;
    rdfs:range :Pet ;
    owl:inverseOf :hasOwner .

:hasAge a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "has age" ;
    rdfs:comment "The age of a pet in years" ;
    rdfs:domain :Pet ;
    rdfs:range xsd:integer .

================
File: packages/core/test-data/zoo.ttl
================
@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Classes

:Animal a owl:Class ;
    rdfs:label "Animal" .

:Mammal a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Mammal" .

:Pet a owl:Class ;
    rdfs:label "Pet" .

# Poly-hierarchy: Dog is both a Mammal and a Pet
:Dog a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Dog" .

:Cat a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Cat" .

### Properties

# Simple attribute (Datatype Property)
:hasName a owl:DatatypeProperty ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string ;
    rdfs:label "has name" .

# Relationship (Object Property) - Points to another class
:ownedBy a owl:ObjectProperty ;
    rdfs:domain :Pet ;
    rdfs:range :Person ;
    rdfs:label "owned by" .

================
File: packages/core/package.json
================
{
  "name": "@effect-ontology/core",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "exports": {
    "./Graph/Builder": "./src/Graph/Builder.ts",
    "./Graph/Types": "./src/Graph/Types.ts"
  },
  "scripts": {
    "test": "vitest",
    "check": "tsc -b tsconfig.json"
  },
  "dependencies": {
    "@effect/typeclass": "^0.38.0",
    "effect": "^3.17.7",
    "n3": "^1.26.0"
  },
  "devDependencies": {
    "@effect/vitest": "^0.25.1",
    "@types/n3": "^1.26.1",
    "@types/node": "^22.5.2",
    "typescript": "^5.6.2",
    "vitest": "^3.2.0"
  }
}

================
File: packages/core/tsconfig.json
================
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "composite": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}

================
File: packages/ui/.github/workflows/check.yml
================
name: Check

on:
  workflow_dispatch:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm codegen
      - name: Check source state
        run: git add src && git diff-index --cached HEAD --exit-code src

  types:
    name: Types
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm lint

  test:
    name: Test 
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - run: pnpm test

================
File: packages/ui/.github/workflows/snapshot.yml
================
name: Snapshot

on:
  pull_request:
    branches: [main, next-minor, next-major]
  workflow_dispatch:

permissions: {}

jobs:
  snapshot:
    name: Snapshot
    if: github.repository_owner == 'Effect-Ts'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        uses: ./.github/actions/setup
      - name: Build package
        run: pnpm build
      - name: Create snapshot
        id: snapshot
        run: pnpx pkg-pr-new@0.0.24 publish --pnpm --comment=off

================
File: packages/ui/src/components/NodeInspector.tsx
================
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { ontologyGraphAtom, selectedNodeAtom } from "../state/store"

export const NodeInspector = (): React.ReactElement | null => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const selectedNode = useAtomValue(selectedNodeAtom)

  // Handle no selection first
  if (Option.isNone(selectedNode)) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-2">👆</div>
          <div className="text-sm">Select a node to inspect</div>
        </div>
      </div>
    )
  }

  // Handle graph Result states
  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    ),
    onFailure: () => null,
    onSuccess: (graphSuccess) => {
      const { context } = graphSuccess.value
      const nodeOption = HashMap.get(context.nodes, selectedNode.value)

      if (nodeOption._tag !== "Some") {
        return (
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-red-500 text-sm">Node not found</div>
          </div>
        )
      }

      const node = nodeOption.value
      if (node._tag !== "Class") {
        return (
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-slate-400 text-sm">Not a class node</div>
          </div>
        )
      }

      return (
        <div className="h-full bg-white overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{node.label}</h3>
              <div className="text-xs font-mono text-slate-500 break-all">{node.id}</div>
            </div>

            {/* Properties Section */}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">
                  Properties ({node.properties.length})
                </h4>

                {node.properties.length === 0 ? (
                  <div className="text-sm text-slate-400 italic">No properties defined</div>
                ) : (
                  <div className="space-y-3">
                    {node.properties.map((prop, idx) => {
                      const rangeLabel =
                        prop.range.split("#").pop() ||
                        prop.range.split("/").pop() ||
                        prop.range

                      return (
                        <div
                          key={idx}
                          className="border border-slate-200 rounded p-3 hover:border-blue-300 transition-colors"
                        >
                          <div className="font-semibold text-slate-900 mb-1">{prop.label}</div>
                          <div className="text-xs text-slate-500 mb-1">Range: {rangeLabel}</div>
                          <div className="text-xs font-mono text-slate-400 break-all">
                            {prop.iri}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }
  })
}

================
File: packages/ui/src/components/TopologicalRail.tsx
================
import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react"
import { HashMap, Option } from "effect"
import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import { ontologyGraphAtom, selectedNodeAtom, topologicalOrderAtom } from "../state/store"

export const TopologicalRail = (): React.ReactElement => {
  const graphResult = useAtomValue(ontologyGraphAtom) as Result.Result<ParsedOntologyGraph, any>
  const topologicalOrderResult = useAtomValue(topologicalOrderAtom) as Result.Result<string[], any>
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom)

  return Result.match(graphResult, {
    onInitial: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading ontology...</div>
      </div>
    ),
    onFailure: (failure) => (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">
          Error parsing ontology: {String(failure.cause)}
        </div>
      </div>
    ),
    onSuccess: (graphSuccess) => {
      const { context } = graphSuccess.value

      return Result.match(topologicalOrderResult, {
        onInitial: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400 text-sm">Computing topology...</div>
          </div>
        ),
        onFailure: () => (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 text-sm">Error computing topology</div>
          </div>
        ),
        onSuccess: (topoSuccess) => {
          const topologicalOrder = topoSuccess.value

          return (
            <div className="flex flex-col h-full bg-slate-50">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Topological Order
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Classes ordered by dependency (children → parents)
                </p>
              </div>

              <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
                <div className="flex items-center space-x-8 min-w-max">
                  {topologicalOrder.map((nodeId, index) => {
                    const nodeOption = HashMap.get(context.nodes, nodeId)
                    if (nodeOption._tag !== "Some") return null

                    const node = nodeOption.value
                    if (node._tag !== "Class") return null

                    const isSelected =
                      Option.isSome(selectedNode) && selectedNode.value === nodeId

                    return (
                      <div key={nodeId} className="relative group flex items-center">
                        {/* Connection Line */}
                        {index > 0 && (
                          <div className="absolute -left-8 top-1/2 w-8 h-0.5 bg-slate-300" />
                        )}

                        {/* Node Circle */}
                        <button
                          onClick={() => setSelectedNode(Option.some(nodeId))}
                          className={`
                            w-16 h-16 rounded-full border-2 shadow-sm
                            flex flex-col items-center justify-center
                            text-xs font-bold font-mono
                            transition-all hover:scale-110 hover:shadow-md
                            ${
                            isSelected
                              ? "bg-blue-500 border-blue-600 text-white scale-110 shadow-lg"
                              : "bg-white border-blue-500 text-blue-600"
                          }
                          `}
                        >
                          <div className="text-[10px] opacity-60">
                            {node.properties.length}
                          </div>
                          <div>{node.label.substring(0, 3).toUpperCase()}</div>
                        </button>

                        {/* Hover Label */}
                        <div className="absolute top-20 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-xs text-slate-600 whitespace-nowrap pointer-events-none transition-opacity bg-white px-2 py-1 rounded shadow-sm">
                          {node.label}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {node.properties.length} properties
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {topologicalOrder.length === 0 && (
                    <div className="text-slate-400 text-sm">No classes found</div>
                  )}
                </div>
              </div>

              {/* Universal Properties Badge */}
              {context.universalProperties.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-violet-50">
                  <div className="text-xs text-violet-700">
                    <span className="font-semibold">{context.universalProperties.length}</span>{" "}
                    universal properties (domain-agnostic)
                  </div>
                </div>
              )}
            </div>
          )
        }
      })
    }
  })
}

================
File: packages/ui/src/components/TurtleEditor.tsx
================
import { useAtom } from "@effect-atom/atom-react"
import { turtleInputAtom } from "../state/store"

export const TurtleEditor = () => {
  const [turtle, setTurtle] = useAtom(turtleInputAtom)

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Turtle Editor
        </h2>
      </div>

      <textarea
        value={turtle}
        onChange={(e) => setTurtle(e.target.value)}
        className="flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-sm resize-none focus:outline-none"
        placeholder="Enter Turtle/RDF here..."
        spellCheck={false}
      />

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500">
        Edit to see live updates in the visualization
      </div>
    </div>
  )
}

================
File: packages/ui/src/lib/utils.ts
================
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

================
File: packages/ui/src/state/store.ts
================
import { Atom, Result } from "@effect-atom/atom"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import { Effect, Graph, Option } from "effect"

// Default example turtle
const DEFAULT_TURTLE = `@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Classes

:Animal a owl:Class ;
    rdfs:label "Animal" ;
    rdfs:comment "A living organism" .

:Mammal a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Mammal" ;
    rdfs:comment "An animal that feeds its young with milk" .

:Pet a owl:Class ;
    rdfs:label "Pet" ;
    rdfs:comment "An animal kept for companionship" .

:Dog a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Dog" ;
    rdfs:comment "A domesticated canine" .

### Properties

:hasName a owl:DatatypeProperty ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string ;
    rdfs:label "has name" .

:ownedBy a owl:ObjectProperty ;
    rdfs:domain :Pet ;
    rdfs:label "owned by" .
`

// 1. Source of Truth (The Editor State)
export const turtleInputAtom = Atom.make(DEFAULT_TURTLE)

// 2. Parsed Graph State (Effect-based)
export const ontologyGraphAtom = Atom.make((get) =>
  Effect.gen(function*() {
    const input = get(turtleInputAtom)
    return yield* parseTurtleToGraph(input)
  })
)

// 3. Topological Order (Derived from graph)
export const topologicalOrderAtom = Atom.make((get) =>
  Effect.gen(function*() {
    // Get the Result from the atom and convert to Effect
    const graphResult = get(ontologyGraphAtom)

    // Convert Result to Effect manually
    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { graph } = yield* graphEffect

    const sortedIds: Array<string> = []
    for (const [_idx, nodeId] of Graph.topo(graph)) {
      sortedIds.push(nodeId)
    }
    return sortedIds
  })
)

// 4. Selected Node (UI State)
export const selectedNodeAtom = Atom.make<Option.Option<string>>(Option.none())

================
File: packages/ui/src/App.tsx
================
import { TopologicalRail } from "./components/TopologicalRail"
import { NodeInspector } from "./components/NodeInspector"
import { TurtleEditor } from "./components/TurtleEditor"

export const App = () => {
  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Left Panel - Editor */}
      <div className="w-1/3 border-r border-slate-200">
        <TurtleEditor />
      </div>

      {/* Center Panel - Visualization */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col">
        <div className="flex-1">
          <TopologicalRail />
        </div>
        <div className="h-64 border-t border-slate-200">
          <NodeInspector />
        </div>
      </div>

      {/* Right Panel - Details / Future Prompt Preview */}
      <div className="w-1/3 bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-2">🚧</div>
          <div className="text-sm">Prompt preview coming soon</div>
          <div className="text-xs mt-2 text-slate-300">
            Will show generated prompts here
          </div>
        </div>
      </div>
    </div>
  )
}

================
File: packages/ui/src/index.css
================
@import "tailwindcss";

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
    "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  height: 100vh;
  width: 100vw;
}

================
File: packages/ui/src/main.tsx
================
import React from "react"
import ReactDOM from "react-dom/client"
import { RegistryProvider } from "@effect-atom/atom-react"
import { App } from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </React.StrictMode>
)

================
File: packages/ui/index.html
================
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Effect Ontology Visualizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

================
File: packages/ui/package.json
================
{
  "name": "@effect-ontology/ui",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@effect-ontology/core": "workspace:*",
    "effect": "^3.17.7",
    "@effect-atom/atom": "latest",
    "@effect-atom/atom-react": "latest",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@radix-ui/react-slot": "^1.1.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.17",
    "@tailwindcss/vite": "^4.1.17",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.22",
    "minimatch": "^10.1.1",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.17",
    "typescript": "^5.6.2",
    "vite": "^7.2.2"
  }
}

================
File: packages/ui/tailwind.config.js
================
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: []
}

================
File: packages/ui/tsconfig.json
================
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}

================
File: packages/ui/vite.config.ts
================
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import path from "path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 3000
  }
})

================
File: scratchpad/tsconfig.json
================
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "composite": false,
    "incremental": false
  }
}

================
File: .gitignore
================
coverage/
*.tsbuildinfo
node_modules/
.DS_Store
tmp/
dist/
build/
docs/effect-source/*
scratchpad/*
!scratchpad/tsconfig.json
.direnv/
.idea/
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

================
File: .prettierignore
================
# Let ESLint handle formatting for these files
*.ts
*.tsx
*.js
*.jsx
*.mjs

# Build outputs
build/
dist/
.effect/
node_modules/

# Generated files
*.tsbuildinfo
coverage/

================
File: .repomixignore
================
docs/
bun.lock
.claude/

================
File: CLAUDE.md
================
# Local Development Context

## Effect Source Code Context

**CRITICAL: Always search local Effect source before writing Effect code**

This project has full Effect-TS source code available locally for reference. Before writing any Effect code, search the relevant source packages to understand actual implementations, patterns, and APIs.

### Available Source Location

- Path: `docs/effect-source/`
- Contains all Effect packages from the Effect monorepo
- Symlinked to: `~/Dev/effect-source/effect/packages`

### Available Packages

The following Effect packages are available for local reference:

- **effect** - Core Effect library (docs/effect-source/effect/src/)
- **platform** - Platform abstractions (docs/effect-source/platform/src/)
- **platform-node** - Node.js implementations (docs/effect-source/platform-node/src/)
- **platform-bun** - Bun implementations (docs/effect-source/platform-bun/src/)
- **platform-browser** - Browser implementations (docs/effect-source/platform-browser/src/)
- **sql** - SQL abstractions (docs/effect-source/sql/src/)
- **sql-sqlite-node** - SQLite for Node (docs/effect-source/sql-sqlite-node/src/)
- **sql-drizzle** - Drizzle integration (docs/effect-source/sql-drizzle/src/)
- **cli** - CLI framework (docs/effect-source/cli/src/)
- **schema** - Schema validation (docs/effect-source/schema/src/)
- **rpc** - RPC framework (docs/effect-source/rpc/src/)
- **experimental** - Experimental features (docs/effect-source/experimental/src/)
- **opentelemetry** - OpenTelemetry integration (docs/effect-source/opentelemetry/src/)

### Workflow: Search Before You Code

**Always follow this pattern:**

1. **Identify the Effect API** you need to use
2. **Search the local source** to see the actual implementation
3. **Study the types and patterns** in the source code
4. **Write your code** based on real implementations, not assumptions

### Search Commands

Use these grep patterns to find what you need:

```bash
# Find a function or class definition
grep -r "export.*function.*functionName" docs/effect-source/

# Find type definitions
grep -r "export.*interface.*TypeName" docs/effect-source/
grep -r "export.*type.*TypeName" docs/effect-source/

# Find class definitions
grep -r "export.*class.*ClassName" docs/effect-source/

# Search within a specific package
grep -r "pattern" docs/effect-source/effect/src/
grep -r "pattern" docs/effect-source/platform/src/

# Find usage examples in tests
grep -r "test.*pattern" docs/effect-source/effect/test/

# Find all exports from a module
grep -r "export" docs/effect-source/effect/src/Effect.ts
```

### Example Search Patterns

**Before writing Error handling code:**

```bash
grep -r "TaggedError\|catchTag\|catchAll" docs/effect-source/effect/src/
```

**Before working with Layers:**

```bash
grep -F "Layer.succeed" docs/effect-source/effect/src/Layer.ts
grep -F "Layer.effect" docs/effect-source/effect/src/Layer.ts
grep -F "provide" docs/effect-source/effect/src/Layer.ts
```

**Before using SQL:**

```bash
grep -r "SqlClient\|withTransaction" docs/effect-source/sql/src/
```

**Before writing HTTP code:**

```bash
grep -r "HttpServer\|HttpRouter" docs/effect-source/platform/src/
```

**Before using Streams:**

```bash
grep -F "Stream.make" docs/effect-source/effect/src/Stream.ts
grep -F "Stream.from" docs/effect-source/effect/src/Stream.ts
```

### Key Files to Reference

Common entry points for searching:

- **Core Effect**: `docs/effect-source/effect/src/Effect.ts`
- **Layer**: `docs/effect-source/effect/src/Layer.ts`
- **Stream**: `docs/effect-source/effect/src/Stream.ts`
- **Schema**: `docs/effect-source/schema/src/Schema.ts`
- **Config**: `docs/effect-source/effect/src/Config.ts`
- **HttpServer**: `docs/effect-source/platform/src/HttpServer.ts`
- **HttpRouter**: `docs/effect-source/platform/src/HttpRouter.ts`
- **SqlClient**: `docs/effect-source/sql/src/SqlClient.ts`

### Benefits

By searching local source code you will:

1. **See actual implementations** - understand how APIs really work
2. **Discover patterns** - learn idiomatic Effect code from the source
3. **Find all variants** - see all overloads and variations of functions
4. **Avoid deprecated APIs** - work with current implementations
5. **Understand types** - see full type definitions and constraints
6. **Learn from tests** - discover usage patterns from test files

### Maintenance and Updates

**Updating Effect Source:**

When you upgrade @effect packages in package.json, update the local source:

```bash
cd ~/Dev/effect-source/effect
git pull origin main
```

**Verify Symlink:**

Check the symlink is working:

```bash
ls -la docs/effect-source
# Should show: docs/effect-source -> /Users/pooks/Dev/effect-source/effect/packages

# Test access:
ls docs/effect-source/effect/src/Effect.ts
```

**Troubleshooting:**

If symlink is broken:

```bash
ln -sf ~/Dev/effect-source/effect/packages docs/effect-source
```

If source is missing, clone the Effect monorepo:

```bash
mkdir -p ~/Dev/effect-source
cd ~/Dev/effect-source
git clone https://github.com/Effect-TS/effect.git
```

### Integration with Skills

All Effect skills (in `.claude/skills/effect-*.md`) include local source reference guidance. When a skill is active, always combine skill knowledge with local source searches for maximum accuracy.

---

**Remember: Real source code > documentation > assumptions. Always search first.**

================
File: eslint.config.mjs
================
import * as effectEslint from "@effect/eslint-plugin"
import { fixupPluginRules } from "@eslint/compat"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import tsParser from "@typescript-eslint/parser"
import codegen from "eslint-plugin-codegen"
import _import from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [
  {
    ignores: ["**/dist", "**/build", "**/docs", "**/*.md"]
  },
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ),
  ...effectEslint.configs.dprint,
  {
    plugins: {
      import: fixupPluginRules(_import),
      "sort-destructure-keys": sortDestructureKeys,
      "simple-import-sort": simpleImportSort,
      codegen
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: "module"
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },

      "import/resolver": {
        typescript: {
          alwaysTryTypes: true
        }
      }
    },

    rules: {
      "codegen/codegen": "error",
      "no-fallthrough": "off",
      "no-irregular-whitespace": "off",
      "object-shorthand": "error",
      "prefer-destructuring": "off",
      "sort-imports": "off",

      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.property.name='push'] > SpreadElement.arguments",
        message: "Do not use spread arguments in Array.push"
      }],

      "no-unused-vars": "off",
      "prefer-rest-params": "off",
      "prefer-spread": "off",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "import/no-unresolved": "off",
      "import/order": "off",
      "simple-import-sort/imports": "off",
      "sort-destructure-keys/sort-destructure-keys": "error",

      "@typescript-eslint/array-type": ["warn", {
        default: "generic",
        readonly: "generic"
      }],

      "@typescript-eslint/member-delimiter-style": 0,
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/consistent-type-imports": "warn",

      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],

      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/camelcase": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/no-array-constructor": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-namespace": "off",

      "@effect/dprint": ["error", {
        config: {
          indentWidth: 2,
          lineWidth: 120,
          semiColons: "asi",
          quoteStyle: "alwaysDouble",
          trailingCommas: "never",
          operatorPosition: "maintain",
          "arrowFunction.useParentheses": "force"
        }
      }]
    }
  }
]

================
File: LICENSE
================
MIT License

Copyright (c) 2024-present mkessy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

================
File: package.json
================
{
  "name": "effect-ontology",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.2.23",
  "workspaces": [
    "packages/*"
  ],
  "license": "MIT",
  "description": "Effect-based ontology framework monorepo",
  "scripts": {
    "dev": "cd packages/ui && bun run dev",
    "codegen": "build-utils prepare-v2",
    "build": "bun run build-esm && bun run build-annotate && bun run build-cjs && build-utils pack-v2",
    "build-esm": "tsc -b tsconfig.build.json",
    "build-cjs": "babel build/esm --plugins @babel/transform-export-namespace-from --plugins @babel/transform-modules-commonjs --out-dir build/cjs --source-maps",
    "build-annotate": "babel build/esm --plugins annotate-pure-calls --out-dir build/esm --source-maps",
    "check": "tsc -b tsconfig.json",
    "lint": "eslint \"**/{src,test,examples,scripts,dtslint}/**/*.{ts,mjs}\"",
    "lint-fix": "bun run lint --fix",
    "test": "vitest",
    "coverage": "vitest --coverage"
  },
  "dependencies": {
    "@effect/typeclass": "^0.38.0",
    "effect": "^3.17.7",
    "jotai": "^2.15.1",
    "n3": "^1.26.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@babel/cli": "^7.24.8",
    "@babel/core": "^7.25.2",
    "@babel/plugin-transform-export-namespace-from": "^7.24.7",
    "@babel/plugin-transform-modules-commonjs": "^7.24.8",
    "@effect/build-utils": "^0.8.9",
    "@effect/eslint-plugin": "^0.3.2",
    "@effect/language-service": "latest",
    "@effect/vitest": "^0.25.1",
    "@eslint/compat": "1.1.1",
    "@eslint/eslintrc": "3.1.0",
    "@eslint/js": "9.10.0",
    "@types/n3": "^1.26.1",
    "@types/node": "^22.5.2",
    "@typescript-eslint/eslint-plugin": "^8.4.0",
    "@typescript-eslint/parser": "^8.4.0",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.22",
    "babel-plugin-annotate-pure-calls": "^0.5.0",
    "eslint": "^9.10.0",
    "eslint-import-resolver-typescript": "^3.6.3",
    "eslint-plugin-codegen": "^0.28.0",
    "eslint-plugin-import": "^2.30.0",
    "eslint-plugin-simple-import-sort": "^12.1.1",
    "eslint-plugin-sort-destructure-keys": "^2.0.0",
    "fast-check": "^4.3.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.17",
    "tsx": "^4.17.0",
    "typescript": "^5.6.2",
    "vite": "^7.2.2",
    "vitest": "^3.2.0"
  },
  "effect": {
    "generateExports": {
      "include": [
        "**/*.ts"
      ]
    },
    "generateIndex": {
      "include": [
        "**/*.ts"
      ]
    }
  },
  "pnpm": {
    "patchedDependencies": {}
  }
}

================
File: README.md
================
# Effect Package Template

This template provides a solid foundation for building scalable and maintainable TypeScript package with Effect. 

## Running Code

This template leverages [tsx](https://tsx.is) to allow execution of TypeScript files via NodeJS as if they were written in plain JavaScript.

To execute a file with `tsx`:

```sh
pnpm tsx ./path/to/the/file.ts
```

## Operations

**Building**

To build the package:

```sh
pnpm build
```

**Testing**

To test the package:

```sh
pnpm test
```

================
File: setupTests.ts
================
import * as it from "@effect/vitest"

it.addEqualityTesters()

================
File: tsconfig.base.json
================
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "moduleDetection": "force",
    "composite": true,
    "downlevelIteration": true,
    "resolveJsonModule": true,
    "esModuleInterop": false,
    "declaration": true,
    "skipLibCheck": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": [],
    "isolatedModules": true,
    "sourceMap": true,
    "declarationMap": true,
    "noImplicitReturns": false,
    "noUnusedLocals": true,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "noEmitOnError": false,
    "noErrorTruncation": false,
    "allowJs": false,
    "checkJs": false,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noUncheckedIndexedAccess": false,
    "strictNullChecks": true,
    "baseUrl": ".",
    "target": "ES2022",
    "module": "NodeNext",
    "incremental": true,
    "removeComments": false,
    "plugins": [{ "name": "@effect/language-service" }]
  }
}

================
File: tsconfig.build.json
================
{
  "extends": "./tsconfig.src.json",
  "compilerOptions": {
    "types": ["node"],
    "tsBuildInfoFile": ".tsbuildinfo/build.tsbuildinfo",
    "outDir": "build/esm",
    "declarationDir": "build/dts",
    "stripInternal": true
  }
}

================
File: tsconfig.json
================
{
  "extends": "./tsconfig.base.json",
  "include": [],
  "references": [
    { "path": "tsconfig.src.json" },
    { "path": "tsconfig.test.json" }
  ]
}

================
File: tsconfig.src.json
================
{
  "extends": "./tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": {
    "types": ["node"],
    "outDir": "build/src",
    "tsBuildInfoFile": ".tsbuildinfo/src.tsbuildinfo",
    "rootDir": "src"
  }
}

================
File: tsconfig.test.json
================
{
  "extends": "./tsconfig.base.json",
  "include": ["test"],
  "references": [
    { "path": "tsconfig.src.json" }
  ],
  "compilerOptions": {
    "types": ["node"],
    "tsBuildInfoFile": ".tsbuildinfo/test.tsbuildinfo",
    "rootDir": "test",
    "noEmit": true
  }
}

================
File: vitest.config.ts
================
import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [],
  test: {
    setupFiles: [path.join(__dirname, "setupTests.ts")],
    include: ["./test/**/*.test.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@template/basic/test": path.join(__dirname, "test"),
      "@template/basic": path.join(__dirname, "src")
    }
  }
})



================================================================
End of Codebase
================================================================
