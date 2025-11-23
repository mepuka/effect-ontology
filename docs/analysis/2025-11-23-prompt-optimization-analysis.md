# Prompt Optimization Analysis - Footology Extraction

**Date:** 2025-11-23  
**Context:** Analyzed prompts from Footology ontology extraction with Anthropic Claude on Wikipedia soccer data  
**Results:** 75 triples extracted from 5 texts (4 successful, 1 failed)

---

## Executive Summary

**Current State:**
- Entity extraction prompt: **15,770 characters** (~3,940 tokens)
- Triple extraction prompt: **16,297 characters** (~4,074 tokens)
- Total LLM cost per text: ~13,000-17,000 input tokens
- Success rate: 80% (4/5 texts successful)

**Key Findings:**
1. **~30% of prompt is boilerplate** (guidelines, examples, task instructions)
2. **Schema union lists are verbose** - 72 property IRIs repeated as literal unions
3. **Class definitions contain redundancy** - Property cardinality shows raw Effect Option JSON (now fixed)
4. **Few-shot examples may be suboptimal** - Generic examples don't match domain

**Optimization Potential:** ~25-35% prompt size reduction possible

---

## 1. Current Prompt Structure

### Entity Extraction Prompt (15,770 chars)

```
SYSTEM INSTRUCTIONS:                              ~500 chars (3%)
  - PREDICATE USAGE RULES                         
  - REASONING STRATEGY                            
  - Class definitions (13 classes)                ~12,000 chars (76%)
    * Class: Player                               
    * Properties: 11 properties with ranges       
    * Class: Team                                 
    * Properties: 11 properties with ranges       
    * [... 11 more classes]                       

EXAMPLES:                                         ~2,700 chars (17%)
  - Example 1: Biographical (Marie Curie)         
  - Example 2: Location (Eiffel Tower)            
  - Example 3: Direction (Walter Baade)           
  - Example 4: Negative (weather)                 

TASK:                                             ~600 chars (4%)
  - Extract knowledge graph from text             
  - [Input text: 5000 chars]                      
  - Return valid JSON matching schema             
```

### Triple Extraction Prompt (16,297 chars)

Similar structure but includes:
- Extracted entities from Stage 1 (6-28 entities)
- All 72 property IRIs
- Focused class definitions based on extracted entity types

---

## 2. Prompt Component Analysis

### 2.1 Fixed Boilerplate (3,200 chars, 20%)

**PREDICATE_GUIDELINES (380 chars)**
```
PREDICATE USAGE RULES:
1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
2. Use domain-specific predicates from the ontology
3. If no exact predicate exists, use the closest semantic match
4. Prefer specific predicates (birthPlace) over generic (location)

COMMON PREDICATE MAPPINGS:
- Location: use "locatedIn", "locatedInAdministrativeEntity"
- Birth/Death: use "birthPlace", "deathPlace", "dateOfBirth"
- Creation: use "creator", "author", "architect", NOT "seeAlso"
- Discovery: use "discoverer" (person → thing), NOT "discovered" (thing → person)
```

**Assessment:**
- ✅ Critical: Prevents common mistakes (rdfs:seeAlso misuse)
- ⚠️ Generic mappings: "Birth/Death", "Discovery" not relevant to soccer domain
- 💡 **Optimization:** Make guidelines domain-specific or remove irrelevant mappings (-150 chars)

---

**COT_INSTRUCTIONS (290 chars)**
```
REASONING STRATEGY:
1. Identify Entities: Scan the text for potential entities matching the allowed classes.
2. Classify: Match entities to the most specific allowed Class.
3. Extract Properties: For each entity, extract properties defined in the schema.
4. Verify: Ensure all constraints (cardinality, types) are met.
5. Output: Return only valid JSON matching the schema.
```

**Assessment:**
- ✅ Useful: Structures LLM reasoning
- ⚠️ Verbose: Could be more concise
- 💡 **Optimization:** Condense to 2-3 key steps (-100 chars)

---

**Few-Shot Examples (2,700 chars, 17%)**

**Example 1 - Biographical (690 chars)**
```
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
Entities: [Marie Curie (Person), Warsaw (City), Poland (Country), Nobel Prize in Physics (Award)]
Triples: [
  { "subject": "Marie Curie", "predicate": "birthPlace", "object": "Warsaw" },
  { "subject": "Marie Curie", "predicate": "countryOfCitizenship", "object": "Poland" },
  { "subject": "Marie Curie", "predicate": "awardReceived", "object": "Nobel Prize in Physics" }
]
```

**Assessment:**
- ❌ **Domain mismatch:** Biographical example doesn't demonstrate soccer-specific patterns
- ❌ **Predicate mismatch:** Uses `birthPlace`, `countryOfCitizenship`, `awardReceived` (not in Footology)
- ❌ **Confusing:** Shows predicates that don't exist in the schema
- 💡 **Critical Issue:** Generic examples teach patterns that fail in the actual domain!

**Example 2 - Location (670 chars)**  
Similar issues - Eiffel Tower/Paris example not relevant to soccer.

**Example 3 - Direction (620 chars)**  
Demonstrates subject-predicate-object ordering, but uses astronomy domain.

**Example 4 - Negative (220 chars)**  
Weather example - useful for showing empty extraction.

**💡 Major Optimization: Replace with domain-specific examples (-2,700 chars old, +1,500 chars new = -1,200 chars)**

---

### 2.2 Class Definitions (12,000 chars, 76%)

**Current Format (per class):**
```
Class: team

Description: A professional football team

Properties:
  - competesIn (Match) [0..*]
  - partOf (Tournament) [0..1]
  - includesPlayer (Player) [0..1]
  - playsIn (Stadium) [0..1]
  - wins (Trophy) [0..*]
  - managedBy (Coach) [0..1]
  - teamFormation (string) [0..*]
  - teamLeague (string) [0..*]
  - teamName (string) [0..*]
  - teamRanking (integer) [0..*]
  - teamSeason (string) [0..*]
```

**Issues:**
1. **Redundant cardinality notation:** `[0..*]` vs `[0..1]` - LLM may not need exact cardinality
2. **Property prefixes redundant:** `team` prefix on all properties (`teamName`, `teamLeague`, etc.)
3. **Range notation verbose:** `(Match)`, `(Trophy)` could be shorter
4. **Label/IRI mismatch:** Shows `team` (label) but schema requires full IRI

**Assessment:**
- ✅ Clear structure
- ⚠️ Verbose cardinality
- ⚠️ Redundant prefixes
- 💡 **Optimization:** Simplify format, remove redundant info (-3,000 chars estimated)

---

### 2.3 Schema (JSON Schema Union)

**Current Schema (Triple Format):**
```json
{
  "type": "object",
  "required": ["triples"],
  "properties": {
    "triples": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["subject", "subject_type", "predicate", "object"],
        "properties": {
          "subject": { "type": "string" },
          "subject_type": { 
            "enum": [
              "http://visualdataweb.org/newOntology/Player",
              "http://visualdataweb.org/newOntology/Team",
              "http://visualdataweb.org/newOntology/Coach",
              // ... 10 more class IRIs
            ]
          },
          "predicate": {
            "enum": [
              "http://visualdataweb.org/newOntology/competesIn",
              "http://visualdataweb.org/newOntology/partOf",
              "http://visualdataweb.org/newOntology/includesPlayer",
              // ... 69 more property IRIs (72 total)
            ]
          },
          "object": { ... }
        }
      }
    }
  }
}
```

**Issues:**
1. **Massive enum lists:** 72 property IRIs, each ~50 chars = 3,600 chars just for enum
2. **Full IRIs required:** `http://visualdataweb.org/newOntology/` repeated 72 times = ~2,880 chars of base URI
3. **Enum order matters:** LLMs see first options first, may bias toward them

**Assessment:**
- ⚠️ **Major bloat:** Enum expansion is ~50% of schema size
- 💡 **Optimization:** Use IRI prefixes, or rely on prompt validation instead of schema enum (-3,000 chars)

---

## 3. Detailed Size Breakdown

| Component | Chars | % | Tokens (est) | Assessment |
|-----------|-------|---|--------------|------------|
| **Fixed Guidelines** | 670 | 4% | 170 | Necessary, minor optimization possible |
| **Few-Shot Examples** | 2,700 | 17% | 675 | ❌ Domain mismatch, replace |
| **Class Definitions** | 12,000 | 76% | 3,000 | ⚠️ Verbose, optimize format |
| **Task Instructions** | 400 | 3% | 100 | ✅ Concise |
| **Total Prompt** | 15,770 | 100% | 3,945 | |
| **JSON Schema** | ~5,000 | - | 1,250 | ⚠️ Enum bloat |
| **Input Text** | 5,000 | - | 1,250 | ✅ Necessary |
| **Total LLM Input** | ~20,770 | - | ~6,445 | |

---

## 4. Results Analysis

### 4.1 Success Cases (4/5 texts)

**Text 1: Lionel Messi (6 triples)**
```turtle
<lionel_messi> a :Player ;
    :PlayerName "Lionel Andrés Messi" ;
    :PlayerBirthdate "24 June 1987" ;
    :playsFor <inter_miami>, <argentina_national_team> ;
    :receives <ballon_dor>, <european_golden_shoe>, <fifa_world_player_of_the_year> .
```
✅ Correct predicates: `playsFor`, `receives`  
✅ Proper entity typing: Player, Team, Award  
✅ Human-readable names

---

**Text 2: Cristiano Ronaldo (27 triples)**
```turtle
<cristiano_ronaldo> a :Player ;
    :playsFor <al-nassr>, <portugal> ;
    :receives <ballon_dor>, <uefa_mens_player_of_the_year_award>, ... ;
    :wins <uefa_champions_league>, <uefa_european_championship>, ... ;
    :participatesIn <euro_2004>, <euro_2008>, ... .
```
✅ Rich extraction: Multiple teams, awards, tournaments  
✅ Correct inverse relationships: `<al-nassr> :includesPlayer <cristiano_ronaldo>`  
✅ Proper functional property usage

---

**Text 3: Manchester United (18 triples)**
```turtle
<manchester_united_football_club> a :Team ;
    :playsIn <old_trafford> ;
    :competesIn <premier_league> ;
    :wins <fa_cup>, <league_cup>, ... ;
    :managedBy <matt_busby>, <alex_ferguson>, <jos_mourinho> ;
    :includesPlayer <george_best>, <denis_law>, <bobby_charlton> .
```
✅ Stadium relationship: `playsIn`  
✅ Historical managers: `managedBy`  
✅ Complex trophy list

---

**Text 4: FC Barcelona (24 triples)**
```turtle
<fc_barcelona> a :Team ;
    :competesIn <la_liga> ;
    :managedBy <joan_gamper> ;
    :wins <cant_del_bara>, <copa_del_rey>, ... ;
    :partOf <uefa_champions_league>, <uefa_cup_winners_cup>, ... ;
    :includesPlayer <johan_cruyff>, <romrio>, <lionel_messi>, ... .
```
✅ League competition: `competesIn`  
✅ Tournament participation: `partOf`  
✅ Famous players correctly linked

---

### 4.2 Failure Case (1/5 texts)

**Text 5: 2022 FIFA World Cup (0 triples)**

**Error:**
```
MalformedOutput: Predicate validation failed
├─ Expected: [72 valid property IRIs]
└─ Actual: "http://visualdataweb.org/newOntology/tournamentChampion"
```

**Root Cause Analysis:**

The LLM generated a **non-existent predicate** `tournamentChampion` instead of:
- ✅ `TournamentChampion` (datatype property for champion name)
- ✅ `wins` (object property linking Team → Trophy)

**Why did this happen?**

1. **Case confusion:** Property name exists but LLM generated wrong case (lowercase predicate vs PascalCase datatype property)
2. **Unclear property distinction:** The ontology has both:
   - `TournamentChampion: string` (datatype property)
   - No direct "championship" object property
3. **Schema ambiguity:** The LLM tried to infer a relationship instead of using the correct property

**Prompt Issues Contributing to Failure:**
1. ❌ Few-shot examples don't demonstrate **datatype vs object property distinction**
2. ❌ Class definitions don't emphasize **when to use datatype properties** vs object properties
3. ❌ Property list in schema is **too long** (72 properties), increasing error probability

---

## 5. Optimization Recommendations

### 5.1 High-Impact: Domain-Specific Few-Shot Examples

**Replace generic examples with soccer-specific ones:**

```markdown
Example 1 - Player Profile:
Text: "Lionel Messi plays for Inter Miami and Argentina. He won the 2022 FIFA World Cup."
Extracted:
- Entities: Messi (Player), Inter Miami (Team), Argentina (Team), 2022 FIFA World Cup (Trophy)
- Triples:
  * Messi :playsFor Inter Miami
  * Messi :playsFor Argentina  
  * Messi :wins 2022 FIFA World Cup

Example 2 - Team Match:
Text: "Manchester United faces Real Madrid at Old Trafford in the UEFA Champions League."
Extracted:
- Entities: Manchester United (Team), Real Madrid (Team), Old Trafford (Stadium), UEFA Champions League (Tournament)
- Triples:
  * Manchester United :playsIn Old Trafford
  * Manchester United :competesIn UEFA Champions League

Example 3 - Datatype Properties:
Text: "FC Barcelona was founded in 1899 and plays in a 4-3-3 formation."
Extracted:
- Entities: FC Barcelona (Team)
- Triples:
  * FC Barcelona :teamFormation "4-3-3"
  * FC Barcelona :teamName "FC Barcelona"
Note: Use datatype properties (teamFormation, teamName) for literal values.
```

**Impact:** -1,200 chars, +domain relevance, +correctness

---

### 5.2 Medium-Impact: Simplify Class Definitions

**Current (verbose):**
```
Class: team

Description: A professional football team

Properties:
  - competesIn (Match) [0..*]
  - partOf (Tournament) [0..1]
  - includesPlayer (Player) [0..1]
  - playsIn (Stadium) [0..1]
```

**Optimized (concise):**
```
Class: Team - A professional football team
Properties:
  • competesIn → Match (multiple)
  • partOf → Tournament (single)
  • includesPlayer → Player (single)
  • playsIn → Stadium (single)
```

**Changes:**
- Remove redundant "Class:" prefix
- Inline description
- Use `→` for range
- Simplify cardinality: "multiple" vs "single" instead of `[0..*]` vs `[0..1]`
- Use bullet points instead of hyphens

**Impact:** -3,000 chars (-25% of class definitions)

---

### 5.3 Medium-Impact: Shorten Guidelines

**Current (670 chars):**
```
PREDICATE USAGE RULES:
1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
2. Use domain-specific predicates from the ontology
3. If no exact predicate exists, use the closest semantic match
4. Prefer specific predicates (birthPlace) over generic (location)

COMMON PREDICATE MAPPINGS:
- Location: use "locatedIn", "locatedInAdministrativeEntity"
- Birth/Death: use "birthPlace", "deathPlace", "dateOfBirth"
- Creation: use "creator", "author", "architect", NOT "seeAlso"
- Discovery: use "discoverer" (person → thing), NOT "discovered" (thing → person)
```

**Optimized (380 chars):**
```
RULES:
• Use exact ontology predicates only
• NEVER use rdfs:seeAlso or rdfs:comment for relationships
• For datatype properties (strings/numbers), use properties ending in capital letters (PlayerName, TeamRanking)
• For object properties (relationships), use camelCase (playsFor, competesIn)
```

**Changes:**
- Remove generic domain mappings (birth/death, discovery)
- Add datatype vs object property distinction
- More concise formatting

**Impact:** -290 chars, +clarity for actual schema

---

### 5.4 Low-Impact: Condense COT Instructions

**Current (290 chars):**
```
REASONING STRATEGY:
1. Identify Entities: Scan the text for potential entities matching the allowed classes.
2. Classify: Match entities to the most specific allowed Class.
3. Extract Properties: For each entity, extract properties defined in the schema.
4. Verify: Ensure all constraints (cardinality, types) are met.
5. Output: Return only valid JSON matching the schema.
```

**Optimized (190 chars):**
```
APPROACH:
1. Find entities matching ontology classes
2. Extract relationships using ontology properties
3. Verify types and return valid JSON
```

**Impact:** -100 chars

---

### 5.5 High-Impact: Reduce Schema Enum Bloat

**Option A: Use prefixes in schema** (rejected - breaks Effect Schema)

**Option B: Rely on prompt validation, looser schema**
```json
{
  "predicate": {
    "type": "string",
    "pattern": "^http://visualdataweb.org/newOntology/[A-Za-z]+"
  }
}
```

**Option C: Keep enum, but compress IRI representation**
- Current: 72 * 50 chars/IRI = 3,600 chars
- Optimized: Use relative IRIs in JSON-LD context (not feasible with current architecture)

**Recommendation:** Keep current enum approach for type safety, but reduce prompt verbosity elsewhere

**Impact:** 0 chars (architectural change deferred)

---

## 6. Consolidated Optimization Plan

### Phase 1: Content Improvements (High Priority)

| Change | Savings | Effort | Impact |
|--------|---------|--------|--------|
| Replace few-shot examples with domain-specific | -1,200 chars | Medium | ✅ Critical for correctness |
| Add datatype vs object property guidance | +150 chars | Low | ✅ Prevents failures |
| Simplify class definition format | -3,000 chars | Low | ✅ 19% prompt reduction |
| Shorten predicate guidelines | -290 chars | Low | ✅ Remove irrelevant rules |
| Condense COT instructions | -100 chars | Low | ✅ Cleaner prompt |
| **Total Phase 1** | **-4,440 chars** | | **-28% prompt size** |

### Phase 2: Architectural Changes (Medium Priority)

| Change | Savings | Effort | Impact |
|--------|---------|--------|--------|
| Dynamic example selection (Hybrid-MMR) | Variable | Medium | ✅ Already implemented, needs activation |
| Schema enum compression | -2,000 chars | High | ⚠️ Requires Effect Schema refactor |
| **Total Phase 2** | **-2,000 chars** | | **-13% additional** |

### Combined Potential: **-6,440 chars (-41% total)**

---

## 7. Expected Improvements

### Cost Reduction
- **Current:** ~6,500 input tokens/extraction * 2 stages = 13,000 tokens/text
- **Optimized:** ~4,000 input tokens/extraction * 2 stages = 8,000 tokens/text
- **Savings:** ~40% token reduction = ~40% cost reduction

### Quality Improvements
- ✅ Domain-specific examples improve predicate selection
- ✅ Clearer datatype vs object property rules prevent case errors
- ✅ Shorter prompts = faster LLM processing
- ✅ Less prompt noise = better instruction following

### Risks
- ⚠️ Shorter class definitions may lose important cardinality information
- ⚠️ Removing generic examples may reduce transfer learning
- ⚠️ Schema enum compression could break Effect type safety

---

## 8. Immediate Action Items

1. **Create domain-specific few-shot examples** (soccer)
   - Player profile with multiple teams
   - Team with stadium and league
   - Match with teams and tournament
   - Datatype property example

2. **Add property type distinction to guidelines**
   - Explain PascalCase vs camelCase convention
   - Show when to use literal strings vs entity references

3. **Simplify class definition rendering**
   - Modify `packages/core/src/Prompt/Render.ts`
   - Change format to single-line property lists
   - Use symbols (`→`, `•`) instead of verbose formatting

4. **Test optimized prompts on same dataset**
   - Re-run Footology extraction with optimized prompts
   - Compare success rate and triple quality
   - Measure actual token reduction

5. **Activate dynamic few-shot selection**
   - Enable `DynamicFewShotService` (already in layers)
   - Set `dynamicExamples: true` in extraction calls
   - Benchmark against static examples

---

## 9. References

**Files Analyzed:**
- `packages/core/src/Prompt/PromptDoc.ts` - Prompt construction
- `packages/core/src/Prompt/Render.ts` - Class definition rendering  
- `packages/core/src/Schema/TripleFactory.ts` - Triple schema generation
- `benchmarks/scripts/test-footology-with-scraped-data.ts` - Extraction test

**Related Documents:**
- `docs/fixes/2025-11-23-option-cardinality-fix.md` - Cardinality rendering fix
- `docs/analysis/2025-11-23-property-rendering-fix.md` - Property rendering improvements

---

## Appendix: Sample Optimized Prompt

**BEFORE (15,770 chars):**
```
SYSTEM INSTRUCTIONS:

PREDICATE USAGE RULES:
1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
2. Use domain-specific predicates from the ontology
3. If no exact predicate exists, use the closest semantic match
4. Prefer specific predicates (birthPlace) over generic (location)

COMMON PREDICATE MAPPINGS:
- Location: use "locatedIn", "locatedInAdministrativeEntity"
- Birth/Death: use "birthPlace", "deathPlace", "dateOfBirth"
- Creation: use "creator", "author", "architect", NOT "seeAlso"
- Discovery: use "discoverer" (person → thing), NOT "discovered" (thing → person)

REASONING STRATEGY:
1. Identify Entities: Scan the text for potential entities matching the allowed classes.
2. Classify: Match entities to the most specific allowed Class.
3. Extract Properties: For each entity, extract properties defined in the schema.
4. Verify: Ensure all constraints (cardinality, types) are met.
5. Output: Return only valid JSON matching the schema.

Class: team

Description: A professional football team

Properties:
  - competesIn (Match) [0..*]
  - partOf (Tournament) [0..1]
  - includesPlayer (Player) [0..1]
  [... 8 more properties]

[... 12 more classes with properties]

EXAMPLES:

Example 1 - Biographical:
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
[... 690 chars]

[... 3 more generic examples]
```

**AFTER (11,330 chars, -28%):**
```
RULES:
• Use exact ontology predicates only
• NEVER use rdfs:seeAlso or rdfs:comment for relationships
• Datatype properties (literals): PascalCase ending in property name (PlayerName: "Messi", TeamRanking: 5)
• Object properties (entities): camelCase (playsFor, competesIn, wins)

APPROACH:
1. Find entities matching ontology classes
2. Extract relationships using ontology properties
3. Verify types and return valid JSON

Team - A professional football team
• competesIn → Match (multiple) • partOf → Tournament (single) • includesPlayer → Player (single) • playsIn → Stadium (single) • wins → Trophy (multiple) • managedBy → Coach (single) • teamFormation, teamLeague, teamName: literals • teamRanking: integer

[... 12 more classes, compact format]

EXAMPLES:

Example 1 - Player:
Text: "Lionel Messi plays for Inter Miami and Argentina. He was born on June 24, 1987."
Triples:
  Messi :playsFor Inter Miami
  Messi :playsFor Argentina
  Messi :PlayerBirthdate "1987-06-24"
  [Inter Miami a Team] [Argentina a Team]

Example 2 - Match:
Text: "Manchester United faces Real Madrid at Old Trafford in the Champions League."
Triples:
  Manchester United :competesIn Champions League
  Manchester United :playsIn Old Trafford
  [Old Trafford a Stadium] [Champions League a Tournament]

Example 3 - Datatype Properties:
Text: "Barcelona plays in a 4-3-3 formation and is ranked #3 in La Liga."
Triples:
  Barcelona :teamFormation "4-3-3"
  Barcelona :teamRanking 3
  Barcelona :competesIn La Liga
  [La Liga a League]
Note: Use literal strings/numbers for datatype properties.
```

---

**End of Analysis**

