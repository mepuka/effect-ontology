# MVP Competency Questions Priority List

**Date**: 2025-12-18
**Status**: Ready for Implementation
**Target**: Add P0 queries before MVP launch

## Quick Summary

**Current State**: 11 basic queries exist
**MVP Requirement**: Add 13 essential queries (P0)
**Total Gap**: 26 queries missing (13 P0, 5 P1, 8 P2)

**Impact**: Without P0 queries, timeline UX cannot validate core requirements (date-range filtering, as-of views, conflict detection, evidence linking, inference explanation).

---

## Priority 0: Essential for MVP (13 queries)

Must be implemented before MVP launch. These queries directly power timeline UX features.

### Timeline & Operational (4 queries)

| ID | Query | Timeline Feature |
|----|-------|------------------|
| **CQ-T1** | Staff announcements in date range | Timeline date-range filter |
| **CQ-T2** | System belief state on date T (as-of) | Historical snapshot view |
| **CQ-T3** | Batch diff (what changed in batch B) | Daily "knowledge commits" summary |
| **CQ-T4** | Events between dates D1-D2 | Event timeline navigation |

**UI Features Blocked Without These**:
- Timeline scrubbing by date
- "What did we know on Dec 5?" queries
- Daily batch summary cards
- Event-based timeline sorting

### Conflict & Correction (2 queries)

| ID | Query | Timeline Feature |
|----|-------|------------------|
| **CQ-C1** | Conflicting claims for subject/predicate | Conflict detection UI |
| **CQ-C2** | Corrections for entity or role | Correction timeline view |

**UI Features Blocked Without These**:
- Conflict indicators on fact cards
- Correction chain visualization
- Source disagreement highlighting

### Provenance Deep Dive (3 queries)

| ID | Query | Timeline Feature |
|----|-------|------------------|
| **CQ-P1** | Extracted vs inferred fact distinction | Asserted/inferred toggle |
| **CQ-P2** | Exact text spans for claim C | Evidence highlighting in document viewer |
| **CQ-P3** | Sources disagreeing on event timing | Temporal conflict detection |

**UI Features Blocked Without These**:
- "Show only extracted facts" filter
- Click triple → highlight evidence text
- Temporal disagreement warnings

### Entity-Centric (2 queries)

| ID | Query | Timeline Feature |
|----|-------|------------------|
| **CQ-E1** | All facts about entity E | Entity profile page |
| **CQ-E2** | Timeline of facts involving E | Entity-centric timeline view |

**UI Features Blocked Without These**:
- Entity profile pages
- "Show me everything about Brian Surratt"
- Entity drill-down navigation

### Inference Transparency (3 queries)

| ID | Query | Timeline Feature |
|----|-------|------------------|
| **CQ-I1** | Supporting facts for derived fact D | "Explain" button functionality |
| **CQ-I2** | Facts invalidated by rule update | Rule change impact view |
| **CQ-I3** | New facts from rule deployment | Backfill timeline entries |

**UI Features Blocked Without These**:
- Inference explanation panel
- Rule versioning history
- Backfill event cards in timeline

---

## Priority 1: Important (5 queries)

Enhances UX but not blockers for MVP launch. Add in Sprint 2.

| ID | Query | Purpose |
|----|-------|---------|
| **CQ-G1** | Council votes in date range | Legislative tracking |
| **CQ-B1** | Budget actions affecting department | Budget impact timeline |
| **CQ-A1** | Source count supporting fact F | Multi-source confidence |
| **CQ-Q1** | Low-confidence claims (<0.7) | Quality review queue |
| **CQ-Q2** | Unresolved entity mentions | Entity linking improvements |

---

## Priority 2: Nice-to-Have (8 queries)

Advanced features for post-MVP. Defer to Month 2+.

**Timeline Analytics**:
- CQ-T5: Claim frequency heatmap
- CQ-T6: Most active days for announcements
- CQ-T7: Pipeline velocity metrics

**Advanced Provenance**:
- CQ-P4: Extraction pipeline version for claim
- CQ-P5: Claims from specific extractor model

**Entity Resolution**:
- CQ-ER1: Entity merge/split history
- CQ-ER2: Entity aliases and labels
- CQ-ER3: Potential duplicate entities

---

## Implementation Plan

### Week 1: Add P0 Queries to Test Suite

**File**: `ontologies/seattle/tests/competency-questions.sparql`

**Add 13 queries** with this structure:
```sparql
# -----------------------------------------------------------------------------
# CQ-T1: Staff announcement events in date range
# Expected: Returns announcements within specified date window
# Timeline Feature: Date-range filter for timeline navigation
# -----------------------------------------------------------------------------

# TEST: CQ-T1
PREFIX seattle: <http://effect-ontology.dev/seattle/>
PREFIX time: <http://www.w3.org/2006/time#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX org: <http://www.w3.org/ns/org#>

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

**Validation**:
- [ ] All 13 queries added
- [ ] SPARQL syntax validated
- [ ] Each query has comment explaining expected results
- [ ] Each query linked to timeline feature

### Week 2: Create Test Data Fixture

**File**: `ontologies/seattle/tests/data/mvp-test-data.ttl`

**Required Test Data**:
- 2 people with overlapping roles (conflict test)
- 3 staff announcement events (Dec 1, Dec 5, Dec 10)
- 1 correction article (Dec 15)
- 5 asserted claims with evidence spans
- 3 inferred claims with rule provenance
- 1 batch/ingestion event

**Validation**:
- [ ] All 13 P0 queries return non-empty results
- [ ] Test data exercises all query filters
- [ ] Temporal data spans multiple dates

### Week 3: Implement Query Service

**File**: `packages/@core-v2/src/Service/TimelineQueryService.ts`

**Service Interface**:
```typescript
export class TimelineQueryService extends Effect.Service<TimelineQueryService>()(
  "TimelineQueryService",
  {
    effect: Effect.gen(function* () {
      const sparql = yield* SPARQLService

      return {
        // Timeline queries
        getEventsInDateRange: (start: Date, end: Date) => Effect<Event[]>,
        getSystemBeliefOnDate: (date: Date) => Effect<Claim[]>,
        getBatchDiff: (batchId: string) => Effect<BatchDiff>,

        // Conflict queries
        getConflictingClaims: (subject: string, predicate: string) => Effect<Conflict[]>,
        getCorrectionsForEntity: (entityId: string) => Effect<Correction[]>,

        // Provenance queries
        getExtractedVsInferred: () => Effect<{ extracted: Claim[], inferred: Claim[] }>,
        getEvidenceForClaim: (claimId: string) => Effect<Evidence[]>,

        // Entity queries
        getEntityFacts: (entityId: string) => Effect<Claim[]>,
        getEntityTimeline: (entityId: string) => Effect<TimelineEntry[]>,

        // Inference queries
        getInferenceExplanation: (derivedFactId: string) => Effect<Explanation>,
        getRuleUpdateImpact: (ruleId: string) => Effect<RuleImpact>
      }
    }),
    dependencies: [SPARQLService.Default],
    accessors: true
  }
) {}
```

**Validation**:
- [ ] All 13 methods implemented
- [ ] Each method tested with mvp-test-data.ttl
- [ ] Type-safe return types
- [ ] Error handling for empty results

### Week 4: Wire into HTTP API

**File**: `packages/@core-v2/src/Runtime/Http.ts`

**API Endpoints**:
```typescript
// Timeline endpoints
GET /api/timeline/events?start=2025-12-01&end=2025-12-15
GET /api/timeline/snapshot?date=2025-12-05
GET /api/timeline/batch/:batchId/diff

// Conflict endpoints
GET /api/conflicts?subject=:entityId&predicate=:pred
GET /api/corrections?entity=:entityId

// Entity endpoints
GET /api/entity/:id/facts
GET /api/entity/:id/timeline

// Inference endpoints
GET /api/inference/:id/explain
GET /api/rule/:id/impact
```

**Validation**:
- [ ] All endpoints return JSON
- [ ] Query parameters properly parsed
- [ ] Errors return 4xx/5xx with messages

---

## Test Validation Matrix

| Query | Test Data Required | Expected Result Count | Validated |
|-------|-------------------|----------------------|-----------|
| CQ-T1 | 3 events in date range | 3 | ☐ |
| CQ-T2 | Claims with timestamps | 5+ | ☐ |
| CQ-T3 | Batch with claims | 5+ | ☐ |
| CQ-T4 | Events across dates | 3+ | ☐ |
| CQ-C1 | 2 conflicting claims | 1 conflict | ☐ |
| CQ-C2 | 1 correction | 1 correction | ☐ |
| CQ-P1 | Mixed asserted/inferred | 8+ (5 asserted, 3 inferred) | ☐ |
| CQ-P2 | Claims with evidence | 3+ evidence spans | ☐ |
| CQ-P3 | Temporal conflicts | 1+ disagreement | ☐ |
| CQ-E1 | Entity with facts | 5+ facts | ☐ |
| CQ-E2 | Entity timeline | 3+ timeline entries | ☐ |
| CQ-I1 | Inferred claim | 1+ supporting facts | ☐ |
| CQ-I2 | Rule update | 2+ invalidated facts | ☐ |
| CQ-I3 | Rule deployment | 3+ new facts | ☐ |

---

## Success Criteria

**MVP Launch Checklist**:
- [ ] All 13 P0 queries added to competency-questions.sparql
- [ ] Test data validates all queries (non-empty results)
- [ ] TimelineQueryService implements all 13 methods
- [ ] HTTP API exposes all queries as endpoints
- [ ] Frontend can call all endpoints successfully
- [ ] Documentation updated with query examples

**Post-MVP (Sprint 2)**:
- [ ] 5 P1 queries added and tested
- [ ] Advanced filters implemented (confidence, source type)

**Month 2+**:
- [ ] 8 P2 queries added for analytics

---

## SPARQL Query Templates

For quick copy-paste when implementing queries:

### Date Range Filter Template
```sparql
FILTER (?timestamp >= "{START_DATE}"^^xsd:dateTime &&
        ?timestamp <= "{END_DATE}"^^xsd:dateTime)
```

### As-Of Query Template
```sparql
# Asserted before date T
FILTER (?assertedAt <= "{AS_OF_DATE}"^^xsd:dateTime)

# Not invalidated before date T
FILTER NOT EXISTS {
  ?claim prov:invalidatedAtTime ?invalidatedAt .
  FILTER (?invalidatedAt <= "{AS_OF_DATE}"^^xsd:dateTime)
}
```

### Conflict Detection Template
```sparql
# Same subject/predicate, different objects
?claim1 claims:claimSubject ?subject ;
        claims:claimPredicate ?predicate ;
        claims:claimObject ?object1 .

?claim2 claims:claimSubject ?subject ;
        claims:claimPredicate ?predicate ;
        claims:claimObject ?object2 .

FILTER (?object1 != ?object2)
FILTER (?claim1 != ?claim2)
```

### Inference Chain Template
```sparql
?derivedFact a claims:DerivedAssertion ;
             prov:wasGeneratedBy ?activity .

?activity a seattle:ReasoningActivity ;
          seattle:appliedRule ?rule ;
          prov:used ?supportingFact .
```

---

## Resources

**Full Analysis**: See [COMPETENCY_QUESTIONS_GAP_ANALYSIS.md](./COMPETENCY_QUESTIONS_GAP_ANALYSIS.md) for:
- Detailed SPARQL sketches for all 26 queries
- UX feature mapping
- Test data requirements
- Phase-by-phase implementation guidance

**Related Docs**:
- `/ontologies/seattle/ONTOLOGY_DESIGN.md` - Ontology structure
- `/packages/@core-v2/docs/mvp/mvp_discussion_research_case_study.md` - MVP UX requirements
- `/packages/@core-v2/docs/ontology_research/temporal_conflicting_claims_research.md` - Temporal modeling

**Current Queries**: `/ontologies/seattle/tests/competency-questions.sparql`

---

**Next Action**: Copy 13 P0 queries from gap analysis into competency-questions.sparql with proper formatting and comments.
