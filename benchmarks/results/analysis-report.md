# Extraction Pipeline Analysis Report

**Generated:** 2025-11-23T08:55:56.591Z
**Provider:** from traces
**Total Extractions:** 20

## Token Usage

- **Entity Extraction:** 0 tokens
- **Triple Extraction:** 32,357 tokens
- **Total:** 32,357 tokens

---

# Individual Extractions

## Entry: unknown

**Trace ID:** `43612a4ebf61d8e8d2f243bee7db4788`
**Timestamp:** 2025-11-23T05:33:42.034Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 1963ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `557d3b046219865907b954d04cdd0c9e`
**Timestamp:** 2025-11-23T05:33:44.035Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `e90c50f467b1ce15ab3d33c4a0c2e890`
**Timestamp:** 2025-11-23T05:33:45.296Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 2590ms
**Tokens:** 10551 in / 328 out

#### Prompt

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

Class: Monument
Properties:
  (no properties)

Class: Artist
Properties:
  (no properties)

Class: Country
Properties:
  (no properties)

Class: Airport
Properties:
  (no properties)

Class: Politician
Properties:
  (no properties)

Class: Food
Properties:
  (no properties)

Class: Award
Properties:
  (no properties)

Class: Comics Character
Properties:
  (no properties)

Class: City
Properties:
  (no properties)

Class: Company
Properties:
  (no properties)

Class: Written Work
Properties:
  (no properties)

Class: Athlete
Properties:
  (no properties)

Class: University
Properties:
  (no properties)

Class: Sports Team
Properties:
  (no properties)

Class: Genre
Properties:
  (no properties)

Class: Place
Properties:
  (no properties)

Class: Region
Properties:
  (no properties)

Class: Thing
Properties:
  (no properties)

Class: Celestial Body
Properties:
  (no properties)

Class: Organisation
Properties:
  (no properties)

Class: Language
Properties:
  (no properties)

Class: Mean of Transportation
Properties:
  (no properties)

Class: Building
Properties:
  (no properties)

Class: Astronaut
Properties:
  (no properties)

Class: Person
Properties:
  (no properties)

CONTEXT:

KNOWN ENTITIES:
- Aenir (http://dbpedia.org/ontology/WrittenWork)
- Above the Veil (http://dbpedia.org/ontology/WrittenWork)
- Australia (http://dbpedia.org/ontology/Country)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


EXAMPLES:
Example 1 - Biographical:
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
Entities: [
  { "name": "Marie Curie", "type": "Person" },
  { "name": "Warsaw", "type": "City" },
  { "name": "Poland", "type": "Country" },
  { "name": "Nobel Prize in Physics", "type": "Award" }
]
Triples: [
  { "subject": "Marie Curie", "predicate": "birthPlace", "object": "Warsaw" },
  { "subject": "Marie Curie", "predicate": "countryOfCitizenship", "object": "Poland" },
  { "subject": "Marie Curie", "predicate": "awardReceived", "object": "Nobel Prize in Physics" }
]

Example 2 - Location:
Text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889."
Entities: [
  { "name": "Eiffel Tower", "type": "ArchitecturalStructure" },
  { "name": "Paris", "type": "City" },
  { "name": "France", "type": "Country" },
  { "name": "Gustave Eiffel", "type": "Person" }
]
Triples: [
  { "subject": "Eiffel Tower", "predicate": "locatedIn", "object": "Paris" },
  { "subject": "Paris", "predicate": "country", "object": "France" },
  { "subject": "Eiffel Tower", "predicate": "architect", "object": "Gustave Eiffel" }
]

Example 3 - Direction:
Text: "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena."
Entities: [
  { "name": "Walter Baade", "type": "Person" },
  { "name": "Halton Arp", "type": "Person" },
  { "name": "James Watson", "type": "Person" },
  { "name": "101 Helena", "type": "AstronomicalObject" }
]
Triples: [
  { "subject": "Walter Baade", "predicate": "doctoralAdvisor", "object": "Halton Arp" },
  { "subject": "James Watson", "predicate": "discoverer", "object": "101 Helena" }
]
Note: The subject performs the action. "Walter Baade supervised" means Walter Baade → doctoralAdvisor → Halton Arp, NOT the reverse.

Example 4 - Negative:
Text: "The weather today is sunny with a high of 75°F. It's a beautiful day for a walk."
Entities: []
Triples: []
Note: This text contains no extractable entities or relationships matching the ontology schema.

TASK:
Extract knowledge graph from the following text:

Aenir and its sequel Above the Veil are examples of Australian literature. Above the Veil, preceded by Aenir, is from the country of Australia.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Aenir | http://dbpedia.org/ontology/countryOrigin | [object Object] |
| Above the Veil | http://dbpedia.org/ontology/countryOrigin | [object Object] |
| Above the Veil | http://dbpedia.org/ontology/precededBy | [object Object] |

---

## Entry: unknown

**Trace ID:** `bec9e657ca81261fb51b9384930a8f4b`
**Timestamp:** 2025-11-23T05:33:47.910Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `a65b75b9097ed3ccbc547dd12ea8e6ef`
**Timestamp:** 2025-11-23T05:33:48.907Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 1963ms
**Tokens:** 10525 in / 236 out

#### Prompt

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

Class: Monument
Properties:
  (no properties)

Class: Artist
Properties:
  (no properties)

Class: Country
Properties:
  (no properties)

Class: Airport
Properties:
  (no properties)

Class: Politician
Properties:
  (no properties)

Class: Food
Properties:
  (no properties)

Class: Award
Properties:
  (no properties)

Class: Comics Character
Properties:
  (no properties)

Class: City
Properties:
  (no properties)

Class: Company
Properties:
  (no properties)

Class: Written Work
Properties:
  (no properties)

Class: Athlete
Properties:
  (no properties)

Class: University
Properties:
  (no properties)

Class: Sports Team
Properties:
  (no properties)

Class: Genre
Properties:
  (no properties)

Class: Place
Properties:
  (no properties)

Class: Region
Properties:
  (no properties)

Class: Thing
Properties:
  (no properties)

Class: Celestial Body
Properties:
  (no properties)

Class: Organisation
Properties:
  (no properties)

Class: Language
Properties:
  (no properties)

Class: Mean of Transportation
Properties:
  (no properties)

Class: Building
Properties:
  (no properties)

Class: Astronaut
Properties:
  (no properties)

Class: Person
Properties:
  (no properties)

CONTEXT:

KNOWN ENTITIES:
- Above the Veil (http://dbpedia.org/ontology/WrittenWork)
- Aenir (http://dbpedia.org/ontology/WrittenWork)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


EXAMPLES:
Example 1 - Biographical:
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
Entities: [
  { "name": "Marie Curie", "type": "Person" },
  { "name": "Warsaw", "type": "City" },
  { "name": "Poland", "type": "Country" },
  { "name": "Nobel Prize in Physics", "type": "Award" }
]
Triples: [
  { "subject": "Marie Curie", "predicate": "birthPlace", "object": "Warsaw" },
  { "subject": "Marie Curie", "predicate": "countryOfCitizenship", "object": "Poland" },
  { "subject": "Marie Curie", "predicate": "awardReceived", "object": "Nobel Prize in Physics" }
]

Example 2 - Location:
Text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889."
Entities: [
  { "name": "Eiffel Tower", "type": "ArchitecturalStructure" },
  { "name": "Paris", "type": "City" },
  { "name": "France", "type": "Country" },
  { "name": "Gustave Eiffel", "type": "Person" }
]
Triples: [
  { "subject": "Eiffel Tower", "predicate": "locatedIn", "object": "Paris" },
  { "subject": "Paris", "predicate": "country", "object": "France" },
  { "subject": "Eiffel Tower", "predicate": "architect", "object": "Gustave Eiffel" }
]

Example 3 - Direction:
Text: "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena."
Entities: [
  { "name": "Walter Baade", "type": "Person" },
  { "name": "Halton Arp", "type": "Person" },
  { "name": "James Watson", "type": "Person" },
  { "name": "101 Helena", "type": "AstronomicalObject" }
]
Triples: [
  { "subject": "Walter Baade", "predicate": "doctoralAdvisor", "object": "Halton Arp" },
  { "subject": "James Watson", "predicate": "discoverer", "object": "101 Helena" }
]
Note: The subject performs the action. "Walter Baade supervised" means Walter Baade → doctoralAdvisor → Halton Arp, NOT the reverse.

Example 4 - Negative:
Text: "The weather today is sunny with a high of 75°F. It's a beautiful day for a walk."
Entities: []
Triples: []
Note: This text contains no extractable entities or relationships matching the ontology schema.

TASK:
Extract knowledge graph from the following text:

Above the Veil followed the book Aenir and is written in English. The book Aenir was followed up by Above the Veil, which is written in English. The novel Aenir was followed by Above the Veil written in English.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Aenir | http://dbpedia.org/ontology/followedBy | Above the Veil |
| Above the Veil | http://dbpedia.org/ontology/language | English |
| Aenir | http://dbpedia.org/ontology/language | English |

---

## Entry: unknown

**Trace ID:** `553fd925e1f302b156b77a332a45d13b`
**Timestamp:** 2025-11-23T05:33:50.887Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `45b4a5240c9c92d33d64aaffdce8cc1e`
**Timestamp:** 2025-11-23T05:33:52.078Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 2071ms
**Tokens:** 10548 in / 169 out

#### Prompt

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

Class: Monument
Properties:
  (no properties)

Class: Artist
Properties:
  (no properties)

Class: Country
Properties:
  (no properties)

Class: Airport
Properties:
  (no properties)

Class: Politician
Properties:
  (no properties)

Class: Food
Properties:
  (no properties)

Class: Award
Properties:
  (no properties)

Class: Comics Character
Properties:
  (no properties)

Class: City
Properties:
  (no properties)

Class: Company
Properties:
  (no properties)

Class: Written Work
Properties:
  (no properties)

Class: Athlete
Properties:
  (no properties)

Class: University
Properties:
  (no properties)

Class: Sports Team
Properties:
  (no properties)

Class: Genre
Properties:
  (no properties)

Class: Place
Properties:
  (no properties)

Class: Region
Properties:
  (no properties)

Class: Thing
Properties:
  (no properties)

Class: Celestial Body
Properties:
  (no properties)

Class: Organisation
Properties:
  (no properties)

Class: Language
Properties:
  (no properties)

Class: Mean of Transportation
Properties:
  (no properties)

Class: Building
Properties:
  (no properties)

Class: Astronaut
Properties:
  (no properties)

Class: Person
Properties:
  (no properties)

CONTEXT:

KNOWN ENTITIES:
- Above the Veil (http://dbpedia.org/ontology/WrittenWork)
- Aenir (http://dbpedia.org/ontology/WrittenWork)
- Castle (http://dbpedia.org/ontology/WrittenWork)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


EXAMPLES:
Example 1 - Biographical:
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
Entities: [
  { "name": "Marie Curie", "type": "Person" },
  { "name": "Warsaw", "type": "City" },
  { "name": "Poland", "type": "Country" },
  { "name": "Nobel Prize in Physics", "type": "Award" }
]
Triples: [
  { "subject": "Marie Curie", "predicate": "birthPlace", "object": "Warsaw" },
  { "subject": "Marie Curie", "predicate": "countryOfCitizenship", "object": "Poland" },
  { "subject": "Marie Curie", "predicate": "awardReceived", "object": "Nobel Prize in Physics" }
]

Example 2 - Location:
Text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889."
Entities: [
  { "name": "Eiffel Tower", "type": "ArchitecturalStructure" },
  { "name": "Paris", "type": "City" },
  { "name": "France", "type": "Country" },
  { "name": "Gustave Eiffel", "type": "Person" }
]
Triples: [
  { "subject": "Eiffel Tower", "predicate": "locatedIn", "object": "Paris" },
  { "subject": "Paris", "predicate": "country", "object": "France" },
  { "subject": "Eiffel Tower", "predicate": "architect", "object": "Gustave Eiffel" }
]

Example 3 - Direction:
Text: "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena."
Entities: [
  { "name": "Walter Baade", "type": "Person" },
  { "name": "Halton Arp", "type": "Person" },
  { "name": "James Watson", "type": "Person" },
  { "name": "101 Helena", "type": "AstronomicalObject" }
]
Triples: [
  { "subject": "Walter Baade", "predicate": "doctoralAdvisor", "object": "Halton Arp" },
  { "subject": "James Watson", "predicate": "discoverer", "object": "101 Helena" }
]
Note: The subject performs the action. "Walter Baade supervised" means Walter Baade → doctoralAdvisor → Halton Arp, NOT the reverse.

Example 4 - Negative:
Text: "The weather today is sunny with a high of 75°F. It's a beautiful day for a walk."
Entities: []
Triples: []
Note: This text contains no extractable entities or relationships matching the ontology schema.

TASK:
Extract knowledge graph from the following text:

Above the Veil is the sequel to Aenir, which was written after Castle. Above the Veil is the sequel to Aenir, which was preceded by the novel Castle. Above the Veil was preceded by Aenir which was preceded by the novel Castle.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Above the Veil | http://dbpedia.org/ontology/followedBy | Aenir |
| Aenir | http://dbpedia.org/ontology/followedBy | Castle |

---

## Entry: unknown

**Trace ID:** `14f9813a0d198db660d6abe28ab4f366`
**Timestamp:** 2025-11-23T05:33:54.203Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `49ac4d2263c3c4be75802e68b4d892b4`
**Timestamp:** 2025-11-23T05:33:57.206Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `644c4c739b1cae557bf19786bdbc74e9`
**Timestamp:** 2025-11-23T05:34:07.997Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 7875ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `2d0a6330d54873752b6e96d956933c56`
**Timestamp:** 2025-11-23T05:34:15.886Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `400a22d6b7d3ba06ba85892db8ac736f`
**Timestamp:** 2025-11-23T05:34:18.618Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 8479ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `9091b023b031a11072a9e73d896ae5be`
**Timestamp:** 2025-11-23T05:34:27.116Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `451cf70261dc9ab1189bb4dde8b51225`
**Timestamp:** 2025-11-23T05:34:28.913Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 8679ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `9bffa28a21e1a84663e3d902377e50f5`
**Timestamp:** 2025-11-23T05:34:37.601Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `ebcfa28e7c1b583bb80878b4f20cd74d`
**Timestamp:** 2025-11-23T05:34:41.309Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 6877ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `6dd5e4ceae5978ad9522f9839393f857`
**Timestamp:** 2025-11-23T05:34:45.882Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `e050628a92e73258c2538ff4566a2660`
**Timestamp:** 2025-11-23T05:34:47.508Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 7812ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `f5990f8790e0c3a5057daa1e75397104`
**Timestamp:** 2025-11-23T05:34:55.331Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `a7b694d794f52b47c0aa6be95bd8d680`
**Timestamp:** 2025-11-23T05:34:58.467Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 6060ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---
