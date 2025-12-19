# Competency Questions Gap Analysis for MVP Timeline

**Date**: 2025-12-18
**Context**: Seattle Mayor Timeline Knowledge Graph MVP
**Purpose**: Identify missing competency questions needed for MVP timeline UX

## Executive Summary

Current competency questions in `/ontologies/seattle/tests/competency-questions.sparql` cover **basic querying** but are missing **critical timeline-specific queries** for the MVP UX. The gap analysis reveals:

- **13 essential MVP queries missing** from current test suite
- **5 important trust/provenance queries missing**
- **8 operational/timeline queries missing**

**Priority**: Add 13 essential queries before MVP launch to validate timeline UX requirements.

---

## 1. Current Coverage Analysis

### What We Have (11 queries)

**Administration/Staffing (4 queries):**
- ✅ CQ-A1: Who is mayor at time T?
- ✅ CQ-A2: Senior staff announcements with sources
- ✅ CQ-A3: Roles held by Person X with announcement dates
- ✅ CQ-A4: Mayor-elect (pending mayors)

**Departments/Governance (1 query):**
- ✅ CQ-B1: Departments and current leaders

**Policy/Initiatives (1 query):**
- ✅ CQ-C1: Mayor's policy initiatives

**Trust/Provenance (3 queries):**
- ✅ CQ-D1: Source documents for facts
- ✅ CQ-D2: Evidence text spans with offsets
- ✅ CQ-D3: Extraction confidence scores

**Reasoning/Inference (2 queries):**
- ✅ CQ-E1: Inferred facts produced today
- ✅ CQ-E2: Which rule produced inference and why

**Validation (3 queries):**
- ✅ VAL-1: Find invalid memberships (no intervals)
- ✅ VAL-2: Find invalid claims (no rank)
- ✅ VAL-3: Find invalid evidence (no text)

### What We're Missing (26 queries)

Missing queries organized by MVP priority.

---

## 2. Essential MVP Gaps (13 queries - P0)

These queries are **critical for timeline UX** and must be added before MVP launch.

### Timeline & Operational Queries

#### **CQ-T1: Staff announcement events in date range**
**User Story**: "Show me all staff announcements from Dec 1-15, 2025"

**Why Essential**: Core timeline filtering requirement. Users need date-range filtering for timeline navigation.

**SPARQL Sketch**:
```sparql
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?event ?membership ?announcedDate ?person ?role ?source
WHERE {
  ?event a seattle:StaffAnnouncementEvent ;
         seattle:announcedMembership ?membership ;
         time:inXSDDateTime ?announcedDate ;
         prov:wasDerivedFrom ?source .

  ?membership org:member ?person ;
              org:post ?post .  # W3C ORG: org:post links Membership→Post

  FILTER (?announcedDate >= "2025-12-01T00:00:00Z"^^xsd:dateTime &&
          ?announcedDate <= "2025-12-15T23:59:59Z"^^xsd:dateTime)
}
ORDER BY ?announcedDate
```

#### **CQ-T2: What did the system believe on date T? (as-of view)**
**User Story**: "Show me what we knew about the mayor's staff on Dec 5, 2025"

**Why Essential**: Bitemporal querying for "timeline snapshots". Users need to see historical belief state.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?claim ?subject ?predicate ?object ?rank
WHERE {
  ?claim a claims:Claim ;
         claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:rank ?rank ;
         prov:generatedAtTime ?assertedAt .

  # Claimed before date T
  FILTER (?assertedAt <= "2025-12-05T23:59:59Z"^^xsd:dateTime)

  # Not invalidated before date T
  FILTER NOT EXISTS {
    ?claim prov:invalidatedAtTime ?invalidatedAt .
    FILTER (?invalidatedAt <= "2025-12-05T23:59:59Z"^^xsd:dateTime)
  }
}
```

#### **CQ-T3: What changed in batch B? (batch diff)**
**User Story**: "Show me what changed in today's ingestion batch"

**Why Essential**: Core "knowledge commits" UX. Users need to see daily deltas.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?claim ?subject ?predicate ?object ?confidence
WHERE {
  ?claim a claims:Claim ;
         claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:confidence ?confidence ;
         prov:wasGeneratedBy ?activity .

  ?activity a prov:Activity ;
            prov:startedAtTime ?batchTime .

  # Filter by batch date
  FILTER (?batchTime >= "2025-12-18T00:00:00Z"^^xsd:dateTime &&
          ?batchTime < "2025-12-19T00:00:00Z"^^xsd:dateTime)
}
```

#### **CQ-T4: Which events occurred between dates D1 and D2? (event timeline)**
**User Story**: "Show me all events (announcements, votes, budget actions) from Nov to Dec 2025"

**Why Essential**: Timeline navigation requires filtering by event time, not just knowledge time.

**SPARQL Sketch**:
```sparql
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?event ?eventType ?eventDate ?source
WHERE {
  ?event time:inXSDDateTime ?eventDate ;
         prov:wasDerivedFrom ?source .

  # Event can be any type of Seattle activity
  ?event a ?eventType .
  FILTER (?eventType IN (
    seattle:StaffAnnouncementEvent,
    seattle:PolicyInitiativeEvent,
    seattle:BudgetActionEvent,
    seattle:CouncilVoteEvent
  ))

  FILTER (?eventDate >= "2025-11-01T00:00:00Z"^^xsd:dateTime &&
          ?eventDate <= "2025-12-31T23:59:59Z"^^xsd:dateTime)
}
ORDER BY ?eventDate
```

### Conflict & Correction Queries

#### **CQ-C1: Which claims conflict for same subject/predicate?**
**User Story**: "Show me conflicting claims about who holds the Deputy Mayor role"

**Why Essential**: Conflict detection is core to news timeline UX. Users need to see when sources disagree.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?subject ?predicate ?object1 ?object2 ?source1 ?source2
WHERE {
  ?claim1 a claims:Claim ;
          claims:claimSubject ?subject ;
          claims:claimPredicate ?predicate ;
          claims:claimObject ?object1 ;
          claims:statedIn ?source1 ;
          claims:rank ?rank1 .

  ?claim2 a claims:Claim ;
          claims:claimSubject ?subject ;
          claims:claimPredicate ?predicate ;
          claims:claimObject ?object2 ;
          claims:statedIn ?source2 ;
          claims:rank ?rank2 .

  # Different objects, different sources, both not deprecated
  FILTER (?object1 != ?object2)
  FILTER (?source1 != ?source2)
  FILTER (?rank1 != claims:Deprecated)
  FILTER (?rank2 != claims:Deprecated)
}
```

#### **CQ-C2: What corrections exist for Person X or Role Y?**
**User Story**: "Show me all corrections related to Tim Burgess or the Deputy Mayor role"

**Why Essential**: Correction timeline is critical for trust/transparency in news KG.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?originalClaim ?correctedClaim ?correctionDate ?reason
WHERE {
  ?originalClaim claims:claimSubject :TimBurgess ;
                 claims:rank claims:Deprecated ;
                 prov:invalidatedAtTime ?correctionDate .

  ?correctedClaim prov:wasRevisionOf ?originalClaim .

  OPTIONAL {
    ?originalClaim claims:deprecationReason ?reason .
  }
}
ORDER BY ?correctionDate
```

### Provenance Deep Dive Queries

#### **CQ-P1: Which claims are directly extracted vs inferred?**
**User Story**: "Show me which facts were extracted from documents vs derived by rules"

**Why Essential**: Transparency requirement - users need to distinguish asserted vs inferred facts.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?claim ?subject ?predicate ?object ?claimType
WHERE {
  ?claim claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object .

  BIND(
    IF(EXISTS { ?claim a claims:DerivedAssertion },
       "inferred",
       "extracted"
    ) AS ?claimType
  )
}
```

#### **CQ-P2: For claim C, what exact text spans support it?**
**User Story**: "Show me the exact sentences from the article that support this appointment claim"

**Why Essential**: Evidence highlighting in document viewer requires text span → claim linking.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?evidenceText ?startOffset ?endOffset ?source
WHERE {
  BIND(:claim123 AS ?claim)

  ?claim claims:hasEvidence ?evidence .

  ?evidence claims:evidenceText ?evidenceText ;
            claims:startOffset ?startOffset ;
            claims:endOffset ?endOffset ;
            claims:evidenceSource ?source .
}
ORDER BY ?startOffset
```

#### **CQ-P3: Which sources disagree on event timing?**
**User Story**: "Show me sources that report different dates for the same appointment"

**Why Essential**: Temporal conflicts are common in news - need to surface for review.

**SPARQL Sketch**:
```sparql
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?person ?post ?date1 ?date2 ?source1 ?source2
WHERE {
  # Find memberships with same person/post but different start dates
  ?membership1 org:member ?person ;
               org:post ?post ;  # W3C ORG: org:post links Membership→Post
               org:memberDuring ?interval1 ;
               prov:wasDerivedFrom ?source1 .

  ?membership2 org:member ?person ;
               org:post ?post ;  # W3C ORG: org:post links Membership→Post
               org:memberDuring ?interval2 ;
               prov:wasDerivedFrom ?source2 .

  ?interval1 time:hasBeginning/time:inXSDDate ?date1 .
  ?interval2 time:hasBeginning/time:inXSDDate ?date2 .

  FILTER (?date1 != ?date2)
  FILTER (?source1 != ?source2)
  FILTER (?membership1 != ?membership2)
}
```

### Entity-Centric Drill-Down Queries

#### **CQ-E1: Show me everything about Entity E (entity profile)**
**User Story**: "Show me all facts involving Brian Surratt"

**Why Essential**: Entity profile pages require comprehensive fact aggregation.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?predicate ?object ?source ?confidence
WHERE {
  BIND(:BrianSurratt AS ?entity)

  ?claim claims:claimSubject ?entity ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:statedIn ?source ;
         claims:confidence ?confidence ;
         claims:rank ?rank .

  # Only accepted claims
  FILTER (?rank != claims:Deprecated)
}
```

#### **CQ-E2: Timeline of facts involving Entity E**
**User Story**: "Show me the timeline of all changes related to the City Budget Office"

**Why Essential**: Entity-centric timeline navigation for drill-down.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?claim ?predicate ?object ?timestamp ?source
WHERE {
  BIND(:CityBudgetOffice AS ?entity)

  ?claim claims:claimSubject ?entity ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:statedIn ?source ;
         prov:generatedAtTime ?timestamp .
}
ORDER BY ?timestamp
```

### Inference Transparency Queries

#### **CQ-I1: For derived fact D, what were the supporting facts?**
**User Story**: "Why does the system think Brian Surratt is an ExecutiveOfficeMember?"

**Why Essential**: "Explain" button functionality requires showing inference chain.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?derivedFact ?rule ?supportingFact
WHERE {
  BIND(:derivedFact123 AS ?derivedFact)

  ?derivedFact a claims:DerivedAssertion ;
               prov:wasGeneratedBy ?activity .

  ?activity a seattle:ReasoningActivity ;
            seattle:appliedRule ?rule ;
            prov:used ?supportingFact .
}
```

#### **CQ-I2: Which facts were invalidated when rule R was updated?**
**User Story**: "What happened when we updated the Deputy Mayor inference rule?"

**Why Essential**: Rule versioning UX requires showing impact of rule changes.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?invalidatedFact ?invalidatedAt
WHERE {
  ?ruleUpdate a seattle:RuleUpdateEvent ;
              seattle:updatedRule :deputyMayorRule ;
              prov:endedAtTime ?updateTime .

  ?invalidatedFact a claims:DerivedAssertion ;
                   prov:invalidatedAtTime ?invalidatedAt .

  # Invalidated during rule update
  FILTER (?invalidatedAt >= ?updateTime &&
          ?invalidatedAt <= (?updateTime + "PT1H"^^xsd:duration))
}
```

#### **CQ-I3: What new facts were produced by recent rule deployment?**
**User Story**: "Show me what the new inference rule discovered in our existing data"

**Why Essential**: Backfill visualization in timeline UX.

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX seattle: <http://effect-ontology.dev/seattle/>

SELECT ?newFact ?subject ?predicate ?object ?derivedAt
WHERE {
  ?ruleUpdate a seattle:RuleUpdateEvent ;
              seattle:updatedRule :newRule ;
              prov:endedAtTime ?ruleDeployTime .

  ?newFact a claims:DerivedAssertion ;
           claims:claimSubject ?subject ;
           claims:claimPredicate ?predicate ;
           claims:claimObject ?object ;
           prov:generatedAtTime ?derivedAt .

  # Generated shortly after rule deployment (backfill window)
  FILTER (?derivedAt >= ?ruleDeployTime &&
          ?derivedAt <= (?ruleDeployTime + "PT24H"^^xsd:duration))
}
ORDER BY ?derivedAt
```

---

## 3. Important Gaps (5 queries - P1)

These queries enhance UX but are not blockers for MVP launch.

### Governance & Boards

#### **CQ-G1: Council votes on legislation in date range**
**User Story**: "Show me all City Council votes in December 2025"

**SPARQL Sketch**:
```sparql
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>

SELECT ?vote ?legislation ?voteDate ?outcome
WHERE {
  ?vote a seattle:CouncilVoteEvent ;
        seattle:onLegislation ?legislation ;
        time:inXSDDateTime ?voteDate ;
        seattle:voteOutcome ?outcome .

  FILTER (?voteDate >= "2025-12-01T00:00:00Z"^^xsd:dateTime &&
          ?voteDate <= "2025-12-31T23:59:59Z"^^xsd:dateTime)
}
ORDER BY ?voteDate
```

### Budget & Spending

#### **CQ-B1: Budget actions affecting department D**
**User Story**: "Show me all budget changes for the Transportation Department"

**SPARQL Sketch**:
```sparql
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?action ?actionTitle ?date ?impactType
WHERE {
  ?event a seattle:BudgetActionEvent ;
         skos:prefLabel ?actionTitle ;
         time:inXSDDateTime ?date ;
         seattle:impacts :TransportationDept ;
         seattle:budgetImpactType ?impactType .
}
ORDER BY DESC(?date)
```

### Cross-Source Aggregation

#### **CQ-A1: How many sources support fact F?**
**User Story**: "How many news articles confirm that Brian Surratt is Deputy Mayor?"

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?subject ?predicate ?object (COUNT(DISTINCT ?source) AS ?sourceCount)
WHERE {
  ?claim claims:claimSubject :BrianSurratt ;
         claims:claimPredicate :hasPosition ;
         claims:claimObject :DeputyMayor ;
         claims:statedIn ?source ;
         claims:rank ?rank .

  # Only accepted claims
  FILTER (?rank != claims:Deprecated)
}
GROUP BY ?subject ?predicate ?object
```

### Confidence & Quality

#### **CQ-Q1: Low-confidence claims requiring review**
**User Story**: "Show me all low-confidence extractions below 0.7"

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?claim ?subject ?predicate ?object ?confidence ?source
WHERE {
  ?claim claims:claimSubject ?subject ;
         claims:claimPredicate ?predicate ;
         claims:claimObject ?object ;
         claims:confidence ?confidence ;
         claims:statedIn ?source ;
         claims:rank ?rank .

  FILTER (?confidence < 0.7)
  FILTER (?rank != claims:Deprecated)
}
ORDER BY ?confidence
```

#### **CQ-Q2: Unresolved entity mentions**
**User Story**: "Show me entity mentions that couldn't be linked to known entities"

**SPARQL Sketch**:
```sparql
PREFIX claims: <http://effect-ontology.dev/claims#>

SELECT ?mention ?mentionText ?confidence ?source
WHERE {
  ?mention a claims:UnresolvedEntityMention ;
           claims:mentionText ?mentionText ;
           claims:linkingConfidence ?confidence ;
           claims:extractedFrom ?source .
}
ORDER BY DESC(?confidence)
```

---

## 4. Nice-to-Have Gaps (8 queries - P2)

These queries are valuable for advanced UX but can be deferred post-MVP.

### Advanced Timeline Features

- **CQ-T5**: Show me claim frequency over time (heatmap data)
- **CQ-T6**: What are the most active days for staff announcements?
- **CQ-T7**: Show me extraction pipeline velocity (docs/day, facts/day)

### Advanced Provenance

- **CQ-P4**: Which extraction pipeline version produced claim C?
- **CQ-P5**: Show me all claims from extractor model M

### Entity Resolution

- **CQ-ER1**: Which entities were merged/split in entity resolution?
- **CQ-ER2**: Show me entity aliases and preferred labels
- **CQ-ER3**: Find potential duplicate entities (similar names, different IRIs)

---

## 5. Coverage Summary

| Category | Current | Essential (P0) | Important (P1) | Nice-to-Have (P2) | Total |
|----------|---------|----------------|----------------|-------------------|-------|
| **Timeline & Operational** | 0 | 4 | 0 | 3 | 7 |
| **Conflict & Correction** | 0 | 2 | 0 | 0 | 2 |
| **Provenance Deep Dive** | 3 | 3 | 2 | 2 | 10 |
| **Entity-Centric** | 0 | 2 | 0 | 3 | 5 |
| **Inference Transparency** | 2 | 3 | 0 | 0 | 5 |
| **Governance** | 1 | 0 | 1 | 0 | 2 |
| **Budget** | 0 | 0 | 1 | 0 | 1 |
| **Aggregation** | 0 | 0 | 1 | 0 | 1 |
| **Quality** | 1 | 0 | 2 | 0 | 3 |
| **TOTAL** | **11** | **13** | **5** | **8** | **37** |

**MVP Requirement**: Add 13 essential (P0) queries before launch.

---

## 6. Implementation Recommendations

### Phase 1: MVP Essentials (Weeks 1-2)

**Priority Order**:
1. **Timeline queries (CQ-T1-T4)** - Core navigation UX
2. **Conflict queries (CQ-C1-C2)** - Trust & transparency
3. **Provenance queries (CQ-P1-P3)** - Evidence linking
4. **Entity queries (CQ-E1-E2)** - Drill-down UX
5. **Inference queries (CQ-I1-I3)** - Explain functionality

**Testing Strategy**:
- Create test data covering all 13 essential queries
- Validate SPARQL syntax against Seattle ontology
- Ensure queries return non-empty results on test data

### Phase 2: Important Additions (Week 3)

Add P1 queries for enhanced UX:
- Governance queries (CQ-G1)
- Budget queries (CQ-B1)
- Aggregation queries (CQ-A1)
- Quality queries (CQ-Q1-Q2)

### Phase 3: Post-MVP (Month 2+)

Add P2 queries for advanced features:
- Timeline analytics
- Pipeline monitoring
- Entity resolution insights

---

## 7. Test Data Requirements

To validate all 13 essential queries, test data must include:

### Required Entities
- **2+ people** with overlapping roles (to test conflicts)
- **1 department** with leader changes (to test transitions)
- **3+ news articles** covering same event (to test multi-source)
- **1 correction article** (to test retraction flow)

### Required Events
- **StaffAnnouncementEvent** (at least 3 across 2 weeks)
- **PolicyInitiativeEvent** (at least 1)
- **CouncilVoteEvent** (optional for P1)

### Required Temporal Data
- Events with **different publication dates** (for date-range queries)
- Events with **different event dates vs knowledge dates** (for bitemporal queries)
- Claims with **invalidation timestamps** (for correction queries)

### Required Provenance Data
- Claims with **evidence text spans** (offsets)
- Claims with **confidence scores** (range 0.5-0.99)
- Claims with **rank** (Preferred/Normal/Deprecated)
- Claims with **inferred vs extracted** distinction

### Required Inference Data
- **DerivedAssertion** instances with rule provenance
- **ReasoningActivity** instances with supporting facts
- **RuleUpdateEvent** instances (for backfill queries)

---

## 8. Next Steps

### Immediate Actions (This Week)

1. **Add 13 essential queries to competency-questions.sparql**
   - Format: Same structure as existing queries (PREFIX blocks + SELECT)
   - Include: Query comment explaining expected results
   - Test: Validate SPARQL syntax

2. **Create test data fixture**
   - File: `ontologies/seattle/tests/data/mvp-test-data.ttl`
   - Content: Minimal data covering all 13 essential queries
   - Validate: Run all queries against test data

3. **Document query → UX mapping**
   - Create matrix: "Which query powers which timeline UI feature"
   - Identify any UX features without supporting queries

### Short-Term Actions (Next 2 Weeks)

4. **Implement query API endpoints**
   - Service: TimelineQueryService with 13 essential query methods
   - Integration: Wire into HTTP API for frontend consumption

5. **Add P1 queries**
   - 5 important queries for enhanced UX
   - Test data extensions

### Medium-Term Actions (Month 2)

6. **Performance testing**
   - Benchmark all 18 queries (P0+P1) on realistic data volume
   - Optimize slow queries (add indexes, materialize views)

7. **Add P2 queries**
   - 8 nice-to-have queries for advanced features

---

## 9. References

- **Code Review**: Comprehensive competency questions list (2025-12-18)
- **ONTOLOGY_DESIGN.md**: Current ontology with competency questions
- **mvp_discussion_research_case_study.md**: MVP timeline UX requirements
- **temporal_conflicting_claims_research.md**: Conflict/correction patterns
- **competency-questions.sparql**: Current test query suite

---

**Document Status**: Draft
**Action Required**: Review with team, prioritize query implementation order
**Target Completion**: Add P0 queries by end of week, P1 queries by end of Sprint 1
