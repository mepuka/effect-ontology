/**
 * Analyze WebNLG gold triples to infer domain/range constraints
 * 
 * This script reads WebNLG gold triples and infers which predicates
 * are used with which entity types, helping us add proper domain/range
 * constraints to the ontology.
 */

import { readFileSync } from "node:fs"
import { glob } from "glob"

interface Triple {
  subject: string
  predicate: string
  object: string
}

interface Entry {
  id: string
  text: string
  triples: Triple[]
  category?: string
}

interface PredicateStats {
  predicate: string
  count: number
  subjectTypes: Map<string, number>  // Inferred from category or entity name
  objectPatterns: {
    entityReferences: number  // Objects that look like entities
    literals: number         // Objects that look like literals
  }
}

/**
 * Infer entity type from category or entity name
 */
function inferEntityType(entity: string, category?: string): string {
  // Try category first
  if (category) {
    return `dbo:${category}`
  }
  
  // Infer from entity name patterns
  const lower = entity.toLowerCase()
  
  // Geographic patterns
  if (lower.includes("university") || lower.includes("school") || lower.includes("college")) {
    return "dbo:EducationalInstitution"
  }
  if (lower.includes("city") || lower.includes("county") || lower.includes("state") || lower.includes("country")) {
    return "dbo:Place"
  }
  if (lower.includes("airport")) {
    return "dbo:Airport"
  }
  
  // Person patterns (common names)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(entity)) {
    return "dbo:Person"
  }
  
  // Organization patterns
  if (lower.includes("company") || lower.includes("corporation") || lower.includes("inc") || lower.includes("ltd")) {
    return "dbo:Company"
  }
  
  return "dbo:Thing"  // Default
}

/**
 * Check if object looks like a literal value
 */
function isLikelyLiteral(object: string): boolean {
  // Numeric
  if (/^\d+$/.test(object)) return true
  
  // Date-like
  if (/^\d{4}/.test(object)) return true
  
  // Common literal patterns
  if (object.includes(" and ") || object.includes(", ")) return true
  
  return false
}

/**
 * Main analysis function
 */
async function analyzeConstraints() {
  console.log("🔍 Analyzing WebNLG gold triples for domain/range inference...\n")
  
  // Load all WebNLG result files
  const files = await glob("benchmarks/results/webnlg-dev-*.json")
  console.log(`📁 Found ${files.length} result files\n`)
  
  const predicateStats = new Map<string, PredicateStats>()
  
  // Process each file
  for (const file of files.slice(0, 5)) {  // Sample first 5 files
    const content = readFileSync(file, "utf-8")
    const data = JSON.parse(content)
    
    if (!data.perExampleResults) continue
    
    for (const example of data.perExampleResults) {
      const category = example.category
      
      // Process gold triples
      for (const triple of example.gold || []) {
        const predicate = triple.predicate
        
        if (!predicateStats.has(predicate)) {
          predicateStats.set(predicate, {
            predicate,
            count: 0,
            subjectTypes: new Map(),
            objectPatterns: {
              entityReferences: 0,
              literals: 0
            }
          })
        }
        
        const stats = predicateStats.get(predicate)!
        stats.count++
        
        // Infer subject type
        const subjectType = inferEntityType(triple.subject, category)
        stats.subjectTypes.set(subjectType, (stats.subjectTypes.get(subjectType) || 0) + 1)
        
        // Analyze object
        if (isLikelyLiteral(triple.object)) {
          stats.objectPatterns.literals++
        } else {
          stats.objectPatterns.entityReferences++
        }
      }
    }
  }
  
  // Sort by frequency
  const sorted = Array.from(predicateStats.values())
    .sort((a, b) => b.count - a.count)
  
  console.log("📊 Top 30 Predicates with Inferred Constraints:\n")
  console.log("=" .repeat(80))
  
  for (const stats of sorted.slice(0, 30)) {
    console.log(`\n${stats.predicate} (used ${stats.count} times)`)
    
    // Most common subject type
    const subjectTypes = Array.from(stats.subjectTypes.entries())
      .sort((a, b) => b[1] - a[1])
    
    console.log(`  Domain candidates:`)
    for (const [type, count] of subjectTypes.slice(0, 3)) {
      const pct = ((count / stats.count) * 100).toFixed(0)
      console.log(`    - ${type} (${pct}%)`)
    }
    
    // Range inference
    const { entityReferences, literals } = stats.objectPatterns
    const totalObjects = entityReferences + literals
    const entityPct = totalObjects > 0 ? ((entityReferences / totalObjects) * 100).toFixed(0) : 0
    const literalPct = totalObjects > 0 ? ((literals / totalObjects) * 100).toFixed(0) : 0
    
    console.log(`  Range inference:`)
    if (entityReferences > literals) {
      console.log(`    - ObjectProperty (${entityPct}% entity references)`)
    } else {
      console.log(`    - DatatypeProperty (${literalPct}% literals)`)
    }
  }
  
  console.log("\n" + "=".repeat(80))
  console.log(`\n✅ Analyzed ${predicateStats.size} unique predicates`)
  console.log(`\n💡 Use this data to add domain/range constraints to webnlg-full.ttl`)
}

// Run analysis
analyzeConstraints().catch(console.error)

