/**
 * Enhance WebNLG ontology with domain/range constraints (v2 - proper Turtle syntax)
 * 
 * Based on analysis of gold triples and DBpedia ontology conventions
 */

import { readFileSync, writeFileSync } from "node:fs"

// Domain/range mappings based on DBpedia ontology and our analysis
const constraints: Record<string, { domain?: string; range?: string; type?: "ObjectProperty" | "DatatypeProperty" }> = {
  // Person-related
  "birthPlace": { domain: "dbo:Person", range: "dbo:Place" },
  "deathPlace": { domain: "dbo:Person", range: "dbo:Place" },
  "nationality": { domain: "dbo:Person", range: "dbo:Country" },
  "almaMater": { domain: "dbo:Person", range: "dbo:EducationalInstitution" },
  
  // Location-related
  "country": { domain: "dbo:Place", range: "dbo:Country" },
  "location": { range: "dbo:Place" },
  "cityServed": { domain: "dbo:Airport", range: "dbo:City" },
  "capital": { domain: "dbo:Country", range: "dbo:City" },
  "leader": { domain: "dbo:Place", range: "dbo:Person" },
  "ethnicGroup": { domain: "dbo:Place" },
  "language": { domain: "dbo:Place", range: "dbo:Language" },
  
  // Organization/Military
  "operatingOrganisation": { domain: "dbo:Airport", range: "dbo:Organisation" },
  "aircraftFighter": { domain: "dbo:MilitaryUnit", range: "dbo:Aircraft" },
  "attackAircraft": { domain: "dbo:MilitaryUnit", range: "dbo:Aircraft" },
  "battle": { domain: "dbo:MilitaryUnit", range: "dbo:MilitaryConflict" },
  
  // Sports
  "club": { domain: "dbo:Athlete", range: "dbo:SportsTeam" },
  "manager": { domain: "dbo:SportsTeam", range: "dbo:Person" },
  "ground": { domain: "dbo:SportsTeam", range: "dbo:Place" },
  
  // Creative works
  "creator": { domain: "dbo:Work", range: "dbo:Person" },
  "author": { domain: "dbo:WrittenWork", range: "dbo:Person" },
  "genre": { domain: "dbo:Work" },
  "associatedBand/associatedMusicalArtist": { domain: "dbo:MusicalArtist", range: "dbo:Band" },
  
  // General
  "isPartOf": { },
  "ingredient": { domain: "dbo:Food" },
  "builder": { domain: "dbo:Building", range: "dbo:Organisation" },
  "discoverer": { domain: "dbo:CelestialBody", range: "dbo:Person" },
  "launchSite": { domain: "dbo:Rocket", range: "dbo:Place" },
  
  // Runway properties (Airport-specific)
  "runwayLength": { domain: "dbo:Airport" },
  "1stRunwayLengthFeet": { domain: "dbo:Airport" },
  "1stRunwayLengthMetre": { domain: "dbo:Airport" },
  "runwaySurfaceType": { domain: "dbo:Airport" },
  
  // Other specific properties
  "apoapsis": { domain: "dbo:CelestialBody" },
  "material": { domain: "dbo:Building" },
  "region": { domain: "dbo:Place", range: "dbo:Place" },
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
    
    // Check if this is a property declaration ending with period
    const match = line.match(/^dbo:(\S+)\s+a\s+owl:(?:Object|Datatype)Property\s+;\s+rdfs:label\s+"[^"]+"\s+\.$/)
    
    if (match) {
      const propertyName = match[1]
      const constraint = constraints[propertyName]
      
      if (constraint && (constraint.domain || constraint.range)) {
        // Replace the period with semicolon and add constraints
        const lineWithoutPeriod = line.slice(0, -2) + " ;"
        enhanced.push(lineWithoutPeriod)
        
        if (constraint.domain) {
          enhanced.push(`    rdfs:domain ${constraint.domain}${constraint.range ? " ;" : " ."}`)
        }
        
        if (constraint.range) {
          enhanced.push(`    rdfs:range ${constraint.range} .`)
        }
        
        enhancedCount++
      } else {
        // No constraints, keep original
        enhanced.push(line)
      }
    } else {
      // Not a property declaration, keep as-is
      enhanced.push(line)
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

