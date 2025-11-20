import { normalize, EntityRef, fromArray, union, empty, toPromptFragment } from "../src/Prompt/EntityCache"
import { HashMap } from "effect"

console.log("Testing EntityCache implementation...")

// Test normalize
console.log("\n=== Testing normalize ===")
const test1 = normalize("Apple Inc.")
const test2 = normalize("  John Doe  ")
const test3 = normalize("ACME Corp!!!")

console.log(`normalize("Apple Inc.") = "${test1}" (expected: "apple inc")`)
console.log(`normalize("  John Doe  ") = "${test2}" (expected: "john doe")`)
console.log(`normalize("ACME Corp!!!") = "${test3}" (expected: "acme corp")`)

const normalizePass = test1 === "apple inc" && test2 === "john doe" && test3 === "acme corp"
console.log(`Normalize tests: ${normalizePass ? "PASS" : "FAIL"}`)

// Test fromArray
console.log("\n=== Testing fromArray ===")
const entities = [
  new EntityRef({
    iri: "http://example.org/Alice",
    label: "Alice",
    types: ["Person"],
    foundInChunk: 0,
    confidence: 1.0
  }),
  new EntityRef({
    iri: "http://example.org/Bob",
    label: "Bob",
    types: ["Person"],
    foundInChunk: 1,
    confidence: 0.9
  })
]

const cache = fromArray(entities)
console.log(`Created cache with ${HashMap.size(cache)} entities`)
console.log(`fromArray test: ${HashMap.size(cache) === 2 ? "PASS" : "FAIL"}`)

// Test union (monoid operation)
console.log("\n=== Testing union (monoid operation) ===")
const cache1 = fromArray([entities[0]])
const cache2 = fromArray([entities[1]])
const combined = union(cache1, cache2)
console.log(`union(cache1, cache2) size = ${HashMap.size(combined)} (expected: 2)`)
console.log(`Union test: ${HashMap.size(combined) === 2 ? "PASS" : "FAIL"}`)

// Test identity law: c ⊕ ∅ = c
console.log("\n=== Testing monoid identity law ===")
const identityResult = union(cache, empty)
console.log(`union(cache, empty) size = ${HashMap.size(identityResult)} (expected: ${HashMap.size(cache)})`)
console.log(`Identity law test: ${HashMap.size(identityResult) === HashMap.size(cache) ? "PASS" : "FAIL"}`)

// Test toPromptFragment
console.log("\n=== Testing toPromptFragment ===")
const fragment = toPromptFragment(cache)
console.log(`Fragment has ${fragment.length} lines`)
console.log(`Fragment contains "Alice": ${fragment.some(line => line.includes("Alice")) ? "PASS" : "FAIL"}`)
console.log(`Fragment contains IRI: ${fragment.some(line => line.includes("http://example.org/Alice")) ? "PASS" : "FAIL"}`)

console.log("\n=== All tests completed ===")
