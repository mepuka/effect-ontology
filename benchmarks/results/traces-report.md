# Extraction Pipeline Analysis Report

**Generated:** 2025-11-22T23:58:18.279Z
**Provider:** from traces
**Total Extractions:** 20

## Token Usage

- **Entity Extraction:** 0 tokens
- **Triple Extraction:** 4,706 tokens
- **Total:** 4,706 tokens

---

# Individual Extractions

## Entry: unknown

**Trace ID:** `9f38b77d13eedff1d8926926b151047f`
**Timestamp:** 2025-11-22T23:46:50.284Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `e809a8b0f19fc86b27fddec724d0aef8`
**Timestamp:** 2025-11-22T23:46:52.422Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 25650ms
**Tokens:** 335 in / 6 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- Mount Everest (http://example.org/rebel/Location)
- Earth (http://example.org/rebel/Location)
- Mahalangur Himal (http://example.org/rebel/Location)
- Himalayas (http://example.org/rebel/Location)
- China (http://example.org/rebel/Location)
- Nepal (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

Mount Everest is Earth's highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas. The China–Nepal border runs across its summit point.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `74e6c7e7f58af83506f6a475555cee18`
**Timestamp:** 2025-11-22T23:47:18.113Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `323d5de126f58897c00009631f56d441`
**Timestamp:** 2025-11-22T23:47:21.136Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 4493ms
**Tokens:** 332 in / 502 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- Marie Curie (http://example.org/rebel/Person)
- 7 November 1867 (http://example.org/rebel/Date)
- 4 July 1934 (http://example.org/rebel/Date)
- Poland (http://example.org/rebel/Location)
- France (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

Marie Curie (7 November 1867 – 4 July 1934) was a Polish and naturalized-French physicist and chemist who conducted pioneering research on radioactivity.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Marie Curie | http://example.org/rebel/date_of_birth | [object Object] |
| Marie Curie | http://example.org/rebel/date_of_death | [object Object] |
| Marie Curie | http://example.org/rebel/country_of_citizenship | [object Object] |
| Marie Curie | http://example.org/rebel/country_of_citizenship | [object Object] |
| Marie Curie | http://example.org/rebel/occupation | physicist |
| Marie Curie | http://example.org/rebel/occupation | chemist |

---

## Entry: unknown

**Trace ID:** `406badf0482838dee2a5b898dde59d5d`
**Timestamp:** 2025-11-22T23:47:25.676Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `8bcd05b9ce43ddd208ccd61c7daeac62`
**Timestamp:** 2025-11-22T23:47:29.991Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 2920ms
**Tokens:** 288 in / 135 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- London (http://example.org/rebel/Location)
- England (http://example.org/rebel/Location)
- United Kingdom (http://example.org/rebel/Location)
- River Thames (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

London is the capital and largest city of England and the United Kingdom. The city stands on the River Thames.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| London | http://example.org/rebel/capital_of | [object Object] |
| London | http://example.org/rebel/capital_of | [object Object] |

---

## Entry: unknown

**Trace ID:** `50635cdf7fe8d216bd3acf156ff1691b`
**Timestamp:** 2025-11-22T23:47:32.943Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `e4c499ed6bfaf663f5d5b93d3a3572eb`
**Timestamp:** 2025-11-22T23:47:34.581Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 4533ms
**Tokens:** 324 in / 361 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- William Shakespeare (http://example.org/rebel/Person)
- 26 April 1564 (http://example.org/rebel/Date)
- 23 April 1616 (http://example.org/rebel/Date)
- England (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

William Shakespeare (26 April 1564 – 23 April 1616) was an English playwright, poet, and actor, widely regarded as the greatest writer in the English language.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| William Shakespeare | http://example.org/rebel/date_of_birth | [object Object] |
| William Shakespeare | http://example.org/rebel/date_of_death | [object Object] |
| William Shakespeare | http://example.org/rebel/country_of_citizenship | [object Object] |
| William Shakespeare | http://example.org/rebel/occupation | playwright |
| William Shakespeare | http://example.org/rebel/occupation | poet |
| William Shakespeare | http://example.org/rebel/occupation | actor |

---

## Entry: unknown

**Trace ID:** `d5600646c34609f444b140720ba28c5d`
**Timestamp:** 2025-11-22T23:47:39.175Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `02584295a8ec382b1a95fd0f4fceff5d`
**Timestamp:** 2025-11-22T23:47:40.668Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 5980ms
**Tokens:** 274 in / 77 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- The Great Wall of China (http://example.org/rebel/Work)
- China (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

The Great Wall of China is a series of fortifications made of stone, brick, tamped earth. It was built across the historical northern borders of China to protect against nomadic invasions.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| The Great Wall of China | http://www.w3.org/2000/01/rdf-schema#comment | a series of fortifications made of stone, brick, tamped earth |

---

## Entry: unknown

**Trace ID:** `f28ab00c83dcc1b5c3c9b9f46f2911f9`
**Timestamp:** 2025-11-22T23:47:46.665Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `f8ad57ffee649617f29cf5360a5a3a5e`
**Timestamp:** 2025-11-22T23:47:48.918Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 5055ms
**Tokens:** 307 in / 216 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- Amazon.com, Inc. (http://example.org/rebel/Organization)
- Seattle, Washington (http://example.org/rebel/Location)
- Jeff Bezos (http://example.org/rebel/Person)
- 1994 (http://example.org/rebel/Date)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

Amazon.com, Inc. is an American multinational technology company based in Seattle, Washington. It was founded by Jeff Bezos in 1994.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Amazon.com, Inc. | http://example.org/rebel/headquarters_location | [object Object] |
| Amazon.com, Inc. | http://example.org/rebel/founded_by | [object Object] |
| Amazon.com, Inc. | http://example.org/rebel/inception | [object Object] |

---

## Entry: unknown

**Trace ID:** `483b4c7abd5bb61219f60db14aa0865f`
**Timestamp:** 2025-11-22T23:47:53.992Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `ec569212de5d8ed232ed43ca5049aa3a`
**Timestamp:** 2025-11-22T23:47:56.252Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 5858ms
**Tokens:** 308 in / 6 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Work
Properties:
  (no properties)

Class: Event
Properties:
  (no properties)

Class: Person
Properties:
  - date of birth: Date (optional)
  - date of death: Date (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)

Class: Date
Properties:
  (no properties)

Class: Location
Properties:
  - capital of: Location (optional)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)
  - inception: Date (optional)

CONTEXT:

KNOWN ENTITIES:
- Amazon River (http://example.org/rebel/Location)
- South America (http://example.org/rebel/Location)
- Brazil (http://example.org/rebel/Location)
- Peru (http://example.org/rebel/Location)
- Colombia (http://example.org/rebel/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

The Amazon River is the second longest river in the world, located in South America. It flows through Brazil, Peru, and Colombia.

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `732c4b6f3a9b328f76e354b7d1e00536`
**Timestamp:** 2025-11-22T23:48:03.079Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `9878a4c2f5b4c5e899a7008c402d9d87`
**Timestamp:** 2025-11-22T23:48:07.373Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 7877ms
**Tokens:** 352 in / 188 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Number
Properties:
  (no properties)

Class: Miscellaneous
Properties:
  (no properties)

Class: Person
Properties:
  - place of birth: Location (optional)
  - place of death: Location (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)
  - award received: string (optional)
  - date of birth: Time (optional)
  - date of death: Time (optional)
  - spouse: Person (optional)
  - employer: Organization (optional)
  - educated at: Organization (optional)
  - position held: string (optional)

Class: Time
Properties:
  (no properties)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)

Class: Location
Properties:
  - capital: Location (optional)

CONTEXT:

KNOWN ENTITIES:
- Albert Einstein (http://example.org/docred/Person)
- theory of relativity (http://example.org/docred/Misc)
- Ulm (http://example.org/docred/Location)
- Germany (http://example.org/docred/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

Albert Einstein was a German-born theoretical physicist . He developed the theory of relativity . Einstein was born in Ulm , Germany .

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Albert Einstein | http://example.org/docred/occupation | theoretical physicist |
| Albert Einstein | http://example.org/docred/country_of_citizenship | [object Object] |
| Albert Einstein | http://example.org/docred/place_of_birth | [object Object] |

---

## Entry: unknown

**Trace ID:** `bff11feaa50cedc2f4cbfd0ffb03c6c8`
**Timestamp:** 2025-11-22T23:48:15.302Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `f8362f708bb25600014ea146c19872eb`
**Timestamp:** 2025-11-22T23:48:16.950Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 2758ms
**Tokens:** 0 in / 0 out

#### Prompt

```
(not captured)
```

#### Extracted Triples

(no triples captured in trace)

---

## Entry: unknown

**Trace ID:** `06ee6d508ee6b47575f1a3ee1eda3148`
**Timestamp:** 2025-11-22T23:48:19.742Z

### Input Text

```
(not captured)
```

---

## Entry: unknown

**Trace ID:** `fdcb7f4779467cf9f7624703a56e13c8`
**Timestamp:** 2025-11-22T23:48:22.040Z

### Input Text

```
(not captured)
```

### Stage 2: Triple Extraction

**Duration:** 3427ms
**Tokens:** 351 in / 344 out

#### Prompt

```
SYSTEM INSTRUCTIONS:
Class: Number
Properties:
  (no properties)

Class: Miscellaneous
Properties:
  (no properties)

Class: Person
Properties:
  - place of birth: Location (optional)
  - place of death: Location (optional)
  - country of citizenship: Location (optional)
  - occupation: string (optional)
  - award received: string (optional)
  - date of birth: Time (optional)
  - date of death: Time (optional)
  - spouse: Person (optional)
  - employer: Organization (optional)
  - educated at: Organization (optional)
  - position held: string (optional)

Class: Time
Properties:
  (no properties)

Class: Organization
Properties:
  - headquarters location: Location (optional)
  - founded by: Person (optional)

Class: Location
Properties:
  - capital: Location (optional)

CONTEXT:

KNOWN ENTITIES:
- Marie Curie (http://example.org/docred/Person)
- Nobel Prize in Physics (http://example.org/docred/Misc)
- Warsaw (http://example.org/docred/Location)
- Poland (http://example.org/docred/Location)

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.


TASK:
Extract knowledge graph from the following text:

Marie Curie was a Polish physicist . She won the Nobel Prize in Physics . Curie was born in Warsaw , Poland .

Return a valid JSON object matching the schema with all extracted entities and their relationships.
```

#### Extracted Triples

| Subject | Predicate | Object |
|---------|-----------|--------|
| Marie Curie | http://example.org/docred/occupation | physicist |
| Marie Curie | http://example.org/docred/country_of_citizenship | [object Object] |
| Marie Curie | http://example.org/docred/award_received | [object Object] |
| Marie Curie | http://example.org/docred/place_of_birth | [object Object] |

---
