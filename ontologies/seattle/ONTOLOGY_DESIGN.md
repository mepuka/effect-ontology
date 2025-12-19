# Seattle Ontology Pack - Production Design

This document specifies the complete ontology design for the Seattle mayor administration case study. Every design decision is driven by **competency questions** that must be answerable via SPARQL.

## Design Principles

1. **Reuse > Reinvent**: 95%+ of vocabulary comes from W3C standards
2. **Testable**: Every requirement has a SPARQL query that must work
3. **Conflict-friendly**: Uses Claim nodes (from `claims.ttl`) for news corrections
4. **Bitemporal**: Tracks both event time and knowledge time
5. **Provenance-first**: Every fact traces to source with evidence spans

## Namespace Declarations

```turtle
@prefix : <http://effect-ontology.dev/seattle/> .
@prefix seattle: <http://effect-ontology.dev/seattle/> .
@prefix claims: <http://effect-ontology.dev/claims#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix org: <http://www.w3.org/ns/org#> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix oa: <http://www.w3.org/ns/oa#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
```

---

## Part 1: Competency Questions as SPARQL Tests

### A. Administration/Staffing Queries

#### CQ-A1: Who is the mayor at time T?

**Natural language**: "Who was Mayor of Seattle on 2025-01-15?"

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?person ?name WHERE {
  ?membership a org:Membership ;
              org:post seattle:MayorPost ;  # W3C ORG: org:post links Membership→Post
              org:member ?person ;
              org:memberDuring ?interval .

  ?person foaf:name ?name .

  ?interval time:hasBeginning ?begin .
  ?begin time:inXSDDate ?startDate .

  OPTIONAL {
    ?interval time:hasEnd ?end .
    ?end time:inXSDDate ?endDate .
  }

  FILTER (?startDate <= "2025-01-15"^^xsd:date)
  FILTER (!BOUND(?endDate) || ?endDate >= "2025-01-15"^^xsd:date)
}
```

#### CQ-A2: What senior staff has been announced, by role, with sources?

**Natural language**: "Show all senior staff announcements with their roles and source documents"

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT ?person ?personName ?role ?roleLabel ?source ?sourceTitle ?announcedDate WHERE {
  ?event a seattle:StaffAnnouncementEvent ;
         seattle:announcedMembership ?membership ;
         time:inXSDDateTime ?announcedDate ;
         prov:wasDerivedFrom ?source .

  ?source dcterms:title ?sourceTitle .

  ?membership org:member ?person ;
              org:post ?post .  # W3C ORG: org:post links Membership→Post

  ?person foaf:name ?personName .
  ?post skos:prefLabel ?roleLabel .
}
ORDER BY DESC(?announcedDate)
```

#### CQ-A3: What role(s) does Person X hold, and when did that become known?

**Natural language**: "Show all roles for Tim Burgess with effective dates and announcement dates"

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?post ?roleLabel ?startDate ?endDate ?announcedAt ?source WHERE {
  ?person foaf:name "Tim Burgess" .

  ?membership a org:Membership ;
              org:member ?person ;
              org:post ?post ;  # W3C ORG: org:post links Membership→Post
              org:memberDuring ?interval .

  ?post skos:prefLabel ?roleLabel .

  ?interval time:hasBeginning/time:inXSDDate ?startDate .
  OPTIONAL { ?interval time:hasEnd/time:inXSDDate ?endDate }

  # When we learned about this
  OPTIONAL {
    ?event seattle:announcedMembership ?membership ;
           time:inXSDDateTime ?announcedAt ;
           prov:wasDerivedFrom ?source .
  }
}
ORDER BY DESC(?startDate)
```

#### CQ-A4: Who was mayor-elect (announced but not yet serving)?

**Natural language**: "Show pending mayors whose term hasn't started"

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?person ?name ?termStart WHERE {
  ?membership a org:Membership ;
              org:post seattle:MayorPost ;  # W3C ORG: org:post links Membership→Post
              org:member ?person ;
              org:memberDuring ?interval .

  ?person foaf:name ?name .

  ?interval time:hasBeginning ?begin .
  ?begin time:inXSDDate ?termStart .

  FILTER (?termStart > NOW())
}
```

### B. Departments & Governance Queries

#### CQ-B1: What departments exist and who leads them?

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?dept ?deptName ?leader ?leaderName ?role WHERE {
  ?dept a org:OrganizationalUnit ;
        org:unitOf seattle:CityOfSeattle ;
        skos:prefLabel ?deptName .

  OPTIONAL {
    ?membership org:organization ?dept ;
                org:post ?post ;  # W3C ORG: org:post links Membership→Post
                org:member ?leader .

    ?post a seattle:LeadershipPost .
    ?leader foaf:name ?leaderName .

    # Currently active
    ?membership org:memberDuring ?interval .
    ?interval time:hasBeginning/time:inXSDDate ?start .
    OPTIONAL { ?interval time:hasEnd/time:inXSDDate ?end }
    FILTER (?start <= NOW())
    FILTER (!BOUND(?end) || ?end >= NOW())
  }
}
```

#### CQ-B2: What boards/commissions exist and who sits on them?

```sparql
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?board ?boardName (GROUP_CONCAT(?memberName; SEPARATOR=", ") AS ?members) WHERE {
  ?board a seattle:BoardOrCommission ;
         skos:prefLabel ?boardName .

  OPTIONAL {
    ?membership org:organization ?board ;
                org:member ?member .
    ?member foaf:name ?memberName .

    # Currently active
    ?membership org:memberDuring ?interval .
    ?interval time:hasBeginning/time:inXSDDate ?start .
    OPTIONAL { ?interval time:hasEnd/time:inXSDDate ?end }
    FILTER (?start <= NOW())
    FILTER (!BOUND(?end) || ?end >= NOW())
  }
}
GROUP BY ?board ?boardName
```

### C. Policy/Initiative Queries

#### CQ-C1: What initiatives did the mayor announce?

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?initiative ?title ?description ?announcedDate ?source WHERE {
  ?event a seattle:PolicyInitiativeEvent ;
         seattle:announces ?initiative ;
         time:inXSDDateTime ?announcedDate ;
         prov:wasDerivedFrom ?source .

  ?initiative skos:prefLabel ?title .
  OPTIONAL { ?initiative skos:definition ?description }
}
ORDER BY DESC(?announcedDate)
```

#### CQ-C2: What budget actions happened and what entities were impacted?

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?action ?actionTitle ?date ?impactedEntity ?entityName WHERE {
  ?event a seattle:BudgetActionEvent ;
         skos:prefLabel ?actionTitle ;
         time:inXSDDateTime ?date ;
         seattle:impacts ?impactedEntity .

  ?impactedEntity skos:prefLabel ?entityName .
}
ORDER BY DESC(?date)
```

### D. Trust & Provenance Queries

#### CQ-D1: For any displayed fact, what document(s) support it?

```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT ?claim ?subject ?predicate ?object ?source ?sourceTitle ?sourceUrl WHERE {
  ?claim a claims:Claim ;
         claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:statedIn ?source .

  ?source dcterms:title ?sourceTitle .
  OPTIONAL { ?source dcterms:source ?sourceUrl }
}
```

#### CQ-D2: What exact text spans are evidence?

```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX oa: <http://www.w3.org/ns/oa#>

SELECT ?claim ?evidenceText ?startOffset ?endOffset ?source WHERE {
  ?claim a claims:Claim ;
         claims:hasEvidence ?evidence .

  ?evidence claims:evidenceText ?evidenceText ;
            claims:startOffset ?startOffset ;
            claims:endOffset ?endOffset ;
            claims:evidenceSource ?source .
}
```

#### CQ-D3: What is the extraction confidence for claims?

```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?claim ?subject ?predicate ?object ?confidence ?rank WHERE {
  ?claim a claims:Claim ;
         claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:confidence ?confidence ;
         claims:rank ?rank .
}
ORDER BY DESC(?confidence)
```

### E. Reasoning/Inference Queries

#### CQ-E1: Which inferred facts were produced today?

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?assertion ?subject ?predicate ?object ?derivedAt WHERE {
  ?assertion a claims:DerivedAssertion ;
             claims:claimSubject ?subject ;
             claims:claimPredicate ?predicate ;
             claims:claimObject ?object ;
             prov:generatedAtTime ?derivedAt .

  FILTER (?derivedAt >= "2025-12-18T00:00:00Z"^^xsd:dateTime)
  FILTER (?derivedAt < "2025-12-19T00:00:00Z"^^xsd:dateTime)
}
```

#### CQ-E2: Which rule produced an inference and why?

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?derivedFact ?rule ?ruleName ?supportingFact WHERE {
  ?derivedFact a claims:DerivedAssertion ;
               prov:wasGeneratedBy ?activity .

  ?activity a seattle:ReasoningActivity ;
            seattle:appliedRule ?rule ;
            prov:used ?supportingFact .

  ?rule skos:prefLabel ?ruleName .
}
```

#### CQ-E3: What changed because we updated a rule?

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?rule ?newFacts ?oldFactsInvalidated WHERE {
  ?ruleUpdate a seattle:RuleUpdateEvent ;
              seattle:updatedRule ?rule ;
              seattle:producedFacts ?newFacts ;
              seattle:invalidatedFacts ?oldFactsInvalidated ;
              prov:endedAtTime ?updateTime .
}
ORDER BY DESC(?updateTime)
```

---

## Part 2: TBox Design

### Class Hierarchy

```
owl:Thing
├── foaf:Person                    # People (from FOAF)
├── org:Organization               # Organizations (from W3C ORG)
│   ├── org:FormalOrganization     # Government bodies
│   └── seattle:BoardOrCommission  # Boards, commissions (extension)
├── org:OrganizationalUnit         # Departments, offices
├── org:Post                       # Positions/roles (from W3C ORG)
│   └── seattle:LeadershipPost     # Department head positions (extension)
├── org:Membership                 # Person-org-role-time binding
├── org:Role                       # Role type (uses SKOS)
├── time:Interval                  # Time periods (from OWL-Time)
├── time:Instant                   # Points in time
├── prov:Entity                    # Provenance entities
│   └── claims:Claim               # Extracted claims (from claims.ttl)
│       └── claims:DerivedAssertion # Inferred facts
├── prov:Activity                  # Provenance activities
│   ├── seattle:StaffAnnouncementEvent
│   ├── seattle:PolicyInitiativeEvent
│   ├── seattle:BudgetActionEvent
│   ├── seattle:CouncilVoteEvent
│   └── seattle:ReasoningActivity
├── prov:Agent                     # Extraction agents
├── claims:Evidence                # Text span evidence
└── skos:Concept                   # Controlled vocabulary terms
```

### Domain-Specific Extensions (Minimal)

The Seattle pack adds **only these custom classes**:

| Class | Extends | Purpose |
|-------|---------|---------|
| `seattle:BoardOrCommission` | `org:Organization` | Boards, commissions, task forces |
| `seattle:LeadershipPost` | `org:Post` | Department head positions |
| `seattle:StaffAnnouncementEvent` | `prov:Activity` | Staff role announcements |
| `seattle:PolicyInitiativeEvent` | `prov:Activity` | Policy/initiative announcements |
| `seattle:BudgetActionEvent` | `prov:Activity` | Budget allocations/cuts |
| `seattle:CouncilVoteEvent` | `prov:Activity` | Council votes |
| `seattle:ReasoningActivity` | `prov:Activity` | Inference rule execution |
| `seattle:RuleUpdateEvent` | `prov:Activity` | Rule version changes |

### Domain-Specific Properties

| Property | Domain | Range | Purpose |
|----------|--------|-------|---------|
| `seattle:announcedMembership` | `seattle:StaffAnnouncementEvent` | `org:Membership` | Links event to memberships announced |
| `seattle:announces` | `seattle:PolicyInitiativeEvent` | `skos:Concept` | Initiative being announced |
| `seattle:impacts` | `seattle:BudgetActionEvent` | `org:Organization` | Affected org/dept |
| `seattle:appliedRule` | `seattle:ReasoningActivity` | `seattle:InferenceRule` | Rule that fired |
| `seattle:updatedRule` | `seattle:RuleUpdateEvent` | `seattle:InferenceRule` | Rule that changed |
| `seattle:producedFacts` | `seattle:RuleUpdateEvent` | `xsd:integer` | Count of new facts |
| `seattle:invalidatedFacts` | `seattle:RuleUpdateEvent` | `xsd:integer` | Count of invalidated facts |

### SKOS Concept Scheme for Seattle Roles

```turtle
seattle:SeattleRoleScheme a skos:ConceptScheme ;
    skos:prefLabel "Seattle Government Roles"@en .

seattle:MayorRole a skos:Concept, org:Role ;
    skos:prefLabel "Mayor"@en ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:DeputyMayorRole a skos:Concept, org:Role ;
    skos:prefLabel "Deputy Mayor"@en ;
    skos:broader seattle:ExecutiveRole ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:ChiefOfStaffRole a skos:Concept, org:Role ;
    skos:prefLabel "Chief of Staff"@en ;
    skos:broader seattle:ExecutiveRole ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:CommunicationsDirectorRole a skos:Concept, org:Role ;
    skos:prefLabel "Communications Director"@en ;
    skos:broader seattle:DirectorRole ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:PolicyDirectorRole a skos:Concept, org:Role ;
    skos:prefLabel "Policy Director"@en ;
    skos:broader seattle:DirectorRole ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:CouncilMemberRole a skos:Concept, org:Role ;
    skos:prefLabel "Council Member"@en ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:CouncilPresidentRole a skos:Concept, org:Role ;
    skos:prefLabel "Council President"@en ;
    skos:broader seattle:CouncilMemberRole ;
    skos:inScheme seattle:SeattleRoleScheme .

# Abstract role categories
seattle:ExecutiveRole a skos:Concept ;
    skos:prefLabel "Executive Role"@en ;
    skos:inScheme seattle:SeattleRoleScheme .

seattle:DirectorRole a skos:Concept ;
    skos:prefLabel "Director Role"@en ;
    skos:inScheme seattle:SeattleRoleScheme .
```

---

## Part 3: Integration with Existing System

### OWL Imports

```turtle
<http://effect-ontology.dev/seattle> a owl:Ontology ;
    owl:imports <http://xmlns.com/foaf/0.1/> ;
    owl:imports <http://www.w3.org/ns/org#> ;
    owl:imports <http://www.w3.org/2006/time#> ;
    owl:imports <http://www.w3.org/ns/prov#> ;
    owl:imports <http://www.w3.org/ns/oa#> ;
    owl:imports <http://effect-ontology.dev/claims> .
```

### Relationship to claims.ttl

The Seattle ontology **extends** `claims.ttl`:

1. **Claims**: Extracted facts use `claims:Claim` with ranks and provenance
2. **Evidence**: Text spans use `claims:Evidence` with offsets
3. **Provenance**: Uses `claims:statedIn`, `claims:extractedBy`, etc.
4. **Events**: Seattle events are specialized `prov:Activity` that generate claims

### Named Graph Partitioning

```
# Asserted facts from extraction
GRAPH <seattle:graph/asserted/current> { ... }

# Inferred facts from reasoning
GRAPH <seattle:graph/inferred/current> { ... }

# Specific rule run results
GRAPH <seattle:graph/inferred/ruleRun/{ruleRunId}> { ... }

# Historical/deprecated facts
GRAPH <seattle:graph/deprecated> { ... }
```

---

## Part 4: Validation Requirements

### SHACL Shape Requirements

1. **Membership must have member, organization, and interval**
2. **Interval must have beginning (end is optional for ongoing)**
3. **Events must have timestamp and provenance source**
4. **Claims must have rank**
5. **Evidence must have text and offsets**

### Test Data Requirements

The ontology must be tested with:

1. **Current administration** (Mayor, Deputy Mayor, senior staff)
2. **Historical administration** (previous mayors for temporal queries)
3. **Staff transitions** (someone leaving one role, taking another)
4. **Conflicting claims** (two sources with different facts)
5. **Corrections** (deprecated claims with supersession)

---

## Next Steps

1. [ ] Implement `ontologies/seattle/seattle.ttl` with full TBox
2. [ ] Implement `ontologies/seattle/shapes.ttl` with SHACL validation
3. [ ] Create `ontologies/seattle/tests/` with SPARQL test queries
4. [ ] Create `ontologies/seattle/data/` with seed data for testing
5. [ ] Validate integration with RdfBuilder service
6. [ ] Update OntologyService to load Seattle pack

---

## References

- [W3C ORG Ontology](https://www.w3.org/TR/vocab-org/)
- [OWL-Time](https://www.w3.org/TR/owl-time/)
- [PROV-O](https://www.w3.org/TR/prov-o/)
- [Web Annotation](https://www.w3.org/TR/annotation-vocab/)
- [FOAF](http://xmlns.com/foaf/spec/)
- [SKOS](https://www.w3.org/TR/skos-reference/)
- [Popolo Project](https://www.popoloproject.com/specs/)
- [UK Gov ORG Patterns](./uk_gov_org_patterns.md)
- [Popolo Alignment Notes](./popolo_alignment_notes.md)
