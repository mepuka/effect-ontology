/**
 * CLI tool to inspect parsed ontologies
 *
 * Usage: bun run src/inspect.ts <path-to-turtle-file>
 */

import { Console, Effect, Graph, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { parseTurtleToGraph } from "./Graph/Builder.js"
import { isClassNode } from "./Graph/Types.js"

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
      if (isClassNode(node)) {
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
      if (Option.isSome(nodeOption) && isClassNode(nodeOption.value)) {
        const node = nodeOption.value
        const indent = "  "
        yield* Console.log(`${indent}${node.label} (${node.properties.length} properties)`)

        // Show properties
        if (node.properties.length > 0) {
          for (const prop of node.properties) {
            const range = prop.ranges[0] || "unknown"
            const rangeLabel = range.split("#").pop() || range.split("/").pop() || range
            yield* Console.log(`${indent}  - ${prop.label}: ${rangeLabel}`)
          }
        }
      }
    }

    // Display universal properties (domain-agnostic)
    if (context.universalProperties.length > 0) {
      yield* Console.log(`\n🌐 Universal Properties (no explicit domain):`)
      for (const prop of context.universalProperties) {
        const range = prop.ranges[0] || "unknown"
        const rangeLabel = range.split("#").pop() || range.split("/").pop() || range
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
