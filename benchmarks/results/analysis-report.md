# Benchmark Analysis Report

**Generated:** 2025-11-22T23:58:38.577Z
**Results Analyzed:** 15

## Overview

| Dataset | Split | Samples | F1 | Precision | Recall | Timestamp |
|---------|-------|---------|----:|----------:|-------:|-----------|
| DocRED | dev | 3 | 0.508 | 0.472 | 0.556 | 2025-11-22 |
| REBEL | val | 10 | 0.355 | 0.375 | 0.342 | 2025-11-22 |
| DocRED | dev | 3 | 0.675 | 0.806 | 0.667 | 2025-11-22 |
| REBEL | val | 10 | 0.328 | 0.355 | 0.308 | 2025-11-22 |
| DocRED | dev | 3 | 0.675 | 0.806 | 0.667 | 2025-11-22 |
| REBEL | val | 10 | 0.353 | 0.380 | 0.333 | 2025-11-22 |
| DocRED | dev | 1 | 0.667 | 0.667 | 0.667 | 2025-11-22 |
| REBEL | val | 1 | 0.000 | 0.000 | 0.000 | 2025-11-22 |
| REBEL | val | 1 | 0.000 | 0.000 | 0.000 | 2025-11-22 |
| WebNLG | dev | 10 | 0.239 | 0.243 | 0.235 | 2025-11-22 |
| WebNLG | dev | 10 | 0.250 | 0.250 | 0.250 | 2025-11-22 |
| WebNLG | dev | 5 | 0.493 | 0.560 | 0.460 | 2025-11-22 |
| WebNLG | dev | 10 | 0.324 | 0.333 | 0.317 | 2025-11-22 |
| WebNLG | dev | 10 | 0.312 | 0.325 | 0.303 | 2025-11-22 |
| WebNLG | dev | 10 | 0.500 | 0.505 | 0.525 | 2025-11-22 |

## Current Prompt Templates

### Entity Extraction Prompt

```
SYSTEM INSTRUCTIONS:
Class: {className}
Properties:
  {propertyName} - {propertyLabel}
...

Identify entities from the ontology classes and their properties.
For each entity, identify:
- name: the exact text from the input
- type: the class IRI from the ontology

USER INPUT:
{text}
```

### Triple Extraction Prompt

```
SYSTEM INSTRUCTIONS:
Given the following entities and ontology properties,
extract relationships (triples) from the text.

Available Properties:
  {propertyIRI} - {propertyLabel}
...

Entities:
  {entityName} ({entityType})
...

For each relationship, output:
- subject: entity name
- predicate: property IRI
- object: entity name or literal value

USER INPUT:
{text}
```

---

# Detailed Analysis by Result

## DocRED - dev

**Timestamp:** 2025-11-22T23:48:25.503Z
**Sample Size:** 3
**Overall F1:** 0.5079
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| London | http://example.org/london | capital | http://example.org/englan | Wrong predicate: used "capital" instead of "countr |
| Marie_Curie | http://example.org/marie_ | occupation | physicist | Subject matches "Marie Curie", but object "physici |

**Most Common Wrong Predicates:**

- `capital`: 1 occurrences
- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| London | England | capital | London |
| London | London | country | England |
| London | London | located in or next to body of water | River Thames |

**Most Commonly Missed Predicates:**

- `capital`: 1 occurrences
- `country`: 1 occurrences
- `located in or next to body of water`: 1 occurrences

### Per-Example Breakdown

#### Albert_Einstein

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`
- `Albert Einstein` → `place of birth` → `Ulm`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `place_of_birth` → `http://example.org/ulm`

#### London

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 3

**Gold Triples:**

- `England` → `capital` → `London`
- `London` → `country` → `England`
- `London` → `located in or next to body of water` → `River Thames`

**Predicted Triples:**

- ✗ `http://example.org/london` → `capital` → `http://example.org/england`

#### Marie_Curie

**F1:** 0.857 | **TP:** 3 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `place of birth` → `Warsaw`
- `Marie Curie` → `award received` → `Nobel Prize in Physics`

**Predicted Triples:**

- ✗ `http://example.org/marie_curie` → `occupation` → `physicist`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✓ `http://example.org/marie_curie` → `award_received` → `http://example.org/nobel_prize_in_physics`
- ✓ `http://example.org/marie_curie` → `place_of_birth` → `http://example.org/warsaw`

---

## REBEL - val

**Timestamp:** 2025-11-22T23:48:02.129Z
**Sample Size:** 10
**Overall F1:** 0.3550
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | http://example.org/23_aug | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | http://example.org/8_july | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |

**Most Common Wrong Predicates:**

- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| rebel_sample_1 | Aleksandr Grin | date of birth | 23 August 1880 |
| rebel_sample_1 | Aleksandr Grin | date of death | 8 July 1932 |
| rebel_sample_1 | Aleksandr Grin | country of citizenship | Russia |
| rebel_sample_1 | Aleksandr Grin | occupation | novelist |
| rebel_sample_2 | Eiffel Tower | located in | Paris |
| rebel_sample_2 | Eiffel Tower | country | France |
| rebel_sample_2 | Eiffel Tower | named after | Gustave Eiffel |
| rebel_sample_2 | Gustave Eiffel | occupation | engineer |
| rebel_sample_4 | Mount Everest | located in | Himalayas |
| rebel_sample_4 | Mount Everest | located in administrative entity | China |
| rebel_sample_4 | Mount Everest | located in administrative entity | Nepal |
| rebel_sample_6 | London | located on | River Thames |
| rebel_sample_8 | Great Wall of China | located in | China |
| rebel_sample_8 | Great Wall of China | made from material | stone |
| rebel_sample_8 | Great Wall of China | made from material | brick |
| rebel_sample_9 | Amazon.com | country | United States |
| rebel_sample_10 | Amazon River | located in | South America |
| rebel_sample_10 | Amazon River | country | Brazil |
| rebel_sample_10 | Amazon River | country | Peru |
| rebel_sample_10 | Amazon River | country | Colombia |

**Most Commonly Missed Predicates:**

- `country`: 5 occurrences
- `located in`: 4 occurrences
- `occupation`: 2 occurrences
- `located in administrative entity`: 2 occurrences
- `made from material`: 2 occurrences
- `date of birth`: 1 occurrences
- `date of death`: 1 occurrences
- `country of citizenship`: 1 occurrences
- `named after`: 1 occurrences
- `located on`: 1 occurrences

### Per-Example Breakdown

#### rebel_sample_1

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 4

**Gold Triples:**

- `Aleksandr Grin` → `date of birth` → `23 August 1880`
- `Aleksandr Grin` → `date of death` → `8 July 1932`
- `Aleksandr Grin` → `country of citizenship` → `Russia`
- `Aleksandr Grin` → `occupation` → `novelist`

**Predicted Triples:**

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `http://example.org/23_august_1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `http://example.org/8_july_1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`

#### rebel_sample_2

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Eiffel Tower` → `located in` → `Paris`
- `Eiffel Tower` → `country` → `France`
- `Eiffel Tower` → `named after` → `Gustave Eiffel`
- `Gustave Eiffel` → `occupation` → `engineer`

**Predicted Triples:**

(none)

#### rebel_sample_3

**F1:** 0.750 | **TP:** 3 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `date of birth` → `14 March 1879`
- `Albert Einstein` → `date of death` → `18 April 1955`
- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `date_of_birth` → `http://example.org/14_march_1879`
- ✓ `http://example.org/albert_einstein` → `date_of_death` → `http://example.org/18_april_1955`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`

#### rebel_sample_4

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Mount Everest` → `located in` → `Himalayas`
- `Mount Everest` → `located in administrative entity` → `China`
- `Mount Everest` → `located in administrative entity` → `Nepal`

**Predicted Triples:**

(none)

#### rebel_sample_5

**F1:** 1.000 | **TP:** 6 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Marie Curie` → `date of birth` → `7 November 1867`
- `Marie Curie` → `date of death` → `4 July 1934`
- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `country of citizenship` → `France`
- `Marie Curie` → `occupation` → `physicist`
- `Marie Curie` → `occupation` → `chemist`

**Predicted Triples:**

- ✓ `http://example.org/marie_curie` → `date_of_birth` → `http://example.org/7_november_1867`
- ✓ `http://example.org/marie_curie` → `date_of_death` → `http://example.org/4_july_1934`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/france`
- ✓ `http://example.org/marie_curie` → `occupation` → `physicist`
- ✓ `http://example.org/marie_curie` → `occupation` → `chemist`

#### rebel_sample_6

**F1:** 0.800 | **TP:** 2 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `London` → `capital of` → `England`
- `London` → `capital of` → `United Kingdom`
- `London` → `located on` → `River Thames`

**Predicted Triples:**

- ✓ `http://example.org/london` → `capital_of` → `http://example.org/england`
- ✓ `http://example.org/london` → `capital_of` → `http://example.org/united_kingdom`

#### rebel_sample_7

**F1:** 1.000 | **TP:** 6 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `William Shakespeare` → `date of birth` → `26 April 1564`
- `William Shakespeare` → `date of death` → `23 April 1616`
- `William Shakespeare` → `country of citizenship` → `England`
- `William Shakespeare` → `occupation` → `playwright`
- `William Shakespeare` → `occupation` → `poet`
- `William Shakespeare` → `occupation` → `actor`

**Predicted Triples:**

- ✓ `http://example.org/william_shakespeare` → `date_of_birth` → `http://example.org/26_april_1564`
- ✓ `http://example.org/william_shakespeare` → `date_of_death` → `http://example.org/23_april_1616`
- ✓ `http://example.org/william_shakespeare` → `country_of_citizenship` → `http://example.org/england`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `playwright`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `poet`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `actor`

#### rebel_sample_8

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Great Wall of China` → `located in` → `China`
- `Great Wall of China` → `made from material` → `stone`
- `Great Wall of China` → `made from material` → `brick`

**Predicted Triples:**

(none)

#### rebel_sample_9

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 4

**Gold Triples:**

- `Amazon.com` → `country` → `United States`
- `Amazon.com` → `headquarters location` → `Seattle`
- `Amazon.com` → `founded by` → `Jeff Bezos`
- `Amazon.com` → `inception` → `1994`

**Predicted Triples:**

- ✓ `http://example.org/amazoncom_inc` → `headquarters_location` → `http://example.org/seattle_washington`
- ✓ `http://example.org/amazoncom_inc` → `founded_by` → `http://example.org/jeff_bezos`
- ✓ `http://example.org/amazoncom_inc` → `inception` → `http://example.org/1994`

#### rebel_sample_10

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Amazon River` → `located in` → `South America`
- `Amazon River` → `country` → `Brazil`
- `Amazon River` → `country` → `Peru`
- `Amazon River` → `country` → `Colombia`

**Predicted Triples:**

(none)

---

## DocRED - dev

**Timestamp:** 2025-11-22T23:45:59.621Z
**Sample Size:** 3
**Overall F1:** 0.6746
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Marie_Curie | http://example.org/marie_ | occupation | physicist | Subject matches "Marie Curie", but object "physici |

**Most Common Wrong Predicates:**

- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| London | London | country | England |
| London | London | located in or next to body of water | River Thames |

**Most Commonly Missed Predicates:**

- `country`: 1 occurrences
- `located in or next to body of water`: 1 occurrences

### Per-Example Breakdown

#### Albert_Einstein

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`
- `Albert Einstein` → `place of birth` → `Ulm`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `place_of_birth` → `http://example.org/ulm`

#### London

**F1:** 0.500 | **TP:** 1 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `England` → `capital` → `London`
- `London` → `country` → `England`
- `London` → `located in or next to body of water` → `River Thames`

**Predicted Triples:**

- ✓ `http://example.org/england` → `capital` → `London`

#### Marie_Curie

**F1:** 0.857 | **TP:** 3 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `place of birth` → `Warsaw`
- `Marie Curie` → `award received` → `Nobel Prize in Physics`

**Predicted Triples:**

- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✗ `http://example.org/marie_curie` → `occupation` → `physicist`
- ✓ `http://example.org/marie_curie` → `award_received` → `Nobel Prize in Physics`
- ✓ `http://example.org/marie_curie` → `place_of_birth` → `http://example.org/warsaw`

---

## REBEL - val

**Timestamp:** 2025-11-22T23:45:49.784Z
**Sample Size:** 10
**Overall F1:** 0.3277
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | http://example.org/23_aug | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | http://example.org/8_july | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | country_of_citizenship | http://example.org/russia | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |
| rebel_sample_2 | http://example.org/eiffel | seeAlso | http://example.org/gustav | Subject matches "Eiffel Tower", but object "http:/ |
| rebel_sample_2 | http://example.org/champ_ | seeAlso | http://example.org/paris | Used generic RDFS predicate: seeAlso |
| rebel_sample_2 | http://example.org/paris | seeAlso | http://example.org/france | Used generic RDFS predicate: seeAlso |
| rebel_sample_2 | http://example.org/gustav | founded_by | http://example.org/gustav | Subject matches "Gustave Eiffel", but object "http |
| rebel_sample_4 | http://example.org/mount_ | seeAlso | http://example.org/mahala | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mahala | seeAlso | http://example.org/himala | Used generic RDFS predicate: seeAlso |
| rebel_sample_8 | http://example.org/great_ | seeAlso | http://example.org/china | Wrong predicate: used "seeAlso" instead of "locate |
| rebel_sample_9 | http://example.org/seattl | capital_of | http://example.org/washin | No partial match found in gold set |
| rebel_sample_10 | http://example.org/brazil | seeAlso | http://example.org/amazon | Used generic RDFS predicate: seeAlso |
| rebel_sample_10 | http://example.org/peru | seeAlso | http://example.org/amazon | Used generic RDFS predicate: seeAlso |
| rebel_sample_10 | http://example.org/colomb | seeAlso | http://example.org/amazon | Used generic RDFS predicate: seeAlso |
| rebel_sample_10 | http://example.org/south_ | seeAlso | http://example.org/amazon | Used generic RDFS predicate: seeAlso |

**Most Common Wrong Predicates:**

- `seeAlso`: 10 occurrences
- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `country_of_citizenship`: 1 occurrences
- `occupation`: 1 occurrences
- `founded_by`: 1 occurrences
- `capital_of`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| rebel_sample_1 | Aleksandr Grin | date of birth | 23 August 1880 |
| rebel_sample_1 | Aleksandr Grin | date of death | 8 July 1932 |
| rebel_sample_1 | Aleksandr Grin | country of citizenship | Russia |
| rebel_sample_1 | Aleksandr Grin | occupation | novelist |
| rebel_sample_2 | Eiffel Tower | located in | Paris |
| rebel_sample_2 | Eiffel Tower | country | France |
| rebel_sample_2 | Eiffel Tower | named after | Gustave Eiffel |
| rebel_sample_2 | Gustave Eiffel | occupation | engineer |
| rebel_sample_4 | Mount Everest | located in | Himalayas |
| rebel_sample_4 | Mount Everest | located in administrative entity | China |
| rebel_sample_4 | Mount Everest | located in administrative entity | Nepal |
| rebel_sample_6 | London | located on | River Thames |
| rebel_sample_8 | Great Wall of China | located in | China |
| rebel_sample_8 | Great Wall of China | made from material | stone |
| rebel_sample_8 | Great Wall of China | made from material | brick |
| rebel_sample_9 | Amazon.com | country | United States |
| rebel_sample_10 | Amazon River | located in | South America |
| rebel_sample_10 | Amazon River | country | Brazil |
| rebel_sample_10 | Amazon River | country | Peru |
| rebel_sample_10 | Amazon River | country | Colombia |

**Most Commonly Missed Predicates:**

- `country`: 5 occurrences
- `located in`: 4 occurrences
- `occupation`: 2 occurrences
- `located in administrative entity`: 2 occurrences
- `made from material`: 2 occurrences
- `date of birth`: 1 occurrences
- `date of death`: 1 occurrences
- `country of citizenship`: 1 occurrences
- `named after`: 1 occurrences
- `located on`: 1 occurrences

### Per-Example Breakdown

#### rebel_sample_1

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Aleksandr Grin` → `date of birth` → `23 August 1880`
- `Aleksandr Grin` → `date of death` → `8 July 1932`
- `Aleksandr Grin` → `country of citizenship` → `Russia`
- `Aleksandr Grin` → `occupation` → `novelist`

**Predicted Triples:**

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `http://example.org/23_august_1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `http://example.org/8_july_1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `country_of_citizenship` → `http://example.org/russia`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`

#### rebel_sample_2

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Eiffel Tower` → `located in` → `Paris`
- `Eiffel Tower` → `country` → `France`
- `Eiffel Tower` → `named after` → `Gustave Eiffel`
- `Gustave Eiffel` → `occupation` → `engineer`

**Predicted Triples:**

- ✗ `http://example.org/eiffel_tower` → `seeAlso` → `http://example.org/gustave_eiffel`
- ✗ `http://example.org/champ_de_mars` → `seeAlso` → `http://example.org/paris`
- ✗ `http://example.org/paris` → `seeAlso` → `http://example.org/france`
- ✗ `http://example.org/gustave_eiffels_company` → `founded_by` → `http://example.org/gustave_eiffel`

#### rebel_sample_3

**F1:** 0.750 | **TP:** 3 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `date of birth` → `14 March 1879`
- `Albert Einstein` → `date of death` → `18 April 1955`
- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `date_of_birth` → `14 March 1879`
- ✓ `http://example.org/albert_einstein` → `date_of_death` → `18 April 1955`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`

#### rebel_sample_4

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 3

**Gold Triples:**

- `Mount Everest` → `located in` → `Himalayas`
- `Mount Everest` → `located in administrative entity` → `China`
- `Mount Everest` → `located in administrative entity` → `Nepal`

**Predicted Triples:**

- ✗ `http://example.org/mount_everest` → `seeAlso` → `http://example.org/mahalangur_himal`
- ✗ `http://example.org/mahalangur_himal` → `seeAlso` → `http://example.org/himalayas`

#### rebel_sample_5

**F1:** 0.727 | **TP:** 4 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `Marie Curie` → `date of birth` → `7 November 1867`
- `Marie Curie` → `date of death` → `4 July 1934`
- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `country of citizenship` → `France`
- `Marie Curie` → `occupation` → `physicist`
- `Marie Curie` → `occupation` → `chemist`

**Predicted Triples:**

- ✓ `http://example.org/marie_curie` → `date_of_birth` → `http://example.org/7_november_1867`
- ✓ `http://example.org/marie_curie` → `date_of_death` → `http://example.org/4_july_1934`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/france`
- ✓ `http://example.org/marie_curie` → `occupation` → `physicist and chemist`

#### rebel_sample_6

**F1:** 0.800 | **TP:** 2 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `London` → `capital of` → `England`
- `London` → `capital of` → `United Kingdom`
- `London` → `located on` → `River Thames`

**Predicted Triples:**

- ✓ `http://example.org/london` → `capital_of` → `http://example.org/england`
- ✓ `http://example.org/london` → `capital_of` → `http://example.org/united_kingdom`

#### rebel_sample_7

**F1:** 1.000 | **TP:** 6 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `William Shakespeare` → `date of birth` → `26 April 1564`
- `William Shakespeare` → `date of death` → `23 April 1616`
- `William Shakespeare` → `country of citizenship` → `England`
- `William Shakespeare` → `occupation` → `playwright`
- `William Shakespeare` → `occupation` → `poet`
- `William Shakespeare` → `occupation` → `actor`

**Predicted Triples:**

- ✓ `http://example.org/william_shakespeare` → `date_of_birth` → `http://example.org/26_april_1564`
- ✓ `http://example.org/william_shakespeare` → `date_of_death` → `http://example.org/23_april_1616`
- ✓ `http://example.org/william_shakespeare` → `country_of_citizenship` → `http://example.org/england`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `playwright`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `poet`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `actor`

#### rebel_sample_8

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 3

**Gold Triples:**

- `Great Wall of China` → `located in` → `China`
- `Great Wall of China` → `made from material` → `stone`
- `Great Wall of China` → `made from material` → `brick`

**Predicted Triples:**

- ✗ `http://example.org/great_wall_of_china` → `seeAlso` → `http://example.org/china`

#### rebel_sample_9

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Amazon.com` → `country` → `United States`
- `Amazon.com` → `headquarters location` → `Seattle`
- `Amazon.com` → `founded by` → `Jeff Bezos`
- `Amazon.com` → `inception` → `1994`

**Predicted Triples:**

- ✓ `http://example.org/amazoncom_inc` → `headquarters_location` → `http://example.org/seattle`
- ✓ `http://example.org/amazoncom_inc` → `founded_by` → `http://example.org/jeff_bezos`
- ✓ `http://example.org/amazoncom_inc` → `inception` → `http://example.org/1994`
- ✗ `http://example.org/seattle` → `capital_of` → `http://example.org/washington`

#### rebel_sample_10

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Amazon River` → `located in` → `South America`
- `Amazon River` → `country` → `Brazil`
- `Amazon River` → `country` → `Peru`
- `Amazon River` → `country` → `Colombia`

**Predicted Triples:**

- ✗ `http://example.org/brazil` → `seeAlso` → `http://example.org/amazon_river`
- ✗ `http://example.org/peru` → `seeAlso` → `http://example.org/amazon_river`
- ✗ `http://example.org/colombia` → `seeAlso` → `http://example.org/amazon_river`
- ✗ `http://example.org/south_america` → `seeAlso` → `http://example.org/amazon_river`

---

## DocRED - dev

**Timestamp:** 2025-11-22T23:44:10.332Z
**Sample Size:** 3
**Overall F1:** 0.6746
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Marie_Curie | http://example.org/marie_ | occupation | physicist | Subject matches "Marie Curie", but object "physici |

**Most Common Wrong Predicates:**

- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| London | London | country | England |
| London | London | located in or next to body of water | River Thames |

**Most Commonly Missed Predicates:**

- `country`: 1 occurrences
- `located in or next to body of water`: 1 occurrences

### Per-Example Breakdown

#### Albert_Einstein

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`
- `Albert Einstein` → `place of birth` → `Ulm`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`
- ✓ `http://example.org/albert_einstein` → `place_of_birth` → `http://example.org/ulm`

#### London

**F1:** 0.500 | **TP:** 1 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `England` → `capital` → `London`
- `London` → `country` → `England`
- `London` → `located in or next to body of water` → `River Thames`

**Predicted Triples:**

- ✓ `http://example.org/england` → `capital` → `London`

#### Marie_Curie

**F1:** 0.857 | **TP:** 3 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `place of birth` → `Warsaw`
- `Marie Curie` → `award received` → `Nobel Prize in Physics`

**Predicted Triples:**

- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✗ `http://example.org/marie_curie` → `occupation` → `physicist`
- ✓ `http://example.org/marie_curie` → `award_received` → `Nobel Prize in Physics`
- ✓ `http://example.org/marie_curie` → `place_of_birth` → `http://example.org/warsaw`

---

## REBEL - val

**Timestamp:** 2025-11-22T23:43:59.671Z
**Sample Size:** 10
**Overall F1:** 0.3527
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | 23 August 1880 | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | 8 July 1932 | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | country_of_citizenship | http://example.org/russia | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |
| rebel_sample_2 | http://example.org/eiffel | seeAlso | http://example.org/champ_ | Subject matches "Eiffel Tower", but object "http:/ |
| rebel_sample_2 | http://example.org/eiffel | seeAlso | http://example.org/gustav | Subject matches "Eiffel Tower", but object "http:/ |
| rebel_sample_2 | http://example.org/paris | capital_of | http://example.org/france | No partial match found in gold set |
| rebel_sample_4 | http://example.org/mount_ | seeAlso | http://example.org/mahala | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mount_ | seeAlso | http://example.org/himala | Wrong predicate: used "seeAlso" instead of "locate |
| rebel_sample_4 | http://example.org/mount_ | seeAlso | http://example.org/china | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mount_ | seeAlso | http://example.org/nepal | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mahala | seeAlso | http://example.org/himala | Used generic RDFS predicate: seeAlso |
| rebel_sample_8 | http://example.org/the_gr | seeAlso | http://example.org/china | Wrong predicate: used "seeAlso" instead of "locate |
| rebel_sample_9 | http://example.org/seattl | capital_of | http://example.org/united | No partial match found in gold set |
| rebel_sample_10 | http://example.org/amazon | seeAlso | http://example.org/south_ | Wrong predicate: used "seeAlso" instead of "locate |
| rebel_sample_10 | http://example.org/amazon | seeAlso | http://example.org/brazil | Subject matches "Amazon River", but object "http:/ |
| rebel_sample_10 | http://example.org/amazon | seeAlso | http://example.org/peru | Subject matches "Amazon River", but object "http:/ |
| rebel_sample_10 | http://example.org/amazon | seeAlso | http://example.org/colomb | Subject matches "Amazon River", but object "http:/ |

**Most Common Wrong Predicates:**

- `seeAlso`: 12 occurrences
- `capital_of`: 2 occurrences
- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `country_of_citizenship`: 1 occurrences
- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| rebel_sample_1 | Aleksandr Grin | date of birth | 23 August 1880 |
| rebel_sample_1 | Aleksandr Grin | date of death | 8 July 1932 |
| rebel_sample_1 | Aleksandr Grin | country of citizenship | Russia |
| rebel_sample_1 | Aleksandr Grin | occupation | novelist |
| rebel_sample_2 | Eiffel Tower | located in | Paris |
| rebel_sample_2 | Eiffel Tower | country | France |
| rebel_sample_2 | Eiffel Tower | named after | Gustave Eiffel |
| rebel_sample_4 | Mount Everest | located in | Himalayas |
| rebel_sample_4 | Mount Everest | located in administrative entity | China |
| rebel_sample_4 | Mount Everest | located in administrative entity | Nepal |
| rebel_sample_6 | London | located on | River Thames |
| rebel_sample_8 | Great Wall of China | located in | China |
| rebel_sample_8 | Great Wall of China | made from material | stone |
| rebel_sample_8 | Great Wall of China | made from material | brick |
| rebel_sample_9 | Amazon.com | country | United States |
| rebel_sample_10 | Amazon River | located in | South America |
| rebel_sample_10 | Amazon River | country | Brazil |
| rebel_sample_10 | Amazon River | country | Peru |
| rebel_sample_10 | Amazon River | country | Colombia |

**Most Commonly Missed Predicates:**

- `country`: 5 occurrences
- `located in`: 4 occurrences
- `located in administrative entity`: 2 occurrences
- `made from material`: 2 occurrences
- `date of birth`: 1 occurrences
- `date of death`: 1 occurrences
- `country of citizenship`: 1 occurrences
- `occupation`: 1 occurrences
- `named after`: 1 occurrences
- `located on`: 1 occurrences

### Per-Example Breakdown

#### rebel_sample_1

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Aleksandr Grin` → `date of birth` → `23 August 1880`
- `Aleksandr Grin` → `date of death` → `8 July 1932`
- `Aleksandr Grin` → `country of citizenship` → `Russia`
- `Aleksandr Grin` → `occupation` → `novelist`

**Predicted Triples:**

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `23 August 1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `8 July 1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `country_of_citizenship` → `http://example.org/russia`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`

#### rebel_sample_2

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Eiffel Tower` → `located in` → `Paris`
- `Eiffel Tower` → `country` → `France`
- `Eiffel Tower` → `named after` → `Gustave Eiffel`
- `Gustave Eiffel` → `occupation` → `engineer`

**Predicted Triples:**

- ✗ `http://example.org/eiffel_tower` → `seeAlso` → `http://example.org/champ_de_mars`
- ✗ `http://example.org/eiffel_tower` → `seeAlso` → `http://example.org/gustave_eiffel`
- ✗ `http://example.org/paris` → `capital_of` → `http://example.org/france`
- ✓ `http://example.org/gustave_eiffel` → `occupation` → `engineer`

#### rebel_sample_3

**F1:** 0.750 | **TP:** 3 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `date of birth` → `14 March 1879`
- `Albert Einstein` → `date of death` → `18 April 1955`
- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `date_of_birth` → `14 March 1879`
- ✓ `http://example.org/albert_einstein` → `date_of_death` → `18 April 1955`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`
- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`

#### rebel_sample_4

**F1:** 0.000 | **TP:** 0 | **FP:** 5 | **FN:** 3

**Gold Triples:**

- `Mount Everest` → `located in` → `Himalayas`
- `Mount Everest` → `located in administrative entity` → `China`
- `Mount Everest` → `located in administrative entity` → `Nepal`

**Predicted Triples:**

- ✗ `http://example.org/mount_everest` → `seeAlso` → `http://example.org/mahalangur_himal`
- ✗ `http://example.org/mount_everest` → `seeAlso` → `http://example.org/himalayas`
- ✗ `http://example.org/mount_everest` → `seeAlso` → `http://example.org/china`
- ✗ `http://example.org/mount_everest` → `seeAlso` → `http://example.org/nepal`
- ✗ `http://example.org/mahalangur_himal` → `seeAlso` → `http://example.org/himalayas`

#### rebel_sample_5

**F1:** 0.727 | **TP:** 4 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `Marie Curie` → `date of birth` → `7 November 1867`
- `Marie Curie` → `date of death` → `4 July 1934`
- `Marie Curie` → `country of citizenship` → `Poland`
- `Marie Curie` → `country of citizenship` → `France`
- `Marie Curie` → `occupation` → `physicist`
- `Marie Curie` → `occupation` → `chemist`

**Predicted Triples:**

- ✓ `http://example.org/marie_curie` → `date_of_birth` → `http://example.org/7_november_1867`
- ✓ `http://example.org/marie_curie` → `date_of_death` → `http://example.org/4_july_1934`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/poland`
- ✓ `http://example.org/marie_curie` → `country_of_citizenship` → `http://example.org/france`
- ✓ `http://example.org/marie_curie` → `occupation` → `physicist and chemist`

#### rebel_sample_6

**F1:** 0.800 | **TP:** 2 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `London` → `capital of` → `England`
- `London` → `capital of` → `United Kingdom`
- `London` → `located on` → `River Thames`

**Predicted Triples:**

- ✓ `http://example.org/london` → `capital_of` → `http://example.org/england`
- ✓ `http://example.org/london` → `capital_of` → `http://example.org/united_kingdom`

#### rebel_sample_7

**F1:** 1.000 | **TP:** 6 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `William Shakespeare` → `date of birth` → `26 April 1564`
- `William Shakespeare` → `date of death` → `23 April 1616`
- `William Shakespeare` → `country of citizenship` → `England`
- `William Shakespeare` → `occupation` → `playwright`
- `William Shakespeare` → `occupation` → `poet`
- `William Shakespeare` → `occupation` → `actor`

**Predicted Triples:**

- ✓ `http://example.org/william_shakespeare` → `date_of_birth` → `26 April 1564`
- ✓ `http://example.org/william_shakespeare` → `date_of_death` → `23 April 1616`
- ✓ `http://example.org/william_shakespeare` → `country_of_citizenship` → `http://example.org/england`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `playwright`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `poet`
- ✓ `http://example.org/william_shakespeare` → `occupation` → `actor`

#### rebel_sample_8

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 3

**Gold Triples:**

- `Great Wall of China` → `located in` → `China`
- `Great Wall of China` → `made from material` → `stone`
- `Great Wall of China` → `made from material` → `brick`

**Predicted Triples:**

- ✗ `http://example.org/the_great_wall_of_china` → `seeAlso` → `http://example.org/china`

#### rebel_sample_9

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Amazon.com` → `country` → `United States`
- `Amazon.com` → `headquarters location` → `Seattle`
- `Amazon.com` → `founded by` → `Jeff Bezos`
- `Amazon.com` → `inception` → `1994`

**Predicted Triples:**

- ✓ `http://example.org/amazoncom_inc` → `headquarters_location` → `http://example.org/seattle_washington`
- ✓ `http://example.org/amazoncom_inc` → `founded_by` → `http://example.org/jeff_bezos`
- ✓ `http://example.org/amazoncom_inc` → `inception` → `http://example.org/1994`
- ✗ `http://example.org/seattle_washington` → `capital_of` → `http://example.org/united_states_of_america`

#### rebel_sample_10

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Amazon River` → `located in` → `South America`
- `Amazon River` → `country` → `Brazil`
- `Amazon River` → `country` → `Peru`
- `Amazon River` → `country` → `Colombia`

**Predicted Triples:**

- ✗ `http://example.org/amazon_river` → `seeAlso` → `http://example.org/south_america`
- ✗ `http://example.org/amazon_river` → `seeAlso` → `http://example.org/brazil`
- ✗ `http://example.org/amazon_river` → `seeAlso` → `http://example.org/peru`
- ✗ `http://example.org/amazon_river` → `seeAlso` → `http://example.org/colombia`

---

## DocRED - dev

**Timestamp:** 2025-11-22T23:40:12.630Z
**Sample Size:** 1
**Overall F1:** 0.6667
**Failed Extractions:** 0

### Per-Example Breakdown

#### Albert_Einstein

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`
- `Albert Einstein` → `place of birth` → `Ulm`

**Predicted Triples:**

- ✓ `http://example.org/albert_einstein` → `occupation` → `theoretical physicist`
- ✓ `http://example.org/albert_einstein` → `place_of_birth` → `http://example.org/ulm`
- ✓ `http://example.org/albert_einstein` → `country_of_citizenship` → `http://example.org/germany`

---

## REBEL - val

**Timestamp:** 2025-11-22T23:39:59.312Z
**Sample Size:** 1
**Overall F1:** 0.0000
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | http://example.org/23_aug | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | http://example.org/8_july | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | country_of_citizenship | http://example.org/russia | No partial match found in gold set |

**Most Common Wrong Predicates:**

- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `occupation`: 1 occurrences
- `country_of_citizenship`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| rebel_sample_1 | Aleksandr Grin | (missing) | 23 August 1880 |
| rebel_sample_1 | Aleksandr Grin | (missing) | 8 July 1932 |
| rebel_sample_1 | Aleksandr Grin | (missing) | Russia |
| rebel_sample_1 | Aleksandr Grin | (missing) | novelist |

**Most Commonly Missed Predicates:**

- `(missing)`: 4 occurrences

### Per-Example Breakdown

#### rebel_sample_1

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Aleksandr Grin` → `(no predicate)` → `23 August 1880`
- `Aleksandr Grin` → `(no predicate)` → `8 July 1932`
- `Aleksandr Grin` → `(no predicate)` → `Russia`
- `Aleksandr Grin` → `(no predicate)` → `novelist`

**Predicted Triples:**

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `http://example.org/23_august_1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `http://example.org/8_july_1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `country_of_citizenship` → `http://example.org/russia`

---

## REBEL - val

**Timestamp:** 2025-11-22T23:39:42.064Z
**Sample Size:** 1
**Overall F1:** 0.0000
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | http://example.org/23_aug | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | http://example.org/8_july | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |

**Most Common Wrong Predicates:**

- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| rebel_sample_1 | Aleksandr Grin | (missing) | 23 August 1880 |
| rebel_sample_1 | Aleksandr Grin | (missing) | 8 July 1932 |
| rebel_sample_1 | Aleksandr Grin | (missing) | Russia |
| rebel_sample_1 | Aleksandr Grin | (missing) | novelist |

**Most Commonly Missed Predicates:**

- `(missing)`: 4 occurrences

### Per-Example Breakdown

#### rebel_sample_1

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 4

**Gold Triples:**

- `Aleksandr Grin` → `(no predicate)` → `23 August 1880`
- `Aleksandr Grin` → `(no predicate)` → `8 July 1932`
- `Aleksandr Grin` → `(no predicate)` → `Russia`
- `Aleksandr Grin` → `(no predicate)` → `novelist`

**Predicted Triples:**

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `http://example.org/23_august_1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `http://example.org/8_july_1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:39:03.881Z
**Sample Size:** 10
**Overall F1:** 0.2386
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id15 | http://example.org/a_wiza | ISBN_number | 978-0-15-204770-2 | Subject matches "A_Wizard_of_Mars", but object "97 |
| Id3 | http://example.org/aaron_ | bandMember | http://example.org/lotus_ | Subject matches "Aaron_Turner", but object "http:/ |
| Id3 | http://example.org/aaron_ | formerBandMember | http://example.org/old_ma | Wrong predicate: used "formerBandMember" instead o |
| Id6 | http://example.org/halton | doctoralAdvisor | http://example.org/walter | No partial match found in gold set |
| Id6 | http://example.org/walter | discovered | http://example.org/1036_g | Subject matches "Walter_Baade", but object "http:/ |
| Id6 | http://example.org/walter | almaMater | http://example.org/univer | Subject matches "Walter_Baade", but object "http:/ |
| Id6 | http://example.org/allan_ | doctoralAdvisor | http://example.org/walter | No partial match found in gold set |
| Id20 | http://example.org/anders | associatedBand_associatedMusicalArtist | http://example.org/billy_ | Wrong predicate: used "associatedBand_associatedMu |
| Id20 | http://example.org/anders | associatedBand_associatedMusicalArtist | http://example.org/theres | Subject matches "Anders_Osborne", but object "http |
| Id8 | http://example.org/lockhe | transportAircraft | Transport Aircraft | No partial match found in gold set |
| Id8 | http://example.org/lockhe | attackAircraft | Attack Aircraft | No partial match found in gold set |
| Id10 | http://example.org/atlas_ | state | http://example.org/united | Wrong predicate: used "state" instead of "countryO |
| Id10 | http://example.org/atlas_ | finalFlight | March 16, 1998 | Subject matches "Atlas_II", but object "March 16,  |

**Most Common Wrong Predicates:**

- `doctoralAdvisor`: 2 occurrences
- `associatedBand_associatedMusicalArtist`: 2 occurrences
- `ISBN_number`: 1 occurrences
- `bandMember`: 1 occurrences
- `formerBandMember`: 1 occurrences
- `discovered`: 1 occurrences
- `almaMater`: 1 occurrences
- `transportAircraft`: 1 occurrences
- `attackAircraft`: 1 occurrences
- `state`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id15 | A_Wizard_of_Mars | isbnNumber | "978-0-15-204770-2" |
| Id3 | Aaron_Turner | associatedBand/associatedMusicalArtist | Old_Man_Gloom |
| Id3 | Aaron_Turner | associatedBand/associatedMusicalArtist | Lotus_Eaters_(band) |
| Id3 | Aaron_Turner | genre | Electroacoustic_music |
| Id6 | 1036_Ganymed | discoverer | Walter_Baade |
| Id6 | Walter_Baade | doctoralStudent | Halton_Arp |
| Id6 | Walter_Baade | doctoralStudent | Allan_Sandage |
| Id6 | Walter_Baade | birthPlace | German_Empire |
| Id6 | Walter_Baade | almaMater | University_of_Göttingen |
| Id3 | Abraham_A._Ribicoff | deathPlace | New_York_City |
| Id3 | Abraham_A._Ribicoff | birthPlace | Connecticut |
| Id3 | Abraham_A._Ribicoff | nationality | American |
| Id20 | Anders_Osborne | associatedBand/associatedMusicalArtist | Billy_Iuso |
| Id20 | Anders_Osborne | associatedBand/associatedMusicalArtist | Theresa_Andersson |
| Id8 | Al_Asad_Airbase | operatingOrganisation | United_States_Air_Force |
| Id8 | United_States_Air_Force | battle | Invasion_of_Grenada |
| Id8 | United_States_Air_Force | attackAircraft | Lockheed_AC-130 |
| Id8 | United_States_Air_Force | battle | Korean_War |
| Id8 | United_States_Air_Force | transportAircraft | Lockheed_C-130_Hercules |
| Id10 | Atlas_II | countryOrigin | United_States |
| ... | ... | ... | ... (2 more) |

**Most Commonly Missed Predicates:**

- `associatedBand/associatedMusicalArtist`: 4 occurrences
- `doctoralStudent`: 2 occurrences
- `birthPlace`: 2 occurrences
- `battle`: 2 occurrences
- `isbnNumber`: 1 occurrences
- `genre`: 1 occurrences
- `discoverer`: 1 occurrences
- `almaMater`: 1 occurrences
- `deathPlace`: 1 occurrences
- `nationality`: 1 occurrences

### Per-Example Breakdown

#### Id15

**F1:** 0.500 | **TP:** 1 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `A_Wizard_of_Mars` → `numberOfPages` → `"560"`
- `A_Wizard_of_Mars` → `isbnNumber` → `"978-0-15-204770-2"`

**Predicted Triples:**

- ✓ `http://example.org/a_wizard_of_mars` → `numberOfPages` → `560`
- ✗ `http://example.org/a_wizard_of_mars` → `ISBN_number` → `978-0-15-204770-2`

#### Id3

**F1:** 0.286 | **TP:** 1 | **FP:** 2 | **FN:** 3

**Gold Triples:**

- `Aaron_Turner` → `associatedBand/associatedMusicalArtist` → `Old_Man_Gloom`
- `Aaron_Turner` → `associatedBand/associatedMusicalArtist` → `Lotus_Eaters_(band)`
- `Aaron_Turner` → `genre` → `Electroacoustic_music`
- `Aaron_Turner` → `activeYearsStartYear` → `1995`

**Predicted Triples:**

- ✗ `http://example.org/aaron_turner` → `bandMember` → `http://example.org/lotus_eaters`
- ✗ `http://example.org/aaron_turner` → `formerBandMember` → `http://example.org/old_man_gloom`
- ✓ `http://example.org/aaron_turner` → `activeYearsStartYear` → `1995`

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `A.F.C._Blackpool` → `manager` → `Stuart_Parker_(footballer)`
- `Stuart_Parker_(footballer)` → `club` → `Sparta_Rotterdam`

**Predicted Triples:**

- ✓ `http://example.org/afc_blackpool` → `manager` → `http://example.org/stuart_parker`
- ✓ `http://example.org/stuart_parker` → `club` → `http://example.org/sparta_rotterdam`

#### Id6

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 5

**Gold Triples:**

- `1036_Ganymed` → `discoverer` → `Walter_Baade`
- `Walter_Baade` → `doctoralStudent` → `Halton_Arp`
- `Walter_Baade` → `doctoralStudent` → `Allan_Sandage`
- `Walter_Baade` → `birthPlace` → `German_Empire`
- `Walter_Baade` → `almaMater` → `University_of_Göttingen`

**Predicted Triples:**

- ✗ `http://example.org/halton_arp` → `doctoralAdvisor` → `http://example.org/walter_baade`
- ✗ `http://example.org/walter_baade` → `discovered` → `http://example.org/1036_ganymed`
- ✗ `http://example.org/walter_baade` → `almaMater` → `http://example.org/university_of_gottingen`
- ✗ `http://example.org/allan_sandage` → `doctoralAdvisor` → `http://example.org/walter_baade`

#### Id3

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 5

**Gold Triples:**

- `Abraham_A._Ribicoff` → `office` → `"United States Secretary of Health, Education, and Welfare"`
- `Abraham_A._Ribicoff` → `party` → `Democratic_Party_(United_States)`
- `Abraham_A._Ribicoff` → `deathPlace` → `New_York_City`
- `Abraham_A._Ribicoff` → `birthPlace` → `Connecticut`
- `Abraham_A._Ribicoff` → `nationality` → `American`

**Predicted Triples:**

- ✓ `http://example.org/abraham_a_ribicoff` → `party` → `http://example.org/democratic_party`
- ✓ `http://example.org/abraham_a_ribicoff` → `office_workedAt_workedAs_` → `United States Secretary of Health, Education, and Welfare`

#### Id20

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Billy_Iuso`
- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Theresa_Andersson`

**Predicted Triples:**

- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/billy_iuso`
- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/theresa_andersson`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 5

**Gold Triples:**

- `Al_Asad_Airbase` → `operatingOrganisation` → `United_States_Air_Force`
- `United_States_Air_Force` → `battle` → `Invasion_of_Grenada`
- `United_States_Air_Force` → `attackAircraft` → `Lockheed_AC-130`
- `United_States_Air_Force` → `battle` → `Korean_War`
- `United_States_Air_Force` → `transportAircraft` → `Lockheed_C-130_Hercules`

**Predicted Triples:**

- ✗ `http://example.org/lockheed_c-130_hercules` → `transportAircraft` → `Transport Aircraft`
- ✗ `http://example.org/lockheed_ac-130` → `attackAircraft` → `Attack Aircraft`

#### Id10

**F1:** 0.600 | **TP:** 3 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Atlas_II` → `countryOrigin` → `United_States`
- `Atlas_II` → `finalFlight` → `1998-03-16`
- `Atlas_II` → `launchSite` → `Vandenberg_Air_Force_Base`
- `Atlas_II` → `diameter` → `3.04 m`
- `Atlas_II` → `launchSite` → `Spaceport_Florida_Launch_Complex_36`

**Predicted Triples:**

- ✓ `http://example.org/atlas_ii` → `launchSite` → `http://example.org/vandenberg_air_force_base`
- ✓ `http://example.org/atlas_ii` → `launchSite` → `http://example.org/spaceport_florida_launch_complex_36`
- ✗ `http://example.org/atlas_ii` → `state` → `http://example.org/united_states`
- ✓ `http://example.org/atlas_ii` → `diameter` → `3.04 m`
- ✗ `http://example.org/atlas_ii` → `finalFlight` → `March 16, 1998`

#### Id27

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Columbus_Blue_Jackets` → `city` → `Columbus,_Ohio`

**Predicted Triples:**

- ✓ `http://example.org/columbus_blue_jackets` → `city` → `http://example.org/columbus_ohio`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `Hypermarcas` → `location` → `Brazil`
- `Hypermarcas` → `product` → `Drugs`

**Predicted Triples:**

- ✓ `http://example.org/hypermarcas` → `product` → `http://example.org/pharmaceutical_drugs`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:36:48.122Z
**Sample Size:** 10
**Overall F1:** 0.2500
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id22 | http://example.org/anders | associatedBand_associatedMusicalArtist | http://example.org/voice_ | Subject matches "Anders_Osborne", but object "http |
| Id22 | http://example.org/anders | associatedBand_associatedMusicalArtist | http://example.org/tab_be | Subject matches "Anders_Osborne", but object "http |
| Id22 | http://example.org/anders | associatedBand_associatedMusicalArtist | http://example.org/billy_ | Wrong predicate: used "associatedBand_associatedMu |
| Id3 | http://example.org/abdul_ | isPartOf | http://example.org/kingdo | Subject matches "Abdul_Taib_Mahmud", but object "h |
| Id8 | http://example.org/hok_sv | architect | http://example.org/3arena | No partial match found in gold set |
| Id10 | http://example.org/103_he | discovered | http://example.org/james_ | Wrong predicate: used "discovered" instead of "dis |
| Id10 | http://example.org/james_ | discoverer | http://example.org/103_he | Subject matches "James_Craig_Watson", but object " |
| Id2 | http://example.org/ottoma | battle | http://example.org/battle | No partial match found in gold set |
| Id17 | http://example.org/alekse | countryOrigin | http://example.org/finlan | Wrong predicate: used "countryOrigin" instead of " |
| Id17 | http://example.org/helsin | country | http://example.org/finlan | No partial match found in gold set |

**Most Common Wrong Predicates:**

- `associatedBand_associatedMusicalArtist`: 3 occurrences
- `isPartOf`: 1 occurrences
- `architect`: 1 occurrences
- `discovered`: 1 occurrences
- `discoverer`: 1 occurrences
- `battle`: 1 occurrences
- `countryOrigin`: 1 occurrences
- `country`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id22 | Anders_Osborne | associatedBand/associatedMusicalArtist | Billy_Iuso |
| Id22 | Anders_Osborne | associatedBand/associatedMusicalArtist | Tab_Benoit |
| Id22 | Anders_Osborne | associatedBand/associatedMusicalArtist | Voice_of_the_Wetlands_All-Star |
| Id3 | Abdul_Taib_Mahmud | birthPlace | Kingdom_of_Sarawak |
| Id8 | 3Arena | architect | "HOK SVE" |
| Id12 | Akeem_Priestley | club | FK_Mughan |
| Id8 | Blockbuster_(comicsCharacter) | creator | Roger_Stern |
| Id8 | Blockbuster_(comicsCharacter) | creator | Tom_Lyle |
| Id10 | 103_Hera | discoverer | James_Craig_Watson |
| Id10 | James_Craig_Watson | nationality | Canada |
| Id10 | James_Craig_Watson | deathPlace | Madison,_Wisconsin |
| Id10 | James_Craig_Watson | deathCause | Peritonitis |
| Id2 | Baku_Turkish_Martyrs'_Memorial | material | "Red granite and white marble" |
| Id18 | AIDS_(journal) | publisher | Lippincott_Williams_&_Wilkins |
| Id17 | Aleksey_Chirikov_(icebreaker) | builder | Finland |
| Id17 | Aleksey_Chirikov_(icebreaker) | builder | Helsinki |

**Most Commonly Missed Predicates:**

- `associatedBand/associatedMusicalArtist`: 3 occurrences
- `creator`: 2 occurrences
- `builder`: 2 occurrences
- `birthPlace`: 1 occurrences
- `architect`: 1 occurrences
- `club`: 1 occurrences
- `discoverer`: 1 occurrences
- `nationality`: 1 occurrences
- `deathPlace`: 1 occurrences
- `deathCause`: 1 occurrences

### Per-Example Breakdown

#### Id22

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Billy_Iuso`
- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Tab_Benoit`
- `Anders_Osborne` → `genre` → `Rock_music`
- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Voice_of_the_Wetlands_All-Stars`

**Predicted Triples:**

- ✓ `http://example.org/anders_osborne` → `genre` → `http://example.org/rock_music`
- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/voice_of_the_wetlands_all-stars`
- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/tab_benoit`
- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/billy_iuso`

#### Id3

**F1:** 0.500 | **TP:** 1 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Abdul_Taib_Mahmud` → `party` → `Parti_Pesaka_Bumiputera_Bersatu`
- `Abdul_Taib_Mahmud` → `birthPlace` → `Kingdom_of_Sarawak`

**Predicted Triples:**

- ✓ `http://example.org/abdul_taib_mahmud` → `party` → `http://example.org/parti_pesaka_bumiputera_bersatu`
- ✗ `http://example.org/abdul_taib_mahmud` → `isPartOf` → `http://example.org/kingdom_of_sarawak`

#### Id12

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Bakewell_tart` → `ingredient` → `Frangipane`

**Predicted Triples:**

- ✓ `http://example.org/bakewell_tart` → `ingredient` → `http://example.org/frangipane`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `3Arena` → `architect` → `"HOK SVE"`

**Predicted Triples:**

- ✗ `http://example.org/hok_sve` → `architect` → `http://example.org/3arena`

#### Id12

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Akeem_Priestley` → `club` → `FK_Mughan`

**Predicted Triples:**

(none)

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `Blockbuster_(comicsCharacter)` → `creator` → `Roger_Stern`
- `Blockbuster_(comicsCharacter)` → `creator` → `Tom_Lyle`

**Predicted Triples:**

(none)

#### Id10

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 4

**Gold Triples:**

- `103_Hera` → `discoverer` → `James_Craig_Watson`
- `James_Craig_Watson` → `nationality` → `Canada`
- `James_Craig_Watson` → `deathPlace` → `Madison,_Wisconsin`
- `James_Craig_Watson` → `deathCause` → `Peritonitis`

**Predicted Triples:**

- ✗ `http://example.org/103_hera` → `discovered` → `http://example.org/james_craig_watson`
- ✗ `http://example.org/james_craig_watson` → `discoverer` → `http://example.org/103_hera`

#### Id2

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Baku_Turkish_Martyrs'_Memorial` → `dedicatedTo` → `"Ottoman Army soldiers killed in the Battle of Baku"`
- `Baku_Turkish_Martyrs'_Memorial` → `material` → `"Red granite and white marble"`

**Predicted Triples:**

- ✓ `http://example.org/the_baku_turkish_martyrs_memorial` → `dedicatedTo` → `http://example.org/ottoman_army_soldiers`
- ✗ `http://example.org/ottoman_army_soldiers` → `battle` → `http://example.org/battle_of_baku`

#### Id18

**F1:** 0.500 | **TP:** 2 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `United_Kingdom` → `leader` → `David_Cameron`
- `AIDS_(journal)` → `country` → `United_Kingdom`
- `AIDS_(journal)` → `publisher` → `Lippincott_Williams_&_Wilkins`
- `United_Kingdom` → `leader` → `Elizabeth_II`

**Predicted Triples:**

- ✓ `http://example.org/united_kingdom` → `leader` → `http://example.org/david_cameron`
- ✓ `http://example.org/united_kingdom` → `leader` → `http://example.org/elizabeth_ii`
- ✓ `http://example.org/aids_journal` → `locationCountry` → `http://example.org/united_kingdom`
- ✓ `http://example.org/aids_journal` → `countryOrigin` → `http://example.org/united_kingdom`

#### Id17

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Aleksey_Chirikov_(icebreaker)` → `builder` → `Finland`
- `Finland` → `leader` → `Sauli_Niinistö`
- `Finland` → `leader` → `Juha_Sipilä`
- `Aleksey_Chirikov_(icebreaker)` → `builder` → `Helsinki`

**Predicted Triples:**

- ✗ `http://example.org/aleksey_chirikov` → `countryOrigin` → `http://example.org/finland`
- ✓ `http://example.org/finland` → `leader` → `http://example.org/sauli_niinist`
- ✓ `http://example.org/finland` → `leader` → `http://example.org/juha_sipila`
- ✗ `http://example.org/helsinki` → `country` → `http://example.org/finland`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:35:09.609Z
**Sample Size:** 5
**Overall F1:** 0.4933
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id7 | http://example.org/1036_g | averageSpeed | 16.86 kilometres per seco | Subject matches "1036_Ganymed", but object "16.86  |

**Most Common Wrong Predicates:**

- `averageSpeed`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id2 | Alan_Shepard | deathPlace | California |
| Id7 | 1036_Ganymed | averageSpeed | 16.86 (kilometrePerSeconds) |
| Id6 | Acharya_Institute_of_Technolog | country | "India" |
| Id6 | Acharya_Institute_of_Technolog | affiliation | Visvesvaraya_Technological_Uni |

**Most Commonly Missed Predicates:**

- `deathPlace`: 1 occurrences
- `averageSpeed`: 1 occurrences
- `country`: 1 occurrences
- `affiliation`: 1 occurrences

### Per-Example Breakdown

#### Id2

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Alan_Shepard` → `deathPlace` → `California`

**Predicted Triples:**

(none)

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `1036_Ganymed` → `averageSpeed` → `16.86 (kilometrePerSeconds)`

**Predicted Triples:**

- ✗ `http://example.org/1036_ganymed` → `averageSpeed` → `16.86 kilometres per second`

#### Id22

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Alfred_Moore_Scales` → `battle` → `Battle_of_Chancellorsville`

**Predicted Triples:**

- ✓ `http://example.org/alfred_moore_scales` → `battle` → `http://example.org/battle_of_chancellorsville`

#### Id6

**F1:** 0.667 | **TP:** 2 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `Acharya_Institute_of_Technology` → `director` → `"Dr. G. P. Prabhukumar"`
- `Acharya_Institute_of_Technology` → `established` → `2000`
- `Acharya_Institute_of_Technology` → `country` → `"India"`
- `Acharya_Institute_of_Technology` → `affiliation` → `Visvesvaraya_Technological_University`

**Predicted Triples:**

- ✓ `http://example.org/acharya_institute_of_technology` → `director` → `http://example.org/dr_g_p_prabhukumar`
- ✓ `http://example.org/acharya_institute_of_technology` → `established` → `2000`

#### Id7

**F1:** 0.800 | **TP:** 4 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Asam_pedas` → `country` → `Malaysia`
- `Malaysia` → `ethnicGroup` → `Malaysian_Chinese`
- `Malaysia` → `leader` → `Arifin_Zakaria`
- `Malaysia` → `ethnicGroup` → `Malaysian_Indian`
- `Asam_pedas` → `region` → `Malay_Peninsula`

**Predicted Triples:**

- ✓ `http://example.org/malaysia` → `ethnicGroup` → `http://example.org/malaysian_indian`
- ✓ `http://example.org/malaysia` → `ethnicGroup` → `http://example.org/malaysian_chinese`
- ✓ `http://example.org/malaysia` → `leader` → `http://example.org/arifin_zakaria`
- ✓ `http://example.org/asam_pedas` → `country` → `http://example.org/malaysia`
- ✓ `http://example.org/asam_pedas` → `region` → `http://example.org/malay_peninsula_region`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:33:27.000Z
**Sample Size:** 10
**Overall F1:** 0.3238
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id8 | http://example.org/arros_ | region | http://example.org/valenc | No partial match found in gold set |
| Id8 | http://example.org/arros_ | region | http://example.org/spain | No partial match found in gold set |
| Id8 | http://example.org/arros_ | mainIngredient | http://example.org/white_ | No partial match found in gold set |
| Id8 | http://example.org/arros_ | mainIngredient | http://example.org/cuttle | No partial match found in gold set |
| Id8 | http://example.org/arros_ | mainIngredient | http://example.org/squid | No partial match found in gold set |
| Id8 | http://example.org/arros_ | mainIngredient | http://example.org/cephal | No partial match found in gold set |
| Id8 | http://example.org/arros_ | mainIngredient | http://example.org/cubane | No partial match found in gold set |
| Id6 | http://example.org/300_no | state | http://example.org/chicag | Wrong predicate: used "state" instead of "location |
| Id6 | http://example.org/chicag | state | http://example.org/united | Subject matches "Chicago", but object "http://exam |
| Id16 | http://example.org/agnes_ | leader | http://example.org/social | Subject matches "Agnes_Kant", but object "http://e |
| Id24 | http://example.org/beef_k | countryOrigin | http://example.org/singap | Wrong predicate: used "countryOrigin" instead of " |
| Id24 | http://example.org/standa | spokenIn | http://example.org/singap | No partial match found in gold set |
| Id5 | http://example.org/101_he | averageSpeed | 18.44 kilometres per seco | Subject matches "101_Helena", but object "18.44 ki |
| Id5 | http://example.org/gma_ne | leader | http://example.org/felipe | Subject matches "GMA_New_Media", but object "http: |
| Id3 | http://example.org/66391_ | apoapsis | 162164091.8388 km | Subject matches "(66391)_1999_KW4", but object "16 |
| Id3 | http://example.org/66391_ | averageSpeed | 37.16 kilometres per seco | Subject matches "(66391)_1999_KW4", but object "37 |
| Id3 | http://example.org/66391_ | density | 2.0 grams per cubic centi | Subject matches "(66391)_1999_KW4", but object "2. |

**Most Common Wrong Predicates:**

- `mainIngredient`: 5 occurrences
- `region`: 2 occurrences
- `state`: 2 occurrences
- `leader`: 2 occurrences
- `averageSpeed`: 2 occurrences
- `countryOrigin`: 1 occurrences
- `spokenIn`: 1 occurrences
- `apoapsis`: 1 occurrences
- `density`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id8 | Arròs_negre | region | Valencian_Community |
| Id8 | Arròs_negre | country | Spain |
| Id8 | Arròs_negre | mainIngredient | "White rice, cuttlefish or squ |
| Id8 | Arròs_negre | ingredient | Cubanelle |
| Id6 | 300_North_LaSalle | location | Chicago |
| Id6 | Chicago | country | United_States |
| Id14 | Alan_Martin_(footballer) | club | Hamilton_Academical_F.C. |
| Id14 | Alan_Martin_(footballer) | birthDate | 1989-01-01 |
| Id14 | Alan_Martin_(footballer) | club | Crewe_Alexandra_F.C. |
| Id16 | Agnes_Kant | birthPlace | West_Germany |
| Id24 | Beef_kway_teow | region | Singapore |
| Id24 | Singapore | language | Standard_Chinese |
| Id5 | 101_Helena | averageSpeed | 18.44 (kilometrePerSeconds) |
| Id5 | GMA_New_Media | location | GMA_Network_Center |
| Id5 | GMA_New_Media | location | Philippines |
| Id3 | (66391)_1999_KW4 | averageSpeed | 37.16 (kilometrePerSeconds) |
| Id3 | (66391)_1999_KW4 | density | 2.0 (gramPerCubicCentimetres) |
| Id3 | (66391)_1999_KW4 | apoapsis | 162164091.8388 (kilometres) |

**Most Commonly Missed Predicates:**

- `location`: 3 occurrences
- `region`: 2 occurrences
- `country`: 2 occurrences
- `club`: 2 occurrences
- `averageSpeed`: 2 occurrences
- `mainIngredient`: 1 occurrences
- `ingredient`: 1 occurrences
- `birthDate`: 1 occurrences
- `birthPlace`: 1 occurrences
- `language`: 1 occurrences

### Per-Example Breakdown

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `Arròs_negre` → `region` → `Valencian_Community`
- `Arròs_negre` → `country` → `Spain`
- `Arròs_negre` → `mainIngredient` → `"White rice, cuttlefish or squid, cephalopod ink, cubanelle peppers"`
- `Arròs_negre` → `ingredient` → `Cubanelle`

**Predicted Triples:**

- ✗ `http://example.org/arros_negre` → `region` → `http://example.org/valencian_community`
- ✗ `http://example.org/arros_negre` → `region` → `http://example.org/spain`
- ✗ `http://example.org/arros_negre` → `mainIngredient` → `http://example.org/white_rice`
- ✗ `http://example.org/arros_negre` → `mainIngredient` → `http://example.org/cuttlefish`
- ✗ `http://example.org/arros_negre` → `mainIngredient` → `http://example.org/squid`
- ✗ `http://example.org/arros_negre` → `mainIngredient` → `http://example.org/cephalopod_ink`
- ✗ `http://example.org/arros_negre` → `mainIngredient` → `http://example.org/cubanelle_peppers`

#### Id6

**F1:** 0.333 | **TP:** 1 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `300_North_LaSalle` → `location` → `Chicago`
- `Chicago` → `leader` → `Rahm_Emanuel`
- `Chicago` → `country` → `United_States`

**Predicted Triples:**

- ✗ `http://example.org/300_north_lasalle` → `state` → `http://example.org/chicago`
- ✗ `http://example.org/chicago` → `state` → `http://example.org/united_states`
- ✓ `http://example.org/chicago` → `leader` → `http://example.org/rahm_emanuel`

#### Id33

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Germany` → `leader` → `Stanislaw_Tillich`

**Predicted Triples:**

- ✓ `http://example.org/germany` → `leader` → `http://example.org/stanislaw_tillich`

#### Id14

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Alan_Martin_(footballer)` → `club` → `Hamilton_Academical_F.C.`
- `Alan_Martin_(footballer)` → `birthDate` → `1989-01-01`
- `Alan_Martin_(footballer)` → `club` → `Crewe_Alexandra_F.C.`

**Predicted Triples:**

(none)

#### Id16

**F1:** 0.333 | **TP:** 1 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Agnes_Kant` → `almaMater` → `Radboud_University_Nijmegen`
- `Agnes_Kant` → `birthPlace` → `West_Germany`
- `Agnes_Kant` → `office` → `Socialist_Party_(Netherlands)`

**Predicted Triples:**

- ✓ `http://example.org/agnes_kant` → `office_workedAt_workedAs_` → `http://example.org/socialist_party`
- ✓ `http://example.org/agnes_kant` → `almaMater` → `http://example.org/radboud_university_nijmegen`
- ✗ `http://example.org/agnes_kant` → `leader` → `http://example.org/socialist_party`

#### Id24

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Beef_kway_teow` → `region` → `Singapore`
- `Singapore` → `language` → `Standard_Chinese`

**Predicted Triples:**

- ✗ `http://example.org/beef_kway_teow` → `countryOrigin` → `http://example.org/singapore`
- ✗ `http://example.org/standard_chinese` → `spokenIn` → `http://example.org/singapore`

#### Id29

**F1:** 0.500 | **TP:** 2 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Bhajji` → `country` → `India`
- `India` → `leader` → `Sumitra_Mahajan`
- `Bhajji` → `region` → `Karnataka`
- `Karnataka` → `leader` → `Vajubhai_Vala`

**Predicted Triples:**

- ✓ `http://example.org/bhajji` → `country` → `http://example.org/india`
- ✓ `http://example.org/bhajji` → `region` → `http://example.org/karnataka_region`
- ✓ `http://example.org/india` → `leader` → `http://example.org/sumitra_mahajan`
- ✓ `http://example.org/karnataka_region` → `leader` → `http://example.org/vajubhai_vala`

#### Id5

**F1:** 0.500 | **TP:** 1 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `101_Helena` → `averageSpeed` → `18.44 (kilometrePerSeconds)`
- `101_Helena` → `apoapsis` → `441092000.0 (kilometres)`

**Predicted Triples:**

- ✗ `http://example.org/101_helena` → `averageSpeed` → `18.44 kilometres per second`
- ✓ `http://example.org/101_helena` → `apoapsis` → `441092000.0 kilometres`

#### Id5

**F1:** 0.571 | **TP:** 2 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `GMA_New_Media` → `product` → `Mobile_Applications`
- `GMA_New_Media` → `keyPerson` → `Felipe_Gozon`
- `GMA_New_Media` → `location` → `GMA_Network_Center`
- `GMA_New_Media` → `location` → `Philippines`

**Predicted Triples:**

- ✓ `http://example.org/gma_new_media` → `product` → `mobile applications`
- ✓ `http://example.org/gma_new_media` → `keyPerson` → `http://example.org/felipe_gozon`
- ✗ `http://example.org/gma_new_media` → `leader` → `http://example.org/felipe_gozon`

#### Id3

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `(66391)_1999_KW4` → `averageSpeed` → `37.16 (kilometrePerSeconds)`
- `(66391)_1999_KW4` → `density` → `2.0 (gramPerCubicCentimetres)`
- `(66391)_1999_KW4` → `apoapsis` → `162164091.8388 (kilometres)`

**Predicted Triples:**

- ✗ `http://example.org/66391_1999_kw4` → `apoapsis` → `162164091.8388 km`
- ✗ `http://example.org/66391_1999_kw4` → `averageSpeed` → `37.16 kilometres per second`
- ✗ `http://example.org/66391_1999_kw4` → `density` → `2.0 grams per cubic centimetre`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:31:18.673Z
**Sample Size:** 10
**Overall F1:** 0.3122
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id18 | http://example.org/vila_n | champions | http://example.org/campeo | No partial match found in gold set |
| Id6 | http://example.org/1_dece | locationCountry | http://example.org/romani | Subject matches "1_Decembrie_1918_University", but |
| Id6 | http://example.org/romani | inOfficeWhilePrimeMinister | http://example.org/klaus_ | Subject matches "Romania", but object "http://exam |
| Id8 | http://example.org/potter | isPartOf | http://example.org/texas | Subject matches "Potter_County,_Texas", but object |
| Id8 | http://example.org/randal | isPartOf | http://example.org/texas | No partial match found in gold set |
| Id8 | http://example.org/texas | isPartOf | http://example.org/united | Subject matches "Amarillo,_Texas", but object "htt |
| Id2 | http://example.org/ajobla | origin | http://example.org/andalu | Subject matches "Ajoblanco", but object "http://ex |
| Id2 | http://example.org/ajobla | origin | http://example.org/spain | Wrong predicate: used "origin" instead of "country |
| Id24 | http://example.org/cake | dishVariation | http://example.org/desser | No partial match found in gold set |
| Id15 | http://example.org/auburn | administrativeCounty | http://example.org/pierce | Wrong predicate: used "administrativeCounty" inste |
| Id15 | http://example.org/auburn | state | http://example.org/washin | Wrong predicate: used "state" instead of "isPartOf |
| Id15 | http://example.org/auburn | isPartOf | http://example.org/united | Subject matches "Auburn,_Washington", but object " |
| Id15 | http://example.org/pierce | state | http://example.org/washin | No partial match found in gold set |
| Id15 | http://example.org/washin | isPartOf | http://example.org/united | Subject matches "Auburn,_Washington", but object " |
| Id11 | http://example.org/apollo | crewMembers | http://example.org/willia | No partial match found in gold set |

**Most Common Wrong Predicates:**

- `isPartOf`: 5 occurrences
- `origin`: 2 occurrences
- `state`: 2 occurrences
- `champions`: 1 occurrences
- `locationCountry`: 1 occurrences
- `inOfficeWhilePrimeMinister`: 1 occurrences
- `dishVariation`: 1 occurrences
- `administrativeCounty`: 1 occurrences
- `crewMembers`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id18 | Campeonato_Brasileiro_Série_C | country | Brazil |
| Id18 | Campeonato_Brasileiro_Série_C | champions | Vila_Nova_Futebol_Clube |
| Id6 | Romania | leaderTitle | Prime_Minister_of_Romania |
| Id6 | Alba_Iulia | country | Romania |
| Id6 | Romania | leader | Klaus_Iohannis |
| Id8 | Potter_County,_Texas | country | United_States |
| Id2 | Ajoblanco | country | Spain |
| Id2 | Ajoblanco | region | Andalusia |
| Id24 | Dessert | dishVariation | Cake |
| Id15 | Auburn,_Washington | isPartOf | Pierce_County,_Washington |
| Id15 | Auburn,_Washington | country | United_States |
| Id15 | Auburn,_Washington | isPartOf | Washington_(state) |
| Id11 | William_Anders | dateOfRetirement | "1969-09-01" |
| Id11 | William_Anders | birthDate | "1933-10-17" |
| Id11 | William_Anders | occupation | Fighter_pilot |
| Id11 | William_Anders | birthPlace | British_Hong_Kong |
| Id11 | William_Anders | mission | Apollo_8 |
| Id11 | William_Anders | almaMater | "AFIT, M.S. 1962" |

**Most Commonly Missed Predicates:**

- `country`: 5 occurrences
- `isPartOf`: 2 occurrences
- `champions`: 1 occurrences
- `leaderTitle`: 1 occurrences
- `leader`: 1 occurrences
- `region`: 1 occurrences
- `dishVariation`: 1 occurrences
- `dateOfRetirement`: 1 occurrences
- `birthDate`: 1 occurrences
- `occupation`: 1 occurrences

### Per-Example Breakdown

#### Id19

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Arlington,_Texas` → `elevationAboveTheSeaLevel` → `184.0`

**Predicted Triples:**

- ✓ `http://example.org/arlington_texas` → `elevationAboveTheSeaLevel` → `184`

#### Id18

**F1:** 0.400 | **TP:** 1 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `Agremiação_Sportiva_Arapiraquense` → `league` → `Campeonato_Brasileiro_Série_C`
- `Campeonato_Brasileiro_Série_C` → `country` → `Brazil`
- `Campeonato_Brasileiro_Série_C` → `champions` → `Vila_Nova_Futebol_Clube`

**Predicted Triples:**

- ✓ `http://example.org/agremiao_sportiva_arapiraquense` → `league` → `http://example.org/campeonato_brasileiro_srie_c`
- ✗ `http://example.org/vila_nova_futebol_clube` → `champions` → `http://example.org/campeonato_brasileiro_srie_c`

#### Id23

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Cornell_University` → `nickname` → `Cornell_Big_Red`

**Predicted Triples:**

- ✓ `http://example.org/cornell_university` → `nickname` → `http://example.org/cornell_big_red`

#### Id6

**F1:** 0.222 | **TP:** 1 | **FP:** 3 | **FN:** 4

**Gold Triples:**

- `Romania` → `leaderTitle` → `Prime_Minister_of_Romania`
- `Alba_Iulia` → `country` → `Romania`
- `Romania` → `leader` → `Klaus_Iohannis`
- `Romania` → `capital` → `Bucharest`
- `1_Decembrie_1918_University` → `city` → `Alba_Iulia`

**Predicted Triples:**

- ✓ `http://example.org/1_decembrie_1918_university` → `locationCity` → `http://example.org/alba_iulia`
- ✗ `http://example.org/1_decembrie_1918_university` → `locationCountry` → `http://example.org/romania`
- ✓ `http://example.org/romania` → `capital` → `http://example.org/bucharest`
- ✗ `http://example.org/romania` → `inOfficeWhilePrimeMinister` → `http://example.org/klaus_iohannis`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 6 | **FN:** 3

**Gold Triples:**

- `Amarillo,_Texas` → `isPartOf` → `Potter_County,_Texas`
- `Amarillo,_Texas` → `isPartOf` → `Randall_County,_Texas`
- `Potter_County,_Texas` → `country` → `United_States`

**Predicted Triples:**

- ✓ `http://example.org/amarillo` → `isPartOf` → `http://example.org/potter_county`
- ✓ `http://example.org/amarillo` → `isPartOf` → `http://example.org/randall_county`
- ✓ `http://example.org/amarillo` → `isPartOf` → `http://example.org/texas`
- ✗ `http://example.org/potter_county` → `isPartOf` → `http://example.org/texas`
- ✗ `http://example.org/randall_county` → `isPartOf` → `http://example.org/texas`
- ✗ `http://example.org/texas` → `isPartOf` → `http://example.org/united_states`

#### Id2

**F1:** 0.500 | **TP:** 2 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Ajoblanco` → `country` → `Spain`
- `Ajoblanco` → `region` → `Andalusia`
- `Ajoblanco` → `alternativeName` → `"Ajo blanco"`
- `Ajoblanco` → `ingredient` → `Water`

**Predicted Triples:**

- ✓ `http://example.org/ajoblanco` → `ingredient` → `http://example.org/water`
- ✓ `http://example.org/ajoblanco` → `alternativeName` → `Ajo blanco`
- ✗ `http://example.org/ajoblanco` → `origin` → `http://example.org/andalusia`
- ✗ `http://example.org/ajoblanco` → `origin` → `http://example.org/spain`

#### Id18

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Barny_Cakes` → `protein` → `1.8 g`

**Predicted Triples:**

- ✓ `http://example.org/barny_cakes` → `protein` → `1.8 g`

#### Id24

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Dessert` → `dishVariation` → `Cake`

**Predicted Triples:**

- ✗ `http://example.org/cake` → `dishVariation` → `http://example.org/dessert`

#### Id15

**F1:** 0.000 | **TP:** 0 | **FP:** 6 | **FN:** 4

**Gold Triples:**

- `Auburn,_Washington` → `isPartOf` → `Pierce_County,_Washington`
- `Auburn,_Washington` → `country` → `United_States`
- `Auburn,_Washington` → `isPartOf` → `Washington_(state)`
- `Auburn,_Washington` → `areaTotal` → `77.41 (square kilometres)`

**Predicted Triples:**

- ✗ `http://example.org/auburn` → `administrativeCounty` → `http://example.org/pierce_county`
- ✗ `http://example.org/auburn` → `state` → `http://example.org/washington`
- ✗ `http://example.org/auburn` → `isPartOf` → `http://example.org/united_states`
- ✓ `http://example.org/auburn` → `areaTotal` → `77.41 square kilometres`
- ✗ `http://example.org/pierce_county` → `state` → `http://example.org/washington`
- ✗ `http://example.org/washington` → `isPartOf` → `http://example.org/united_states`

#### Id11

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 6

**Gold Triples:**

- `William_Anders` → `dateOfRetirement` → `"1969-09-01"`
- `William_Anders` → `birthDate` → `"1933-10-17"`
- `William_Anders` → `occupation` → `Fighter_pilot`
- `William_Anders` → `birthPlace` → `British_Hong_Kong`
- `William_Anders` → `mission` → `Apollo_8`
- `William_Anders` → `almaMater` → `"AFIT, M.S. 1962"`

**Predicted Triples:**

- ✗ `http://example.org/apollo_8` → `crewMembers` → `http://example.org/william_anders`

---

## WebNLG - dev

**Timestamp:** 2025-11-22T23:29:15.387Z
**Sample Size:** 10
**Overall F1:** 0.5002
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id18 | http://example.org/the_al | maidenVoyage | July 7, 1855 | Subject matches "Alhambra", but object "July 7, 18 |
| Id6 | http://example.org/al_asa | operator | http://example.org/united | Wrong predicate: used "operator" instead of "opera |
| Id6 | http://example.org/united | operator | http://example.org/boeing | Subject matches "United_States_Air_Force", but obj |
| Id6 | http://example.org/united | operator | http://example.org/genera | Subject matches "United_States_Air_Force", but obj |
| Id6 | http://example.org/united | operator | http://example.org/lockhe | Wrong predicate: used "operator" instead of "attac |
| Id6 | http://example.org/boeing | transportAircraft | http://example.org/boeing | No partial match found in gold set |
| Id6 | http://example.org/genera | aircraftFighter | http://example.org/genera | No partial match found in gold set |
| Id6 | http://example.org/lockhe | attackAircraft | http://example.org/lockhe | No partial match found in gold set |
| Id4 | http://example.org/101_he | discovered | http://example.org/james_ | Wrong predicate: used "discovered" instead of "dis |
| Id19 | http://example.org/adonis | party | http://example.org/greek_ | Subject matches "Adonis_Georgiadis", but object "h |
| Id19 | http://example.org/greek_ | colour | blue | No partial match found in gold set |
| Id19 | http://example.org/konsta | successor | http://example.org/antoni | No partial match found in gold set |
| Id7 | http://example.org/aarhus | locationCountry | http://example.org/denmar | No partial match found in gold set |
| Id5 | http://example.org/101_he | mass | 3.0 kgs | Subject matches "101_Helena", but object "3.0 kgs" |

**Most Common Wrong Predicates:**

- `operator`: 4 occurrences
- `maidenVoyage`: 1 occurrences
- `transportAircraft`: 1 occurrences
- `aircraftFighter`: 1 occurrences
- `attackAircraft`: 1 occurrences
- `discovered`: 1 occurrences
- `party`: 1 occurrences
- `colour`: 1 occurrences
- `successor`: 1 occurrences
- `locationCountry`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id18 | Alhambra | maidenVoyage | 1855-07-07 |
| Id6 | Al_Asad_Airbase | operatingOrganisation | United_States_Air_Force |
| Id6 | United_States_Air_Force | attackAircraft | Lockheed_AC-130 |
| Id6 | United_States_Air_Force | transportAircraft | Boeing_C-17_Globemaster_III |
| Id6 | United_States_Air_Force | aircraftFighter | General_Dynamics_F-16_Fighting |
| Id4 | 101_Helena | discoverer | James_Craig_Watson |
| Id4 | James_Craig_Watson | nationality | Canada |
| Id4 | James_Craig_Watson | deathPlace | Madison,_Wisconsin |
| Id4 | James_Craig_Watson | deathCause | Peritonitis |
| Id19 | Antonis_Samaras | successor | Konstantinos_Mitsotakis |
| Id19 | New_Democracy_(Greece) | colour | Blue |
| Id19 | Adonis_Georgiadis | party | New_Democracy_(Greece) |
| Id7 | School of Business and Social  | country | Denmark |

**Most Commonly Missed Predicates:**

- `maidenVoyage`: 1 occurrences
- `operatingOrganisation`: 1 occurrences
- `attackAircraft`: 1 occurrences
- `transportAircraft`: 1 occurrences
- `aircraftFighter`: 1 occurrences
- `discoverer`: 1 occurrences
- `nationality`: 1 occurrences
- `deathPlace`: 1 occurrences
- `deathCause`: 1 occurrences
- `successor`: 1 occurrences

### Per-Example Breakdown

#### Id18

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Alhambra` → `maidenVoyage` → `1855-07-07`

**Predicted Triples:**

- ✗ `http://example.org/the_alhambra` → `maidenVoyage` → `July 7, 1855`

#### Id6

**F1:** 0.000 | **TP:** 0 | **FP:** 8 | **FN:** 5

**Gold Triples:**

- `Al_Asad_Airbase` → `operatingOrganisation` → `United_States_Air_Force`
- `United_States_Air_Force` → `attackAircraft` → `Lockheed_AC-130`
- `United_States_Air_Force` → `transportAircraft` → `Boeing_C-17_Globemaster_III`
- `United_States_Air_Force` → `aircraftFighter` → `General_Dynamics_F-16_Fighting_Falcon`
- `United_States_Air_Force` → `battle` → `United_States_invasion_of_Panama`

**Predicted Triples:**

- ✗ `http://example.org/al_asad_airbase` → `operator` → `http://example.org/united_states_air_force`
- ✗ `http://example.org/united_states_air_force` → `operator` → `http://example.org/boeing_c-17_globemaster_iii`
- ✗ `http://example.org/united_states_air_force` → `operator` → `http://example.org/general_dynamics_f-16_fighting_falcon`
- ✗ `http://example.org/united_states_air_force` → `operator` → `http://example.org/lockheed_ac-130`
- ✓ `http://example.org/united_states_air_force` → `battle` → `http://example.org/invasion_of_panama`
- ✗ `http://example.org/boeing_c-17_globemaster_iii` → `transportAircraft` → `http://example.org/boeing_c-17_globemaster_iii`
- ✗ `http://example.org/general_dynamics_f-16_fighting_falcon` → `aircraftFighter` → `http://example.org/general_dynamics_f-16_fighting_falcon`
- ✗ `http://example.org/lockheed_ac-130` → `attackAircraft` → `http://example.org/lockheed_ac-130`

#### Id17

**F1:** 0.800 | **TP:** 4 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Birmingham` → `postalCode` → `B_postcode_area`
- `103_Colmore_Row` → `architect` → `John_Madin`
- `John_Madin` → `birthPlace` → `Birmingham`
- `Birmingham` → `governingBody` → `Birmingham_City_Council`
- `Birmingham` → `leader` → `Andrew_Mitchell`

**Predicted Triples:**

- ✓ `http://example.org/103_colmore_row` → `architect` → `http://example.org/john_madin`
- ✓ `http://example.org/john_madin` → `birthPlace` → `http://example.org/birmingham`
- ✓ `http://example.org/birmingham` → `postalCode` → `B`
- ✓ `http://example.org/birmingham` → `leader` → `http://example.org/andrew_mitchell`
- ✓ `http://example.org/birmingham` → `governingBody` → `http://example.org/birmingham_city_council`

#### Id4

**F1:** 0.286 | **TP:** 1 | **FP:** 1 | **FN:** 4

**Gold Triples:**

- `101_Helena` → `discoverer` → `James_Craig_Watson`
- `James_Craig_Watson` → `almaMater` → `University_of_Michigan`
- `James_Craig_Watson` → `nationality` → `Canada`
- `James_Craig_Watson` → `deathPlace` → `Madison,_Wisconsin`
- `James_Craig_Watson` → `deathCause` → `Peritonitis`

**Predicted Triples:**

- ✗ `http://example.org/101_helena` → `discovered` → `http://example.org/james_craig_watson`
- ✓ `http://example.org/james_craig_watson` → `almaMater` → `http://example.org/university_of_michigan`

#### Id4

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Bananaman` → `broadcastedBy` → `"STV"`

**Predicted Triples:**

- ✓ `http://example.org/bananaman` → `broadcastedBy` → `http://example.org/stv`

#### Id7

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Elliot_See` → `occupation` → `Test_pilot`

**Predicted Triples:**

- ✓ `http://example.org/elliot_see` → `occupation` → `test pilot`

#### Id19

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Adonis_Georgiadis` → `inOfficeWhilePrimeMinister` → `Antonis_Samaras`
- `Antonis_Samaras` → `successor` → `Konstantinos_Mitsotakis`
- `New_Democracy_(Greece)` → `colour` → `Blue`
- `Adonis_Georgiadis` → `party` → `New_Democracy_(Greece)`

**Predicted Triples:**

- ✗ `http://example.org/adonis_georgiadis` → `party` → `http://example.org/greek_new_democracy_party`
- ✓ `http://example.org/adonis_georgiadis` → `inOfficeWhilePrimeMinister` → `http://example.org/antonis_samaras`
- ✗ `http://example.org/greek_new_democracy_party` → `colour` → `blue`
- ✗ `http://example.org/konstantinos_mitsotakis` → `successor` → `http://example.org/antonis_samaras`

#### Id1

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `1634:_The_Bavarian_Crisis` → `author` → `Eric_Flint`

**Predicted Triples:**

- ✓ `http://example.org/1634_the_bavarian_crisis` → `author` → `http://example.org/eric_flint`

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `School of Business and Social Sciences at the Aarhus University` → `country` → `Denmark`

**Predicted Triples:**

- ✗ `http://example.org/aarhus_university_school_of_business_and_social_sciences` → `locationCountry` → `http://example.org/denmark`

#### Id5

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `101_Helena` → `mass` → `3.0 (kilograms)`

**Predicted Triples:**

- ✗ `http://example.org/101_helena` → `mass` → `3.0 kgs`
- ✓ `http://example.org/101_helena` → `mass` → `3.0 kilograms`

---

# Recommendations for Prompt Optimization

Based on the analysis above, consider:

1. **Predicate Selection**: The LLM often uses generic RDFS predicates (`rdfs:comment`, `rdfs:seeAlso`) instead of domain-specific ones. Add explicit instructions to prefer domain properties.

2. **Name Normalization**: Subject names sometimes differ (e.g., 'Aleksandr Stepanovich Grin' vs 'Aleksandr Grin'). Consider adding name canonicalization hints.

3. **Property Alignment**: Ensure ontology properties align with expected gold predicates (e.g., 'date of birth' vs 'date_of_birth').

4. **Few-Shot Examples**: Add examples of correct extractions to the prompt to guide the LLM.

5. **Matcher Relaxation**: Consider fuzzy matching for subjects/objects to handle name variations.
