# Benchmark Analysis Report

**Generated:** 2025-11-23T00:56:00.150Z
**Results Analyzed:** 15

## Overview

| Dataset | Split | Samples | F1 | Precision | Recall | Timestamp |
|---------|-------|---------|----:|----------:|-------:|-----------|
| WebNLG | dev | 100 | 0.274 | 0.277 | 0.290 | 2025-11-23 |
| REBEL | val | 10 | 0.375 | 0.392 | 0.367 | 2025-11-23 |
| DocRED | dev | 3 | 0.452 | 0.583 | 0.444 | 2025-11-23 |
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

## WebNLG - dev

**Timestamp:** 2025-11-23T00:53:20.708Z
**Sample Size:** 100
**Overall F1:** 0.2744
**Failed Extractions:** 19

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Id2 | http://example.org/texas | isPartOf | http://example.org/united | Subject matches "Abilene,_Texas", but object "http |
| Id2 | http://example.org/housto | isPartOf | http://example.org/texas | No partial match found in gold set |
| Id14 | http://example.org/adam_k | commander | http://example.org/polish | Wrong predicate: used "commander" instead of "batt |
| Id14 | http://example.org/joseph | commander | http://example.org/polish | No partial match found in gold set |
| Id14 | http://example.org/kashub | spokenIn | http://example.org/poland | No partial match found in gold set |
| Id8 | http://example.org/alan_f | musicalArtist | http://example.org/rock_m | Wrong predicate: used "musicalArtist" instead of " |
| Id8 | http://example.org/rock_m | musicFusionGenre | http://example.org/countr | Wrong predicate: used "musicFusionGenre" instead o |
| Id8 | http://example.org/united | operatingOrganisation | http://example.org/al_asa | Subject matches "United_States_Air_Force", but obj |
| Id12 | http://example.org/attica | populationTotal | 783.1 | Subject matches "Attica,_Indiana", but object "783 |
| Id12 | http://example.org/logan_ | isPartOf | http://example.org/founta | No partial match found in gold set |
| Id12 | http://example.org/founta | isPartOf | http://example.org/indian | No partial match found in gold set |
| Id25 | http://example.org/summit | isPartOf | http://example.org/ohio | No partial match found in gold set |
| Id2 | http://example.org/sarana | region | http://example.org/new_yo | No partial match found in gold set |
| Id2 | http://example.org/lake_p | region | http://example.org/new_yo | No partial match found in gold set |
| Id9 | http://example.org/107_ca | discovered | http://example.org/f_vila | Wrong predicate: used "discovered" instead of "dis |
| Id17 | http://example.org/kimber | isPartOf | http://example.org/wiscon | No partial match found in gold set |
| Id17 | http://example.org/little | isPartOf | http://example.org/kimber | No partial match found in gold set |
| Id17 | http://example.org/little | isPartOf | http://example.org/wiscon | No partial match found in gold set |
| Id1 | http://example.org/ajobla | origin | http://example.org/andalu | Subject matches "Ajoblanco", but object "http://ex |
| Id1 | http://example.org/andalu | region | http://example.org/spain | No partial match found in gold set |
| ... | ... | ... | ... | (93 more) |

**Most Common Wrong Predicates:**

- `isPartOf`: 17 occurrences
- `part`: 5 occurrences
- `state`: 5 occurrences
- `associatedBand_associatedMusicalArtist`: 5 occurrences
- `region`: 4 occurrences
- `hubAirport`: 4 occurrences
- `leader`: 4 occurrences
- `place`: 4 occurrences
- `club`: 4 occurrences
- `commander`: 3 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Id2 | Abilene,_Texas | country | United_States |
| Id14 | Adam_Koc | battle | Polish–Soviet_War |
| Id14 | Poland | language | Kashubian_language |
| Id14 | Polish–Soviet_War | commander | Joseph_Stalin |
| Id2 | Al_Kharaitiyat_SC | manager | Amar_Osim |
| Id8 | Alan_Frew | genre | Rock_music |
| Id8 | Rock_music | stylisticOrigin | Country_music |
| Id16 | Baked_Alaska | region | "Paris, New York or Hong Kong" |
| Id8 | Al_Asad_Airbase | operatingOrganisation | United_States_Air_Force |
| Id20 | Alfred_Garth_Jones | deathPlace | London |
| Id20 | Alfred_Garth_Jones | birthPlace | Manchester |
| Id20 | Alfred_Garth_Jones | birthPlace | England |
| Id5 | A.C._Milan | manager | Siniša_Mihajlović |
| Id25 | United_States | demonym | Americans |
| Id9 | 107_Camilla | discoverer | F._Vilas |
| Id1 | Ajoblanco | country | Spain |
| Id1 | Ajoblanco | region | Andalusia |
| Id8 | Ariane_5 | launchSite | ELA-3 |
| Id8 | Ariane_5 | maidenFlight | 2004-03-02 |
| Id8 | Ariane_5 | manufacturer | European_Space_Agency |
| ... | ... | ... | ... (137 more) |

**Most Commonly Missed Predicates:**

- `birthPlace`: 14 occurrences
- `location`: 12 occurrences
- `country`: 10 occurrences
- `manager`: 5 occurrences
- `deathPlace`: 5 occurrences
- `associatedBand/associatedMusicalArtist`: 5 occurrences
- `battle`: 4 occurrences
- `genre`: 4 occurrences
- `status`: 4 occurrences
- `alternativeName`: 4 occurrences

### Per-Example Breakdown

#### Id2

**F1:** 0.182 | **TP:** 1 | **FP:** 5 | **FN:** 4

**Gold Triples:**

- `Abilene,_Texas` → `isPartOf` → `Texas`
- `Texas` → `largestCity` → `Houston`
- `Texas` → `capital` → `Austin,_Texas`
- `Abilene,_Texas` → `country` → `United_States`
- `Texas` → `language` → `Spanish_language`

**Predicted Triples:**

- ✓ `http://example.org/abilene` → `isPartOf` → `http://example.org/texas`
- ✗ `http://example.org/texas` → `isPartOf` → `http://example.org/united_states`
- ✓ `http://example.org/texas` → `capital` → `http://example.org/austin`
- ✓ `http://example.org/texas` → `largestCity` → `http://example.org/houston`
- ✓ `http://example.org/texas` → `languages` → `http://example.org/spanish`
- ✗ `http://example.org/houston` → `isPartOf` → `http://example.org/texas`

#### Id33

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Twilight_(band)` → `genre` → `Black_metal`

**Predicted Triples:**

- ✓ `http://example.org/twilight` → `genre` → `http://example.org/black_metal`

#### Id14

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Adam_Koc` → `battle` → `Polish–Soviet_War`
- `Poland` → `language` → `Kashubian_language`
- `Polish–Soviet_War` → `commander` → `Joseph_Stalin`
- `Adam_Koc` → `nationality` → `Poland`

**Predicted Triples:**

- ✓ `http://example.org/adam_koc` → `nationality` → `http://example.org/poland`
- ✗ `http://example.org/adam_koc` → `commander` → `http://example.org/polish-soviet_war`
- ✗ `http://example.org/joseph_stalin` → `commander` → `http://example.org/polish-soviet_war`
- ✗ `http://example.org/kashubian` → `spokenIn` → `http://example.org/poland`

#### Id2

**F1:** 0.889 | **TP:** 4 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Al_Kharaitiyat_SC` → `league` → `Qatar_Stars_League`
- `Al_Kharaitiyat_SC` → `ground` → `Al_Khor`
- `Alaa_Abdul-Zahra` → `club` → `Shabab_Al-Ordon_Club`
- `Alaa_Abdul-Zahra` → `club` → `Al_Kharaitiyat_SC`
- `Al_Kharaitiyat_SC` → `manager` → `Amar_Osim`

**Predicted Triples:**

- ✓ `http://example.org/alaa_abdul-zahra` → `club` → `http://example.org/shabab_al-ordon_club`
- ✓ `http://example.org/alaa_abdul-zahra` → `club` → `http://example.org/al_kharaitiyat_sc`
- ✓ `http://example.org/al_kharaitiyat_sc` → `ground` → `http://example.org/al_khor`
- ✓ `http://example.org/al_kharaitiyat_sc` → `league` → `http://example.org/qatar_stars_league`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Alan_Frew` → `genre` → `Rock_music`
- `Rock_music` → `stylisticOrigin` → `Country_music`

**Predicted Triples:**

- ✗ `http://example.org/alan_frew` → `musicalArtist` → `http://example.org/rock_music`
- ✗ `http://example.org/rock_music` → `musicFusionGenre` → `http://example.org/country_music`

#### Id16

**F1:** 0.000 | **TP:** 0 | **FP:** 6 | **FN:** 4

**Gold Triples:**

- `Baked_Alaska` → `mainIngredient` → `"Meringue, ice cream, sponge cake or Christmas pudding"`
- `Baked_Alaska` → `country` → `"France, United States or China"`
- `Baked_Alaska` → `region` → `"Paris, New York or Hong Kong"`
- `Baked_Alaska` → `ingredient` → `Meringue`

**Predicted Triples:**

- ✓ `http://example.org/baked_alaska` → `mainIngredient` → `http://example.org/meringue`
- ✓ `http://example.org/baked_alaska` → `mainIngredient` → `http://example.org/ice_cream`
- ✓ `http://example.org/baked_alaska` → `mainIngredient` → `http://example.org/sponge_cake`
- ✓ `http://example.org/baked_alaska` → `countryOrigin` → `http://example.org/france`
- ✓ `http://example.org/baked_alaska` → `countryOrigin` → `http://example.org/united_states`
- ✓ `http://example.org/baked_alaska` → `countryOrigin` → `http://example.org/china`

#### Id12

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Adisham_Hall` → `country` → `Sri_Lanka`
- `Sri_Lanka` → `language` → `Tamil_language`

**Predicted Triples:**

- ✓ `http://example.org/adisham_hall` → `locationCountry` → `http://example.org/sri_lanka`
- ✓ `http://example.org/sri_lanka` → `officialLanguage` → `http://example.org/tamil`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Al_Asad_Airbase` → `operatingOrganisation` → `United_States_Air_Force`
- `United_States_Air_Force` → `battle` → `Korean_War`
- `United_States_Air_Force` → `battle` → `Operation_Enduring_Freedom`

**Predicted Triples:**

- ✗ `http://example.org/united_states_air_force` → `operatingOrganisation` → `http://example.org/al_asad_airbase`
- ✓ `http://example.org/united_states_air_force` → `battles` → `http://example.org/korean_war`
- ✓ `http://example.org/united_states_air_force` → `battles` → `http://example.org/operation_enduring_freedom`

#### Id20

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Alfred_Garth_Jones` → `deathPlace` → `London`
- `Alfred_Garth_Jones` → `birthPlace` → `Manchester`
- `Alfred_Garth_Jones` → `birthPlace` → `England`

**Predicted Triples:**

(none)

#### Id12

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `Attica,_Indiana` → `isPartOf` → `United_States`
- `Attica,_Indiana` → `areaTotal` → `4.14 (square kilometres)`
- `Attica,_Indiana` → `isPartOf` → `Logan_Township,_Fountain_County,_Indiana`
- `Attica,_Indiana` → `populationDensity` → `783.1 (inhabitants per square kilometre)`

**Predicted Triples:**

- ✓ `http://example.org/attica` → `isPartOf` → `http://example.org/logan_township`
- ✓ `http://example.org/attica` → `areaTotal` → `4.14 square kilometres`
- ✗ `http://example.org/attica` → `populationTotal` → `783.1`
- ✓ `http://example.org/attica` → `populationDensity` → `783.1 inhabitants per square kilometres`
- ✗ `http://example.org/logan_township` → `isPartOf` → `http://example.org/fountain_county`
- ✗ `http://example.org/fountain_county` → `isPartOf` → `http://example.org/indiana`
- ✓ `http://example.org/indiana` → `isPartOf` → `http://example.org/united_states`

#### Id1

**F1:** 1.000 | **TP:** 2 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `(410777)_2009_FD` → `apoapsis` → `259776702.47055 (kilometres)`
- `(410777)_2009_FD` → `minimumTemperature` → `211.0 (kelvins)`

**Predicted Triples:**

- ✓ `http://example.org/410777_2009_fd` → `apoapsis` → `259776702.47055 kilometres`
- ✓ `http://example.org/410777_2009_fd` → `minimumTemperature` → `211.0 kelvins`

#### Id9

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Avocado` → `genus` → `Persea`

**Predicted Triples:**

- ✓ `http://example.org/avocado` → `genus` → `http://example.org/persea`

#### Id5

**F1:** 0.889 | **TP:** 4 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Alessio_Romagnoli` → `club` → `A.C._Milan`
- `A.C._Milan` → `league` → `Serie_A`
- `A.C._Milan` → `manager` → `Siniša_Mihajlović`
- `A.C._Milan` → `chairman` → `Silvio_Berlusconi`
- `Alessio_Romagnoli` → `club` → `U.C._Sampdoria`

**Predicted Triples:**

- ✓ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/ac_milan`
- ✓ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/uc_sampdoria`
- ✓ `http://example.org/ac_milan` → `league` → `Serie A`
- ✓ `http://example.org/ac_milan` → `chairman` → `http://example.org/silvio_berlusconi`

#### Id25

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `United_States` → `ethnicGroup` → `Asian_Americans`
- `United_States` → `demonym` → `Americans`
- `Akron,_Ohio` → `country` → `United_States`
- `Akron,_Ohio` → `isPartOf` → `Summit_County,_Ohio`

**Predicted Triples:**

- ✓ `http://example.org/akron` → `isPartOf` → `http://example.org/summit_county`
- ✓ `http://example.org/akron` → `isPartOf` → `http://example.org/ohio`
- ✓ `http://example.org/akron` → `country` → `http://example.org/united_states`
- ✗ `http://example.org/summit_county` → `isPartOf` → `http://example.org/ohio`
- ✓ `http://example.org/ohio` → `country` → `http://example.org/united_states`
- ✓ `http://example.org/united_states` → `ethnicGroups` → `http://example.org/americans`
- ✓ `http://example.org/united_states` → `ethnicGroups` → `http://example.org/asian_americans`

#### Id2

**F1:** 0.250 | **TP:** 1 | **FP:** 4 | **FN:** 2

**Gold Triples:**

- `Adirondack_Regional_Airport` → `runwayLength` → `1219.0`
- `Adirondack_Regional_Airport` → `cityServed` → `Lake_Placid,_New_York`
- `Adirondack_Regional_Airport` → `cityServed` → `Saranac_Lake,_New_York`

**Predicted Triples:**

- ✓ `http://example.org/adirondack_regional_airport` → `runwayLength` → `1219.0`
- ✓ `http://example.org/adirondack_regional_airport` → `cityServed` → `http://example.org/saranac_lake`
- ✓ `http://example.org/adirondack_regional_airport` → `cityServed` → `http://example.org/lake_placid`
- ✗ `http://example.org/saranac_lake` → `region` → `http://example.org/new_york`
- ✗ `http://example.org/lake_placid` → `region` → `http://example.org/new_york`

#### Id9

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `107_Camilla` → `discoverer` → `F._Vilas`

**Predicted Triples:**

- ✗ `http://example.org/107_camilla` → `discovered` → `http://example.org/f_vilas`

#### Id17

**F1:** 0.000 | **TP:** 0 | **FP:** 6 | **FN:** 3

**Gold Triples:**

- `Appleton,_Wisconsin` → `isPartOf` → `Kimberly,_Wisconsin`
- `Appleton,_Wisconsin` → `isPartOf` → `Little_Chute,_Wisconsin`
- `Appleton_International_Airport` → `cityServed` → `Appleton,_Wisconsin`

**Predicted Triples:**

- ✓ `http://example.org/appleton_international_airport` → `cityServed` → `http://example.org/appleton`
- ✓ `http://example.org/appleton` → `isPartOf` → `http://example.org/kimberly`
- ✓ `http://example.org/appleton` → `isPartOf` → `http://example.org/wisconsin`
- ✗ `http://example.org/kimberly` → `isPartOf` → `http://example.org/wisconsin`
- ✗ `http://example.org/little_chute` → `isPartOf` → `http://example.org/kimberly`
- ✗ `http://example.org/little_chute` → `isPartOf` → `http://example.org/wisconsin`

#### Id1

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `Ajoblanco` → `country` → `Spain`
- `Ajoblanco` → `mainIngredient` → `"Bread, almonds, garlic, water, olive oil"`
- `Ajoblanco` → `region` → `Andalusia`
- `Ajoblanco` → `ingredient` → `Bread`

**Predicted Triples:**

- ✓ `http://example.org/ajoblanco` → `mainIngredient` → `http://example.org/bread`
- ✓ `http://example.org/ajoblanco` → `mainIngredient` → `http://example.org/almonds`
- ✓ `http://example.org/ajoblanco` → `mainIngredient` → `http://example.org/garlic`
- ✓ `http://example.org/ajoblanco` → `mainIngredient` → `http://example.org/water`
- ✓ `http://example.org/ajoblanco` → `mainIngredient` → `http://example.org/olive_oil`
- ✗ `http://example.org/ajoblanco` → `origin` → `http://example.org/andalusia`
- ✗ `http://example.org/andalusia` → `region` → `http://example.org/spain`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 5

**Gold Triples:**

- `Ariane_5` → `launchSite` → `ELA-3`
- `Ariane_5` → `maidenFlight` → `2004-03-02`
- `Ariane_5` → `manufacturer` → `European_Space_Agency`
- `Ariane_5` → `diameter` → `5.4 (metres)`
- `Ariane_5` → `finalFlight` → `2003-09-27`

**Predicted Triples:**

(none)

#### Id15

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Albennie_Jones` → `genre` → `Jazz`
- `Albennie_Jones` → `background` → `"solo_singer"`
- `Albennie_Jones` → `birthPlace` → `Errata,_Mississippi`

**Predicted Triples:**

(none)

#### Id35

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Honda` → `division` → `Acura`

**Predicted Triples:**

- ✗ `http://example.org/acura` → `division` → `http://example.org/honda`

#### Id3

**F1:** 0.500 | **TP:** 1 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `Abdul_Taib_Mahmud` → `residence` → `Sarawak`
- `Abdul_Taib_Mahmud` → `birthPlace` → `Kingdom_of_Sarawak`
- `Abdul_Taib_Mahmud` → `party` → `"Barisan Ra'ayat Jati Sarawak"`

**Predicted Triples:**

- ✓ `http://example.org/abdul_taib_mahmud` → `party` → `http://example.org/barisan_raayat_jati_sarawak`

#### Id21

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Alberto_Teisaire` → `nationality` → `Argentina`

**Predicted Triples:**

- ✓ `http://example.org/alberto_teisaire` → `nationality` → `http://example.org/argentina`

#### Id13

**F1:** 0.333 | **TP:** 1 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Bacon_Explosion` → `country` → `United_States`
- `United_States` → `ethnicGroup` → `Native_Americans_in_the_United_States`
- `United_States` → `capital` → `Washington,_D.C.`

**Predicted Triples:**

- ✓ `http://example.org/united_states` → `ethnicGroups` → `http://example.org/native_americans`
- ✓ `http://example.org/united_states` → `capital` → `http://example.org/washington_dc`
- ✓ `http://example.org/bacon_explosion` → `countryOrigin` → `http://example.org/united_states`

#### Id7

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Romania` → `patronSaint` → `Andrew_the_Apostle`
- `1_Decembrie_1918_University` → `latinName` → `"Universitas Apulensis"`
- `1_Decembrie_1918_University` → `country` → `Romania`

**Predicted Triples:**

- ✓ `http://example.org/1_decembrie_1918_university` → `locationCountry` → `http://example.org/romania`
- ✓ `http://example.org/1_decembrie_1918_university` → `latinName` → `Universitas Apulensis`
- ✓ `http://example.org/romania` → `patronSaint` → `http://example.org/andrew_the_apostle`

#### Id6

**F1:** 0.500 | **TP:** 1 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `1036_Ganymed` → `averageSpeed` → `16.86 (kilometrePerSeconds)`
- `1036_Ganymed` → `apoapsis` → `611961000.0 (kilometres)`

**Predicted Triples:**

- ✓ `http://example.org/1036_ganymed` → `apoapsis` → `611961000.0 kilometres`
- ✗ `http://example.org/1036_ganymed` → `averageSpeed` → `16.86 kilometres per second`

#### Id16

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Alan_Martin_(footballer)` → `club` → `Accrington_Stanley_F.C.`

**Predicted Triples:**

- ✓ `http://example.org/alan_martin` → `club` → `http://example.org/accrington_stanley_fc`

#### Id3

**F1:** 0.200 | **TP:** 1 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Adolfo_Suárez_Madrid–Barajas_Airport` → `runwayLength` → `4349.0`
- `Adolfo_Suárez_Madrid–Barajas_Airport` → `location` → `Madrid`
- `Adolfo_Suárez_Madrid–Barajas_Airport` → `elevationAboveTheSeaLevel` → `610.0`
- `Adolfo_Suárez_Madrid–Barajas_Airport` → `operatingOrganisation` → `ENAIRE`
- `Adolfo_Suárez_Madrid–Barajas_Airport` → `runwayName` → `"14L/32R"`

**Predicted Triples:**

- ✓ `http://example.org/adolfo_surez_madrid-barajas_airport` → `elevationAboveTheSeaLevelInMetres` → `610.0`
- ✓ `http://example.org/adolfo_surez_madrid-barajas_airport` → `1stRunwayLengthMetre` → `4349.0`
- ✓ `http://example.org/adolfo_surez_madrid-barajas_airport` → `runwayName` → `14L/32R`
- ✗ `http://example.org/adolfo_surez_madrid-barajas_airport` → `hubAirport` → `http://example.org/enaire`
- ✗ `http://example.org/adolfo_surez_madrid-barajas_airport` → `identifier` → `http://example.org/madrid`

#### Id24

**F1:** 0.000 | **TP:** 0 | **FP:** 9 | **FN:** 5

**Gold Triples:**

- `Egg_Harbor_Township,_New_Jersey` → `isPartOf` → `New_Jersey`
- `Atlantic_City_International_Airport` → `elevationAboveTheSeaLevel` → `23.0`
- `Atlantic_City_International_Airport` → `location` → `Egg_Harbor_Township,_New_Jersey`
- `Egg_Harbor_Township,_New_Jersey` → `country` → `United_States`
- `Egg_Harbor_Township,_New_Jersey` → `isPartOf` → `Atlantic_County,_New_Jersey`

**Predicted Triples:**

- ✓ `http://example.org/atlantic_city_international_airport` → `elevationAboveTheSeaLevel__in_metres_` → `23`
- ✓ `http://example.org/atlantic_city_international_airport` → `locationCity` → `http://example.org/egg_harbor_township`
- ✗ `http://example.org/atlantic_city_international_airport` → `part` → `http://example.org/atlantic_county`
- ✗ `http://example.org/atlantic_city_international_airport` → `part` → `http://example.org/new_jersey`
- ✗ `http://example.org/atlantic_city_international_airport` → `part` → `http://example.org/united_states`
- ✓ `http://example.org/egg_harbor_township` → `part` → `http://example.org/atlantic_county`
- ✓ `http://example.org/egg_harbor_township` → `part` → `http://example.org/new_jersey`
- ✗ `http://example.org/atlantic_county` → `part` → `http://example.org/new_jersey`
- ✗ `http://example.org/new_jersey` → `part` → `http://example.org/united_states`

#### Id13

**F1:** 0.800 | **TP:** 2 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Alhambra` → `shipBeam` → `8.3 m`
- `Alhambra` → `length` → `63800.0 (millimetres)`
- `Alhambra` → `status` → `"Wrecked"`

**Predicted Triples:**

- ✓ `http://example.org/alhambra` → `shipBeam` → `8.3 m`
- ✓ `http://example.org/alhambra` → `length` → `63800.0 millimetres`

#### Id13

**F1:** 0.500 | **TP:** 1 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `1099_Figneria` → `periapsis` → `349206000000.0`
- `1099_Figneria` → `epoch` → `2006-12-31`

**Predicted Triples:**

- ✓ `http://example.org/1099_figneria` → `periapsis` → `349206000000.0`
- ✗ `http://example.org/1099_figneria` → `epoch` → `31 December 2006`

#### Id22

**F1:** 0.286 | **TP:** 1 | **FP:** 3 | **FN:** 2

**Gold Triples:**

- `Atlantic_City_International_Airport` → `runwayName` → `"4/22"`
- `Atlantic_City_International_Airport` → `location` → `Egg_Harbor_Township,_New_Jersey`
- `Egg_Harbor_Township,_New_Jersey` → `country` → `United_States`

**Predicted Triples:**

- ✓ `http://example.org/atlantic_city_international_airport` → `runwayName` → `4/22`
- ✓ `http://example.org/atlantic_city_international_airport` → `locationCity` → `http://example.org/egg_harbor_township`
- ✗ `http://example.org/egg_harbor_township` → `state` → `http://example.org/new_jersey`
- ✗ `http://example.org/new_jersey` → `state` → `http://example.org/united_states`

#### Id6

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Arròs_negre` → `ingredient` → `Cuttlefish`

**Predicted Triples:**

- ✗ `http://example.org/arros_negre` → `ingredient` → `http://example.org/cuttlefish`
- ✓ `http://example.org/arrs_negre` → `ingredient` → `http://example.org/cuttlefish`

#### Id14

**F1:** 0.667 | **TP:** 2 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `10_Hygiea` → `surfaceArea` → `837080.744 (squareKilometres)`
- `10_Hygiea` → `apoapsis` → `523951582.33968 (kilometres)`
- `10_Hygiea` → `temperature` → `164.0 (kelvins)`

**Predicted Triples:**

- ✗ `http://example.org/10_hygiea` → `surfaceArea` → `837080.744 square kilometres`
- ✓ `http://example.org/10_hygiea` → `apoapsis` → `523951582.33968 kilometres`
- ✓ `http://example.org/10_hygiea` → `temperature` → `164.0 kelvins`

#### Id10

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 6

**Gold Triples:**

- `Elliot_See` → `almaMater` → `University_of_Texas_at_Austin`
- `University_of_Texas_at_Austin` → `affiliation` → `University_of_Texas_System`
- `Elliot_See` → `birthDate` → `"1927-07-23"`
- `Elliot_See` → `birthPlace` → `Dallas`
- `Elliot_See` → `deathPlace` → `St._Louis`
- `Elliot_See` → `status` → `"Deceased"`

**Predicted Triples:**

(none)

#### Id17

**F1:** 1.000 | **TP:** 2 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Aleksandre_Guruli` → `club` → `FC_Karpaty_Lviv`
- `Aleksandre_Guruli` → `club` → `FC_Dinamo_Batumi`

**Predicted Triples:**

- ✓ `http://example.org/aleksandre_guruli` → `club` → `http://example.org/fc_karpaty_lviv`
- ✓ `http://example.org/aleksandre_guruli` → `club` → `http://example.org/fc_dinamo_batumi`

#### Id9

**F1:** 0.400 | **TP:** 1 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Akeem_Priestley` → `birthPlace` → `Jamaica`
- `Jamaica` → `leader` → `Patrick_Allen_(politician)`

**Predicted Triples:**

- ✗ `http://example.org/patrick_allen` → `leader` → `http://example.org/jamaica`
- ✓ `http://example.org/jamaica` → `leader` → `http://example.org/patrick_allen`
- ✓ `http://example.org/akeem_priestley` → `birthPlace` → `http://example.org/jamaica`

#### Id15

**F1:** 0.800 | **TP:** 2 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `A_Severed_Wasp` → `oclcNumber` → `8805735`
- `A_Severed_Wasp` → `libraryofCongressClassification` → `"PS3523.E55 S4 1982"`
- `A_Severed_Wasp` → `mediaType` → `"Print"`

**Predicted Triples:**

- ✓ `http://example.org/a_severed_wasp` → `oclcNumber` → `8805735`
- ✓ `http://example.org/a_severed_wasp` → `LibraryofCongressClassification` → `PS3523.E55 S4 1982`

#### Id10

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Ayam_penyet` → `servingTemperature` → `"Hot"`

**Predicted Triples:**

- ✗ `http://example.org/ayam_penyet` → `served` → `hot`

#### Id6

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 6

**Gold Triples:**

- `Buzz_Aldrin` → `birthPlace` → `Glen_Ridge,_New_Jersey`
- `Buzz_Aldrin` → `alternativeName` → `"Edwin E. Aldrin, Jr."`
- `Buzz_Aldrin` → `mission` → `Apollo_11`
- `Buzz_Aldrin` → `occupation` → `Fighter_pilot`
- `Buzz_Aldrin` → `almaMater` → `"Massachusetts Institute of Technology, Sc.D. 1963"`
- `Buzz_Aldrin` → `birthDate` → `"1930-01-20"`

**Predicted Triples:**

(none)

#### Id28

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `SAGE_Publications` → `founder` → `Sara_Miller_McCune`
- `Administrative_Science_Quarterly` → `abbreviation` → `"Admin. Sci. Q."`
- `Administrative_Science_Quarterly` → `publisher` → `SAGE_Publications`

**Predicted Triples:**

(none)

#### Id9

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Agra_Airport` → `location` → `Agra`

**Predicted Triples:**

- ✗ `http://example.org/agra_airport` → `hubAirport` → `http://example.org/agra`

#### Id3

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Albany,_Georgia` → `isPartOf` → `Georgia_(U.S._state)`
- `United_States` → `ethnicGroup` → `Asian_Americans`
- `United_States` → `language` → `English_language`
- `Albany,_Georgia` → `country` → `United_States`

**Predicted Triples:**

- ✓ `http://example.org/albany_georgia` → `isPartOf` → `http://example.org/georgia`
- ✗ `http://example.org/georgia` → `isPartOf` → `http://example.org/united_states`
- ✓ `http://example.org/united_states` → `language` → `http://example.org/english`
- ✓ `http://example.org/united_states` → `ethnicGroups` → `http://example.org/asian_americans`

#### Id37

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Meyer_Werft` → `location` → `Germany`

**Predicted Triples:**

(none)

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 6 | **FN:** 6

**Gold Triples:**

- `Buzz_Aldrin` → `birthPlace` → `Glen_Ridge,_New_Jersey`
- `Buzz_Aldrin` → `selectedByNasa` → `1963`
- `Buzz_Aldrin` → `mission` → `Apollo_11`
- `Buzz_Aldrin` → `almaMater` → `"Massachusetts Institute of Technology, Sc.D. 1963"`
- `Buzz_Aldrin` → `birthDate` → `"1930-01-20"`
- `Buzz_Aldrin` → `status` → `"Retired"`

**Predicted Triples:**

- ✗ `http://example.org/buzz_aldrin` → `birthYear` → `1930`
- ✗ `http://example.org/buzz_aldrin` → `origin` → `http://example.org/glen_ridge`
- ✗ `http://example.org/buzz_aldrin` → `activeYearsStartYear` → `1963`
- ✗ `http://example.org/buzz_aldrin` → `wasselectedbyNASA` → `http://example.org/nasa`
- ✗ `http://example.org/buzz_aldrin` → `crewMembers` → `http://example.org/apollo_11`
- ✗ `http://example.org/glen_ridge` → `origin` → `http://example.org/new_jersey`

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Bolt_(comicsCharacter)` → `creator` → `Ernie_Colón`
- `Bolt_(comicsCharacter)` → `alternativeName` → `"Larry Bolatinsky"`
- `Bolt_(comicsCharacter)` → `creator` → `Dan_Mishkin`

**Predicted Triples:**

(none)

#### Id7

**F1:** 0.400 | **TP:** 1 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Black_Pirate` → `creator` → `Sheldon_Moldoff`
- `Black_Pirate` → `alternativeName` → `"Jon Valor"`

**Predicted Triples:**

- ✓ `http://example.org/black_pirate` → `creator` → `http://example.org/sheldon_moldoff`
- ✗ `http://example.org/black_pirate` → `altLabel` → `Jon Valor`
- ✗ `http://example.org/jon_valor` → `creator` → `http://example.org/sheldon_moldoff`

#### Id16

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Aleksandra_Kovač` → `genre` → `Rhythm_and_blues`
- `Aleksandra_Kovač` → `birthYear` → `1972`
- `Aleksandra_Kovač` → `birthPlace` → `Belgrade`
- `Aleksandra_Kovač` → `background` → `"solo_singer"`

**Predicted Triples:**

(none)

#### Id23

**F1:** 0.571 | **TP:** 2 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Asilomar_Conference_Grounds` → `location` → `Pacific_Grove,_California`
- `Asilomar_Conference_Grounds` → `addedToTheNationalRegisterOfHistoricPlaces` → `"1987-02-27"`
- `Asilomar_Conference_Grounds` → `NationalRegisterOfHistoricPlacesReferenceNumber` → `"87000823"`

**Predicted Triples:**

- ✗ `http://example.org/asilomar_conference_grounds` → `place` → `http://example.org/pacific_grove`
- ✗ `http://example.org/asilomar_conference_grounds` → `place` → `http://example.org/california`
- ✓ `http://example.org/asilomar_conference_grounds` → `addedToTheNationalRegisterOfHistoricPlaces` → `1987-02-27`
- ✓ `http://example.org/asilomar_conference_grounds` → `NationalRegisterOfHistoricPlacesReferenceNumber` → `87000823`

#### Id24

**F1:** 0.571 | **TP:** 2 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Asser_Levy_Public_Baths` → `location` → `"Asser Levy Place and East 23rd Street"`
- `Asser_Levy_Public_Baths` → `NationalRegisterOfHistoricPlacesReferenceNumber` → `"80002709"`
- `Asser_Levy_Public_Baths` → `addedToTheNationalRegisterOfHistoricPlaces` → `"1980-04-23"`

**Predicted Triples:**

- ✗ `http://example.org/asser_levy_public_baths` → `place` → `http://example.org/asser_levy_place`
- ✗ `http://example.org/asser_levy_public_baths` → `place` → `http://example.org/east_23rd_street`
- ✓ `http://example.org/asser_levy_public_baths` → `addedToTheNationalRegisterOfHistoricPlaces` → `1980-04-23`
- ✓ `http://example.org/asser_levy_public_baths` → `NationalRegisterOfHistoricPlacesReferenceNumber` → `80002709`

#### Id4

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `A.D._Isidro_Metapán` → `fullName` → `"Asociación Deportiva"`

**Predicted Triples:**

- ✓ `http://example.org/ad_isidro_metapn` → `fullName` → `Asociación Deportiva`

#### Id11

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `AMC_Matador` → `alternativeName` → `"VAM Classic"`
- `AMC_Matador` → `assembly` → `Thames,_New_Zealand`
- `AMC_Matador` → `bodyStyle` → `Station_wagon`
- `AMC_Matador` → `engine` → `AMC_V8_engine`

**Predicted Triples:**

(none)

#### Id14

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `AFC_Ajax_(amateurs)` → `nickname` → `"Joden , Godenzonen"`

**Predicted Triples:**

- ✓ `http://example.org/afc_ajax` → `nickname` → `Joden, Godenzonen`

#### Id30

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Uruguay` → `leader` → `Tabaré_Vázquez`
- `Alfredo_Zitarrosa` → `deathPlace` → `Montevideo`
- `Montevideo` → `country` → `Uruguay`
- `Uruguay` → `demonym` → `Uruguayans`

**Predicted Triples:**

(none)

#### Id5

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Azerbaijan` → `leader` → `Artur_Rasizade`
- `Baku_Turkish_Martyrs'_Memorial` → `material` → `"Red granite and white marble"`
- `Baku_Turkish_Martyrs'_Memorial` → `dedicatedTo` → `"Ottoman Army soldiers killed in the Battle of Baku"`
- `Baku_Turkish_Martyrs'_Memorial` → `location` → `Azerbaijan`

**Predicted Triples:**

- ✓ `http://example.org/baku_turkish_martyrs_memorial` → `dedicatedTo` → `http://example.org/ottoman_army`
- ✗ `http://example.org/baku_turkish_martyrs_memorial` → `battle` → `http://example.org/battle_of_baku`
- ✗ `http://example.org/baku` → `leader` → `http://example.org/artur_rasizade`
- ✓ `http://example.org/azerbaijan` → `leader` → `http://example.org/artur_rasizade`

#### Id18

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 5

**Gold Triples:**

- `Appleton_International_Airport` → `location` → `Greenville,_Wisconsin`
- `Appleton_International_Airport` → `runwayLength` → `2439.0`
- `Appleton_International_Airport` → `cityServed` → `Appleton,_Wisconsin`
- `Appleton_International_Airport` → `elevationAboveTheSeaLevel` → `280`
- `Appleton_International_Airport` → `runwayName` → `"3/21"`

**Predicted Triples:**

(none)

#### Id24

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Andrew_Rayel` → `associatedBand/associatedMusicalArtist` → `Jwaydan_Moyine`

**Predicted Triples:**

- ✗ `http://example.org/andrew_rayel` → `associatedBand_associatedMusicalArtist` → `http://example.org/jwaydan_moyine`

#### Id32

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `RCA_Records` → `distributingCompany` → `Legacy_Recordings`

**Predicted Triples:**

(none)

#### Id4

**F1:** 0.500 | **TP:** 2 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Acharya_Institute_of_Technology` → `affiliation` → `Visvesvaraya_Technological_University`
- `Acharya_Institute_of_Technology` → `wasGivenTheTechnicalCampusStatusBy` → `All_India_Council_for_Technical_Education`
- `All_India_Council_for_Technical_Education` → `location` → `Mumbai`
- `Visvesvaraya_Technological_University` → `city` → `Belgaum`

**Predicted Triples:**

- ✓ `http://example.org/acharya_institute_of_technology` → `affiliation` → `http://example.org/visvesvaraya_technological_university`
- ✓ `http://example.org/acharya_institute_of_technology` → `wasGivenTheTechnicalCampusStatusBy` → `http://example.org/all_india_council_for_technical_education`
- ✗ `http://example.org/visvesvaraya_technological_university` → `campus` → `http://example.org/belgaum`
- ✗ `http://example.org/all_india_council_for_technical_education` → `campus` → `http://example.org/mumbai`

#### Id27

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Asunción` → `isPartOf` → `Gran_Asunción`

**Predicted Triples:**

- ✓ `http://example.org/asuncin` → `isPartOf` → `http://example.org/gran_asuncin`

#### Id2

**F1:** 0.133 | **TP:** 1 | **FP:** 7 | **FN:** 6

**Gold Triples:**

- `Azerbaijan` → `capital` → `Baku`
- `Baku_Turkish_Martyrs'_Memorial` → `material` → `"Red granite and white marble"`
- `Azerbaijan` → `leaderTitle` → `Prime_Minister_of_Azerbaijan`
- `Baku_Turkish_Martyrs'_Memorial` → `dedicatedTo` → `"Ottoman Army soldiers killed in the Battle of Baku"`
- `Baku_Turkish_Martyrs'_Memorial` → `location` → `Azerbaijan`
- `Baku_Turkish_Martyrs'_Memorial` → `designer` → `"Hüseyin Bütüner and Hilmi Güner"`
- `Azerbaijan` → `legislature` → `National_Assembly_(Azerbaijan)`

**Predicted Triples:**

- ✓ `http://example.org/national_assembly_of_azerbaijan` → `legislature` → `http://example.org/azerbaijan`
- ✓ `http://example.org/azerbaijan` → `capital` → `http://example.org/baku`
- ✓ `http://example.org/baku` → `locationCountry` → `http://example.org/azerbaijan`
- ✗ `http://example.org/turkish_martyrs_memorial` → `location` → `http://example.org/baku`
- ✓ `http://example.org/turkish_martyrs_memorial` → `dedicatedTo` → `http://example.org/ottoman_army`
- ✗ `http://example.org/turkish_martyrs_memorial` → `battle` → `http://example.org/battle_of_baku`
- ✗ `http://example.org/huseyin_butuner` → `designCompany` → `http://example.org/turkish_martyrs_memorial`
- ✗ `http://example.org/hilmi_guner` → `designCompany` → `http://example.org/turkish_martyrs_memorial`

#### Id15

**F1:** 0.400 | **TP:** 1 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `1101_Clematis` → `epoch` → `2006-12-31`
- `1101_Clematis` → `periapsis` → `445895000000.0`

**Predicted Triples:**

- ✗ `http://example.org/1101_clematis` → `epoch` → `31st of July 2016`
- ✗ `http://example.org/1101_clematis` → `epoch` → `December 31st 2006`
- ✓ `http://example.org/1101_clematis` → `periapsis` → `445895000000.0`

#### Id16

**F1:** 0.400 | **TP:** 1 | **FP:** 1 | **FN:** 2

**Gold Triples:**

- `A_Severed_Wasp` → `numberOfPages` → `"388"`
- `A_Severed_Wasp` → `mediaType` → `"Print"`
- `A_Severed_Wasp` → `isbnNumber` → `"0-374-26131-8"`

**Predicted Triples:**

- ✗ `http://example.org/a_severed_wasp` → `ISBN_number` → `0-374-26131-8`
- ✓ `http://example.org/a_severed_wasp` → `numberOfPages` → `388`

#### Id1

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Aaron_S._Daggett` → `award` → `Purple_Heart`
- `Aaron_S._Daggett` → `birthPlace` → `Maine`
- `Aaron_S._Daggett` → `battle` → `Battle_of_Fredericksburg`

**Predicted Triples:**

(none)

#### Id6

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Abdul_Taib_Mahmud` → `successor` → `Adenan_Satem`

**Predicted Triples:**

- ✓ `http://example.org/abdul_taib_mahmud` → `successor` → `http://example.org/adenan_satem`

#### Id14

**F1:** 0.500 | **TP:** 2 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Akron_Summit_Assault` → `fullName` → `"Akron Metro Futbol Club Summit Assault"`
- `Akron_Summit_Assault` → `numberOfMembers` → `3000`
- `Akron_Summit_Assault` → `manager` → `Denzil_Antonio`
- `Akron_Summit_Assault` → `season` → `2011_PDL_season`

**Predicted Triples:**

- ✓ `http://example.org/akron_summit_assault` → `fullName` → `Akron Metro Futbol Club Summit Assault`
- ✓ `http://example.org/akron_summit_assault` → `season` → `2011 PDL season`
- ✗ `http://example.org/akron_summit_assault` → `club` → `http://example.org/pdl`
- ✗ `http://example.org/denzil_antonio` → `manager` → `http://example.org/akron_summit_assault`

#### Id17

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 3

**Gold Triples:**

- `Aleksandra_Kovač` → `associatedBand/associatedMusicalArtist` → `Bebi_Dol`
- `Aleksandra_Kovač` → `associatedBand/associatedMusicalArtist` → `Kornelije_Kovač`
- `Aleksandra_Kovač` → `genre` → `Pop_music`

**Predicted Triples:**

- ✓ `http://example.org/aleksandra_kova` → `genre` → `http://example.org/pop`
- ✗ `http://example.org/aleksandra_kova` → `musicalBand` → `Kornelije Kovač`
- ✗ `http://example.org/aleksandra_kova` → `associatedBand_associatedMusicalArtist` → `Kornelije Kovač`
- ✗ `http://example.org/aleksandra_kova` → `associatedBand_associatedMusicalArtist` → `Bebi Dol`

#### Id33

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Olympique_Lyonnais` → `ground` → `Parc_Olympique_Lyonnais`

**Predicted Triples:**

- ✓ `http://example.org/olympique_lyonnais` → `ground` → `http://example.org/parc_olympique_lyonnais`
- ✗ `http://example.org/olympique_lyonnais` → `stadium` → `http://example.org/parc_olympique_lyonnais`

#### Id3

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Baku_Turkish_Martyrs'_Memorial` → `nativeName` → `"Türk Şehitleri Anıtı"`
- `Baku_Turkish_Martyrs'_Memorial` → `material` → `"Red granite and white marble"`

**Predicted Triples:**

- ✗ `http://example.org/baku_turkish_martyrs_memorial` → `nativeName` → `Turk Sehitleri Aniti`
- ✗ `http://example.org/baku_turkish_martyrs_memorial` → `alternativeName` → `Turk Sehitleri Aniti`

#### Id29

**F1:** 1.000 | **TP:** 1 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `Argentina` → `leader` → `Gabriela_Michetti`

**Predicted Triples:**

- ✓ `http://example.org/argentina` → `leader` → `http://example.org/gabriela_michetti`

#### Id8

**F1:** 0.333 | **TP:** 1 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `103_Hera` → `mass` → `7.9 (kilograms)`
- `103_Hera` → `escapeVelocity` → `0.0482 (kilometrePerSeconds)`
- `103_Hera` → `apoapsis` → `437170000.0 (kilometres)`

**Predicted Triples:**

- ✗ `http://example.org/103_hera` → `mass` → `7.9 kg`
- ✗ `http://example.org/103_hera` → `escapeVelocity` → `0.0482 km/s`
- ✓ `http://example.org/103_hera` → `apoapsis` → `437170000.0 kilometres`

#### Id7

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `A.F.C._Blackpool` → `manager` → `Stuart_Parker_(footballer)`
- `Stuart_Parker_(footballer)` → `club` → `Sparta_Rotterdam`

**Predicted Triples:**

- ✓ `http://example.org/afc_blackpool` → `manager` → `http://example.org/stuart_parker`
- ✓ `http://example.org/stuart_parker` → `club` → `http://example.org/sparta_rotterdam`

#### Id21

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Ardmore_Airport_(New_Zealand)` → `location` → `Auckland`

**Predicted Triples:**

- ✗ `http://example.org/ardmore_airport` → `hubAirport` → `http://example.org/auckland`
- ✗ `http://example.org/auckland` → `hubAirport` → `http://example.org/new_zealand`

#### Id16

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Aleksey_Chirikov_(icebreaker)` → `builder` → `Finland`
- `Aleksey_Chirikov_(icebreaker)` → `shipBeam` → `21.2`
- `Aleksey_Chirikov_(icebreaker)` → `status` → `"In service"`
- `Aleksey_Chirikov_(icebreaker)` → `builder` → `Helsinki`

**Predicted Triples:**

- ✓ `http://example.org/aleksey_chirikov` → `shipBeam` → `21.2`
- ✗ `http://example.org/aleksey_chirikov` → `service` → `in service`
- ✗ `http://example.org/aleksey_chirikov` → `source` → `http://example.org/helsinki`
- ✗ `http://example.org/aleksey_chirikov` → `source` → `http://example.org/finland`

#### Id12

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Acta_Mathematica_Hungarica` → `abbreviation` → `"Acta Math. Hungar."`

**Predicted Triples:**

- ✓ `http://example.org/acta_mathematica_hungarica` → `abbreviation` → `Acta Math. Hungar`
- ✗ `http://example.org/acta_mathematica_hungarica` → `altLabel` → `Acta Math. Hungar.`

#### Id25

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Alfons_Gorbach` → `deathPlace` → `Styria`
- `Alfons_Gorbach` → `deathPlace` → `Austria`
- `Alfons_Gorbach` → `birthPlace` → `Austria-Hungary`
- `Alfons_Gorbach` → `birthPlace` → `Imst`

**Predicted Triples:**

(none)

#### Id17

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `Auburn,_Washington` → `isPartOf` → `Pierce_County,_Washington`
- `United_States` → `capital` → `Washington,_D.C.`
- `Pierce_County,_Washington` → `country` → `United_States`
- `Auburn,_Washington` → `isPartOf` → `King_County,_Washington`

**Predicted Triples:**

- ✗ `http://example.org/washington_dc` → `capital` → `http://example.org/united_states`
- ✓ `http://example.org/auburn` → `isPartOf` → `http://example.org/king_county`
- ✓ `http://example.org/auburn` → `isPartOf` → `http://example.org/pierce_county`
- ✓ `http://example.org/auburn` → `isPartOf` → `http://example.org/washington`
- ✗ `http://example.org/king_county` → `isPartOf` → `http://example.org/washington`
- ✗ `http://example.org/pierce_county` → `isPartOf` → `http://example.org/washington`
- ✗ `http://example.org/washington` → `isPartOf` → `http://example.org/united_states`

#### Id18

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 4

**Gold Triples:**

- `Adonis_Georgiadis` → `birthPlace` → `Athens`
- `Adonis_Georgiadis` → `birthPlace` → `Greece`
- `Adonis_Georgiadis` → `office` → `Ministry_of_Economy,_Development_and_Tourism_(Greece)`
- `Adonis_Georgiadis` → `successor` → `Makis_Voridis`

**Predicted Triples:**

(none)

#### Id9

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `Amarillo,_Texas` → `isPartOf` → `Potter_County,_Texas`

**Predicted Triples:**

- ✓ `http://example.org/amarillo` → `isPartOf` → `http://example.org/potter_county`
- ✗ `http://example.org/potter_county` → `isPartOf` → `http://example.org/texas`

#### Id2

**F1:** 1.000 | **TP:** 2 | **FP:** 0 | **FN:** 0

**Gold Triples:**

- `A-Rosa_Luna` → `shipClass` → `Cruise_ship`
- `A-Rosa_Luna` → `length` → `125800.0 (millimetres)`

**Predicted Triples:**

- ✓ `http://example.org/a-rosa_luna` → `length` → `125800.0 millimetres`
- ✓ `http://example.org/a-rosa_luna` → `shipClass` → `http://example.org/cruise_ship`

#### Id6

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Al_Asad_Airbase` → `operatingOrganisation` → `United_States_Air_Force`
- `United_States_Air_Force` → `battle` → `Invasion_of_Grenada`
- `United_States_Air_Force` → `battle` → `Korean_War`

**Predicted Triples:**

(none)

#### Id25

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Belgium` → `leader` → `Philippe_of_Belgium`

**Predicted Triples:**

- ✓ `http://example.org/belgium` → `leader` → `http://example.org/philippe_of_belgium`
- ✓ `http://example.org/philippe_of_belgium` → `leaderName` → `Philippe of Belgium`

#### Id14

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Alan_B._Miller_Hall` → `location` → `Virginia`
- `Alan_B._Miller_Hall` → `architect` → `Robert_A._M._Stern`
- `Mason_School_of_Business` → `country` → `United_States`
- `Alan_B._Miller_Hall` → `currentTenants` → `Mason_School_of_Business`

**Predicted Triples:**

- ✗ `http://example.org/mason_school_of_business` → `currentTenants` → `http://example.org/alan_b_miller_hall`
- ✗ `http://example.org/mason_school_of_business` → `state` → `http://example.org/united_states`
- ✓ `http://example.org/alan_b_miller_hall` → `architect` → `http://example.org/robert_a_m_stern`
- ✗ `http://example.org/alan_b_miller_hall` → `state` → `http://example.org/virginia`

#### Id18

**F1:** 0.667 | **TP:** 1 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Alessio_Romagnoli` → `club` → `A.C._Milan`
- `Alessio_Romagnoli` → `position` → `Defender_(football)`

**Predicted Triples:**

- ✓ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/ac_milan`

#### Id39

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Philippines` → `ethnicGroup` → `Zamboangans`
- `Philippines` → `language` → `Philippine_Spanish`
- `Batchoy` → `country` → `Philippines`
- `Philippines` → `ethnicGroup` → `Chinese_Filipino`

**Predicted Triples:**

- ✗ `http://example.org/zamboangans` → `ethnicGroup` → `http://example.org/philippines`
- ✓ `http://example.org/philippines` → `officialLanguage` → `http://example.org/philippine_spanish`
- ✗ `http://example.org/chinese_filipino` → `ethnicGroup` → `http://example.org/philippines`
- ✗ `http://example.org/batchoy` → `source` → `http://example.org/philippines`

#### Id29

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 1

**Gold Triples:**

- `Greece` → `language` → `Greek_language`

**Predicted Triples:**

(none)

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

#### Id6

**F1:** 0.400 | **TP:** 2 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Alessio_Romagnoli` → `currentclub` → `A.C._Milan`
- `A.C._Milan` → `manager` → `Siniša_Mihajlović`
- `A.C._Milan` → `chairman` → `Silvio_Berlusconi`
- `Alessio_Romagnoli` → `club` → `Italy_national_under-17_football_team`
- `Alessio_Romagnoli` → `club` → `U.C._Sampdoria`

**Predicted Triples:**

- ✓ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/ac_milan`
- ✓ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/uc_sampdoria`
- ✗ `http://example.org/alessio_romagnoli` → `club` → `http://example.org/italian_national_under-17_football_team`
- ✓ `http://example.org/ac_milan` → `chairman` → `http://example.org/silvio_berlusconi`
- ✗ `http://example.org/ac_milan` → `chairman` → `http://example.org/sinia_mihajlovi`

#### Id8

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 2

**Gold Triples:**

- `Blockbuster_(comicsCharacter)` → `creator` → `Roger_Stern`
- `Blockbuster_(comicsCharacter)` → `creator` → `Tom_Lyle`

**Predicted Triples:**

(none)

#### Id18

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Alfredo_Zitarrosa` → `genre` → `Milonga_(music)`

**Predicted Triples:**

- ✓ `http://example.org/alfredo_zitarrosa` → `genre` → `http://example.org/milonga`

#### Id11

**F1:** 0.667 | **TP:** 1 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Swords,_Dublin` → `leaderTitle` → `"County Manager"`

**Predicted Triples:**

- ✓ `http://example.org/swords_dublin` → `leaderTitle` → `County Manager`
- ✓ `http://example.org/swords_dublin` → `leader` → `http://example.org/county_manager`

#### Id1

**F1:** 0.000 | **TP:** 0 | **FP:** 4 | **FN:** 4

**Gold Triples:**

- `Abilene_Regional_Airport` → `cityServed` → `Abilene,_Texas`
- `Abilene,_Texas` → `isPartOf` → `Texas`
- `Abilene_Regional_Airport` → `runwayLength` → `1121.0`
- `Abilene,_Texas` → `country` → `United_States`

**Predicted Triples:**

- ✗ `http://example.org/abilene_regional_airport` → `runwayLength` → `1121 metres`
- ✓ `http://example.org/abilene_regional_airport` → `served` → `http://example.org/abilene`
- ✗ `http://example.org/abilene` → `state` → `http://example.org/texas`
- ✗ `http://example.org/texas` → `region` → `http://example.org/united_states`

#### Id19

**F1:** 0.000 | **TP:** 0 | **FP:** 7 | **FN:** 4

**Gold Triples:**

- `Contra_Costa_County,_California` → `isPartOf` → `San_Francisco_Bay_Area`
- `Antioch,_California` → `isPartOf` → `California`
- `Antioch,_California` → `isPartOf` → `Contra_Costa_County,_California`
- `California` → `language` → `Spanish_language`

**Predicted Triples:**

- ✓ `http://example.org/antioch` → `isPartOf` → `http://example.org/contra_costa_county`
- ✗ `http://example.org/antioch` → `isPartOf` → `http://example.org/san_francisco_bay_area`
- ✓ `http://example.org/antioch` → `isPartOf` → `http://example.org/california`
- ✓ `http://example.org/contra_costa_county` → `isPartOf` → `http://example.org/san_francisco_bay_area`
- ✗ `http://example.org/contra_costa_county` → `isPartOf` → `http://example.org/california`
- ✗ `http://example.org/san_francisco_bay_area` → `isPartOf` → `http://example.org/california`
- ✗ `http://example.org/spanish` → `spokenIn` → `http://example.org/california`

#### Id36

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 1

**Gold Triples:**

- `Nigerian_Air_Force` → `commander` → `Sadique_Abubakar`

**Predicted Triples:**

- ✗ `http://example.org/sadique_abubakar` → `commander` → `http://example.org/nigerian_air_force`

#### Id14

**F1:** 0.800 | **TP:** 2 | **FP:** 1 | **FN:** 0

**Gold Triples:**

- `Bacon_Explosion` → `ingredient` → `Bacon`
- `Bacon_Explosion` → `course` → `"Main course"`

**Predicted Triples:**

- ✓ `http://example.org/bacon_explosion` → `ingredient` → `http://example.org/bacon`
- ✓ `http://example.org/bacon_explosion` → `mainIngredient` → `http://example.org/bacon`
- ✓ `http://example.org/bacon_explosion` → `course` → `main course`

#### Id20

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 2

**Gold Triples:**

- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Billy_Iuso`
- `Anders_Osborne` → `associatedBand/associatedMusicalArtist` → `Theresa_Andersson`

**Predicted Triples:**

- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/billy_iuso`
- ✗ `http://example.org/anders_osborne` → `associatedBand_associatedMusicalArtist` → `http://example.org/theresa_andersson`

#### Id14

**F1:** 0.000 | **TP:** 0 | **FP:** 3 | **FN:** 4

**Gold Triples:**

- `Aleksandra_Kovač` → `birthYear` → `1972`
- `Aleksandra_Kovač` → `genre` → `Pop_music`
- `Aleksandra_Kovač` → `birthPlace` → `Belgrade`
- `Aleksandra_Kovač` → `background` → `"solo_singer"`

**Predicted Triples:**

- ✗ `http://example.org/aleksandra_kova` → `identifier` → `born 1972`
- ✗ `http://example.org/aleksandra_kova` → `prefLabel` → `Singer and pop musician`
- ✗ `http://example.org/aleksandra_kova` → `musicComposer` → `http://example.org/pop_music`

#### Id12

**F1:** 0.000 | **TP:** 0 | **FP:** 2 | **FN:** 1

**Gold Triples:**

- `United_States` → `longName` → `United States of America`

**Predicted Triples:**

- ✗ `http://example.org/united_states_of_america` → `fullName` → `United States of America`
- ✓ `http://example.org/united_states_of_america` → `longName` → `United States of America`

#### Id1

**F1:** 0.250 | **TP:** 1 | **FP:** 3 | **FN:** 3

**Gold Triples:**

- `Abel_Hernández` → `club` → `Peñarol`
- `Abel_Hernández` → `youthclub` → `Central_Español`
- `Hull_City_A.F.C.` → `manager` → `Steve_Bruce`
- `Abel_Hernández` → `club` → `Hull_City_A.F.C.`

**Predicted Triples:**

- ✗ `http://example.org/abel_hernandez` → `club` → `http://example.org/penarol`
- ✗ `http://example.org/abel_hernandez` → `club` → `http://example.org/hull_city_afc`
- ✗ `http://example.org/abel_hernandez` → `universityTeam` → `http://example.org/central_espaol`
- ✓ `http://example.org/hull_city_afc` → `manager` → `http://example.org/steve_bruce`

#### Id1

**F1:** 0.000 | **TP:** 0 | **FP:** 5 | **FN:** 5

**Gold Triples:**

- `A.F.C._Blackpool` → `manager` → `Stuart_Parker_(footballer)`
- `Stuart_Parker_(footballer)` → `club` → `KV_Mechelen`
- `Stuart_Parker_(footballer)` → `club` → `Chesterfield_F.C.`
- `Blackpool` → `leader` → `Gordon_Marsden`
- `A.F.C._Blackpool` → `ground` → `Blackpool`

**Predicted Triples:**

- ✗ `http://example.org/gordon_marsden` → `leader` → `http://example.org/blackpool`
- ✗ `http://example.org/afc_blackpool` → `isPartOf` → `http://example.org/blackpool`
- ✗ `http://example.org/stuart_parker` → `manager` → `http://example.org/afc_blackpool`
- ✗ `http://example.org/stuart_parker` → `bandMember` → `http://example.org/chesterfield_fc`
- ✓ `http://example.org/stuart_parker` → `club` → `http://example.org/kv_mechelen`

---

## REBEL - val

**Timestamp:** 2025-11-23T00:44:43.948Z
**Sample Size:** 10
**Overall F1:** 0.3750
**Failed Extractions:** 0

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| rebel_sample_1 | http://example.org/aleksa | date_of_birth | http://example.org/23_aug | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | date_of_death | http://example.org/8_july | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | country_of_citizenship | http://example.org/russia | No partial match found in gold set |
| rebel_sample_1 | http://example.org/aleksa | occupation | novelist | No partial match found in gold set |
| rebel_sample_2 | http://example.org/eiffel | founded_by | http://example.org/gustav | Subject matches "Eiffel Tower", but object "http:/ |
| rebel_sample_2 | http://example.org/eiffel | capital_of | http://example.org/champ_ | Subject matches "Eiffel Tower", but object "http:/ |
| rebel_sample_2 | http://example.org/champ_ | capital_of | http://example.org/paris | No partial match found in gold set |
| rebel_sample_2 | http://example.org/paris | capital_of | http://example.org/france | No partial match found in gold set |
| rebel_sample_2 | http://example.org/eiffel | founded_by | http://example.org/gustav | No partial match found in gold set |
| rebel_sample_4 | http://example.org/mount_ | capital_of | http://example.org/earth | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mount_ | capital_of | http://example.org/mahala | Subject matches "Mount Everest", but object "http: |
| rebel_sample_4 | http://example.org/mahala | capital_of | http://example.org/himala | No partial match found in gold set |
| rebel_sample_4 | http://example.org/china | capital_of | http://example.org/mount_ | No partial match found in gold set |
| rebel_sample_4 | http://example.org/nepal | capital_of | http://example.org/mount_ | No partial match found in gold set |
| rebel_sample_8 | http://example.org/great_ | headquarters_location | http://example.org/china | Wrong predicate: used "headquarters_location" inst |
| rebel_sample_9 | http://example.org/jeff_b | country_of_citizenship | http://example.org/united | No partial match found in gold set |
| rebel_sample_10 | http://example.org/amazon | prefLabel | second longest river in t | Subject matches "Amazon River", but object "second |

**Most Common Wrong Predicates:**

- `capital_of`: 8 occurrences
- `country_of_citizenship`: 2 occurrences
- `founded_by`: 2 occurrences
- `date_of_birth`: 1 occurrences
- `date_of_death`: 1 occurrences
- `occupation`: 1 occurrences
- `headquarters_location`: 1 occurrences
- `prefLabel`: 1 occurrences

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

- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_birth` → `http://example.org/23_august_1880`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `date_of_death` → `http://example.org/8_july_1932`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `country_of_citizenship` → `http://example.org/russia`
- ✗ `http://example.org/aleksandr_stepanovich_grin` → `occupation` → `novelist`

#### rebel_sample_2

**F1:** 0.200 | **TP:** 1 | **FP:** 5 | **FN:** 3

**Gold Triples:**

- `Eiffel Tower` → `located in` → `Paris`
- `Eiffel Tower` → `country` → `France`
- `Eiffel Tower` → `named after` → `Gustave Eiffel`
- `Gustave Eiffel` → `occupation` → `engineer`

**Predicted Triples:**

- ✗ `http://example.org/eiffel_tower` → `founded_by` → `http://example.org/gustave_eiffel`
- ✗ `http://example.org/eiffel_tower` → `capital_of` → `http://example.org/champ_de_mars`
- ✓ `http://example.org/gustave_eiffel` → `occupation` → `engineer`
- ✗ `http://example.org/champ_de_mars` → `capital_of` → `http://example.org/paris`
- ✗ `http://example.org/paris` → `capital_of` → `http://example.org/france`
- ✗ `http://example.org/eiffels_company` → `founded_by` → `http://example.org/gustave_eiffel`

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

- ✗ `http://example.org/mount_everest` → `capital_of` → `http://example.org/earth`
- ✗ `http://example.org/mount_everest` → `capital_of` → `http://example.org/mahalangur_himal`
- ✗ `http://example.org/mahalangur_himal` → `capital_of` → `http://example.org/himalayas`
- ✗ `http://example.org/china` → `capital_of` → `http://example.org/mount_everest`
- ✗ `http://example.org/nepal` → `capital_of` → `http://example.org/mount_everest`

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

- ✓ `http://example.org/marie_curie` → `date_of_birth` → `7 November 1867`
- ✓ `http://example.org/marie_curie` → `date_of_death` → `4 July 1934`
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

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 3

**Gold Triples:**

- `Great Wall of China` → `located in` → `China`
- `Great Wall of China` → `made from material` → `stone`
- `Great Wall of China` → `made from material` → `brick`

**Predicted Triples:**

- ✗ `http://example.org/great_wall_of_china` → `headquarters_location` → `http://example.org/china`

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
- ✗ `http://example.org/jeff_bezos` → `country_of_citizenship` → `http://example.org/united_states_of_america`

#### rebel_sample_10

**F1:** 0.000 | **TP:** 0 | **FP:** 1 | **FN:** 4

**Gold Triples:**

- `Amazon River` → `located in` → `South America`
- `Amazon River` → `country` → `Brazil`
- `Amazon River` → `country` → `Peru`
- `Amazon River` → `country` → `Colombia`

**Predicted Triples:**

- ✗ `http://example.org/amazon_river` → `prefLabel` → `second longest river in the world`

---

## DocRED - dev

**Timestamp:** 2025-11-23T00:44:11.052Z
**Sample Size:** 3
**Overall F1:** 0.4524
**Failed Extractions:** 1

### False Positives (Predicted but Wrong)

| Entry | Subject | Predicate | Object | Analysis |
|-------|---------|-----------|--------|----------|
| Marie_Curie | http://example.org/marie_ | occupation | physicist | Subject matches "Marie Curie", but object "physici |

**Most Common Wrong Predicates:**

- `occupation`: 1 occurrences

### False Negatives (Gold but Not Predicted)

| Entry | Subject | Predicate | Object |
|-------|---------|-----------|--------|
| Albert_Einstein | Albert Einstein | country of citizenship | Germany |
| Albert_Einstein | Albert Einstein | occupation | physicist |
| Albert_Einstein | Albert Einstein | place of birth | Ulm |
| London | London | country | England |
| London | London | located in or next to body of water | River Thames |

**Most Commonly Missed Predicates:**

- `country of citizenship`: 1 occurrences
- `occupation`: 1 occurrences
- `place of birth`: 1 occurrences
- `country`: 1 occurrences
- `located in or next to body of water`: 1 occurrences

### Per-Example Breakdown

#### Albert_Einstein

**F1:** 0.000 | **TP:** 0 | **FP:** 0 | **FN:** 3

**Gold Triples:**

- `Albert Einstein` → `country of citizenship` → `Germany`
- `Albert Einstein` → `occupation` → `physicist`
- `Albert Einstein` → `place of birth` → `Ulm`

**Predicted Triples:**

(none)

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

# Recommendations for Prompt Optimization

Based on the analysis above, consider:

1. **Predicate Selection**: The LLM often uses generic RDFS predicates (`rdfs:comment`, `rdfs:seeAlso`) instead of domain-specific ones. Add explicit instructions to prefer domain properties.

2. **Name Normalization**: Subject names sometimes differ (e.g., 'Aleksandr Stepanovich Grin' vs 'Aleksandr Grin'). Consider adding name canonicalization hints.

3. **Property Alignment**: Ensure ontology properties align with expected gold predicates (e.g., 'date of birth' vs 'date_of_birth').

4. **Few-Shot Examples**: Add examples of correct extractions to the prompt to guide the LLM.

5. **Matcher Relaxation**: Consider fuzzy matching for subjects/objects to handle name variations.
