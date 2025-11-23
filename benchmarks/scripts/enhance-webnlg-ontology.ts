/**
 * Enhance WebNLG ontology with domain/range constraints
 * 
 * Based on analysis of gold triples and DBpedia ontology conventions
 */

import { readFileSync, writeFileSync } from "node:fs"

// Domain/range mappings based on DBpedia ontology and our analysis
const constraints: Record<string, { domain?: string; range?: string; type: "ObjectProperty" | "DatatypeProperty" }> = {
  // Person-related
  "birthPlace": { domain: "dbo:Person", range: "dbo:Place", type: "ObjectProperty" },
  "deathPlace": { domain: "dbo:Person", range: "dbo:Place", type: "ObjectProperty" },
  "nationality": { domain: "dbo:Person", range: "dbo:Country", type: "ObjectProperty" },
  "almaMater": { domain: "dbo:Person", range: "dbo:EducationalInstitution", type: "ObjectProperty" },
  
  // Location-related
  "country": { domain: "dbo:Place", range: "dbo:Country", type: "ObjectProperty" },
  "location": { domain: "owl:Thing", range: "dbo:Place", type: "ObjectProperty" },
  "cityServed": { domain: "dbo:Airport", range: "dbo:City", type: "ObjectProperty" },
  "capital": { domain: "dbo:Country", range: "dbo:City", type: "ObjectProperty" },
  "leader": { domain: "dbo:Place", range: "dbo:Person", type: "ObjectProperty" },
  "ethnicGroup": { domain: "dbo:Place", range: "owl:Thing", type: "ObjectProperty" },
  "language": { domain: "dbo:Place", range: "dbo:Language", type: "ObjectProperty" },
  
  // Organization/Military
  "operatingOrganisation": { domain: "dbo:Place", range: "dbo:Organisation", type: "ObjectProperty" },
  "aircraftFighter": { domain: "dbo:MilitaryUnit", range: "dbo:Aircraft", type: "ObjectProperty" },
  "attackAircraft": { domain: "dbo:MilitaryUnit", range: "dbo:Aircraft", type: "ObjectProperty" },
  "battle": { domain: "dbo:MilitaryUnit", range: "dbo:MilitaryConflict", type: "ObjectProperty" },
  
  // Sports
  "club": { domain: "dbo:Athlete", range: "dbo:SportsTeam", type: "ObjectProperty" },
  "manager": { domain: "dbo:SportsTeam", range: "dbo:Person", type: "ObjectProperty" },
  "ground": { domain: "dbo:SportsTeam", range: "dbo:Place", type: "ObjectProperty" },
  
  // Creative works
  "creator": { domain: "dbo:Work", range: "dbo:Person", type: "ObjectProperty" },
  "author": { domain: "dbo:WrittenWork", range: "dbo:Person", type: "ObjectProperty" },
  "genre": { domain: "dbo:Work", range: "owl:Thing", type: "ObjectProperty" },
  "associatedBand/associatedMusicalArtist": { domain: "dbo:MusicalArtist", range: "dbo:Band", type: "ObjectProperty" },
  
  // General
  "isPartOf": { domain: "owl:Thing", range: "owl:Thing", type: "ObjectProperty" },
  "ingredient": { domain: "dbo:Food", range: "owl:Thing", type: "ObjectProperty" },
  "builder": { domain: "dbo:Building", range: "dbo:Organisation", type: "ObjectProperty" },
  "discoverer": { domain: "dbo:CelestialBody", range: "dbo:Person", type: "ObjectProperty" },
  "launchSite": { domain: "dbo:Rocket", range: "dbo:Place", type: "ObjectProperty" },
  
  // Datatype properties (literals)
  "runwayLength": { domain: "dbo:Airport", type: "DatatypeProperty" },
  "apoapsis": { domain: "dbo:CelestialBody", type: "DatatypeProperty" },
  "material": { domain: "dbo:Building", type: "DatatypeProperty" },
  "status": { domain: "owl:Thing", type: "DatatypeProperty" },
  "alternativeName": { domain: "owl:Thing", type: "DatatypeProperty" },
  "region": { domain: "dbo:Place", range: "dbo:Place", type: "ObjectProperty" },
}

function enhanceOntology() {
  console.log("🔧 Enhancing WebNLG ontology with domain/range constraints...\n")
  
  const inputPath = "benchmarks/ontologies/webnlg-full.ttl"
  const outputPath = "benchmarks/ontologies/webnlg-enhanced.ttl"
  
  let content = readFileSync(inputPath, "utf-8")
  const lines = content.split("\n")
  
  const enhanced: string[] = []
  let enhancedCount = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    enhanced.push(line)
    
    // Check if this is a property declaration
    const match = line.match(/^dbo:(\S+)\s+a\s+owl:(?:Object|Datatype)Property/)
    if (match) {
      const propertyName = match[1]
      const constraint = constraints[propertyName]
      
      if (constraint) {
        // Add domain if specified
        if (constraint.domain) {
          enhanced.push(`    rdfs:domain ${constraint.domain} ;`)
        }
        
        // Add range if specified
        if (constraint.range) {
          enhanced.push(`    rdfs:range ${constraint.range} ;`)
        }
        
        enhancedCount++
      }
    }
  }
  
  writeFileSync(outputPath, enhanced.join("\n"))
  
  console.log(`✅ Enhanced ${enhancedCount} properties with domain/range constraints`)
  console.log(`📝 Wrote to: ${outputPath}`)
  console.log(`\n📊 Statistics:`)
  console.log(`   - Input:  ${lines.length} lines`)
  console.log(`   - Output: ${enhanced.length} lines`)
  console.log(`   - Added:  ${enhanced.length - lines.length} constraint lines`)
  
  // Count domain/range declarations
  const domains = enhanced.filter(l => l.includes("rdfs:domain")).length
  const ranges = enhanced.filter(l => l.includes("rdfs:range")).length
  
  console.log(`\n🔍 Constraint counts:`)
  console.log(`   - Domain declarations: ${domains}`)
  console.log(`   - Range declarations:  ${ranges}`)
  console.log(`\n💡 Use --ontology benchmarks/ontologies/webnlg-enhanced.ttl to test with enhanced ontology`)
}

enhanceOntology()

