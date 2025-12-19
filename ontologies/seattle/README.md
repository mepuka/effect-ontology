# Seattle Ontology Pack

Production ontology pack for the Seattle mayor administration case study, demonstrating the Effect Ontology platform/pack architecture.

## Overview

This ontology pack provides the domain-specific vocabulary for extracting and querying knowledge about Seattle city government, including:

- Mayor and senior staff appointments
- Organizational structure (departments, offices, boards)
- Policy initiatives and budget actions
- Council votes and governance

## Design Philosophy

**Reuse > Reinvent**: 95%+ of vocabulary comes from W3C standards:

| Vocabulary | Purpose | Spec |
|------------|---------|------|
| FOAF | Persons | http://xmlns.com/foaf/spec/ |
| W3C ORG | Organizations, posts, memberships | https://www.w3.org/TR/vocab-org/ |
| OWL-Time | Temporal intervals | https://www.w3.org/TR/owl-time/ |
| PROV-O | Provenance | https://www.w3.org/TR/prov-o/ |
| Web Annotation | Evidence text spans | https://www.w3.org/TR/annotation-vocab/ |
| SKOS | Controlled vocabularies | https://www.w3.org/TR/skos-reference/ |

## Files

```
ontologies/seattle/
├── README.md                 # This file
├── ONTOLOGY_DESIGN.md        # Full design doc with competency questions
├── seattle.ttl               # Main TBox ontology
├── shapes.ttl                # SHACL validation shapes
└── tests/
    └── competency-questions.sparql  # SPARQL test queries
```

## Namespace Prefixes

```turtle
@prefix seattle: <http://effect-ontology.dev/seattle/> .
@prefix claims: <http://effect-ontology.dev/claims#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix org: <http://www.w3.org/ns/org#> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix oa: <http://www.w3.org/ns/oa#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
```

## Domain-Specific Extensions

The Seattle pack adds only these custom classes:

| Class | Extends | Purpose |
|-------|---------|---------|
| `seattle:BoardOrCommission` | `org:Organization` | Boards, commissions |
| `seattle:LeadershipPost` | `org:Post` | Department head positions |
| `seattle:StaffAnnouncementEvent` | `prov:Activity` | Staff announcements |
| `seattle:PolicyInitiativeEvent` | `prov:Activity` | Policy announcements |
| `seattle:BudgetActionEvent` | `prov:Activity` | Budget actions |
| `seattle:CouncilVoteEvent` | `prov:Activity` | Council votes |
| `seattle:ReasoningActivity` | `prov:Activity` | Inference execution |

## Key Modeling Patterns

### Person with Role

Use `foaf:Person` (not custom Person class):

```turtle
seattle:TimBurgess a foaf:Person ;
    foaf:name "Tim Burgess" .
```

### Membership with Temporal Interval

Use `org:Membership` with `org:memberDuring` and `time:Interval`:

```turtle
seattle:Membership_Burgess_Deputy a org:Membership ;
    org:member seattle:TimBurgess ;
    org:organization seattle:MayorsOffice ;
    org:role seattle:DeputyMayorPost ;
    org:memberDuring [
        a time:Interval ;
        time:hasBeginning [
            a time:Instant ;
            time:inXSDDate "2025-01-01"^^xsd:date
        ]
        # No time:hasEnd = ongoing
    ] .
```

### Staff Announcement Event

Events are `prov:Activity` with provenance:

```turtle
seattle:Event_StaffAnnouncement_20251203 a seattle:StaffAnnouncementEvent ;
    seattle:announcedMembership seattle:Membership_Burgess_Deputy ;
    time:inXSDDateTime "2025-12-03T10:00:00-08:00"^^xsd:dateTime ;
    prov:wasDerivedFrom seattle:Doc_PressRelease_20251203 .
```

### Claims with Evidence

Use `claims:Claim` from `claims.ttl`:

```turtle
seattle:Claim_123 a claims:Claim ;
    claims:claimSubject seattle:TimBurgess ;
    claims:claimPredicate org:holds ;
    claims:claimObject seattle:DeputyMayorPost ;
    claims:rank claims:Preferred ;
    claims:confidence 0.95 ;
    claims:statedIn seattle:Doc_PressRelease_20251203 ;
    claims:hasEvidence seattle:Evidence_123 .

seattle:Evidence_123 a claims:Evidence ;
    claims:evidenceText "Tim Burgess will serve as Deputy Mayor" ;
    claims:startOffset 245 ;
    claims:endOffset 287 ;
    claims:evidenceSource seattle:Doc_PressRelease_20251203 .
```

## Competency Questions

The ontology is designed to answer these questions (see `tests/competency-questions.sparql`):

### Administration/Staffing
- Who is the mayor at time T?
- What senior staff has been announced, with roles and sources?
- What roles does Person X hold and when?

### Departments/Governance
- What departments exist and who leads them?
- What boards/commissions exist?

### Policy/Initiatives
- What initiatives did the mayor announce?
- What budget actions happened?

### Trust/Provenance
- What document(s) support this fact?
- What exact text spans are evidence?
- What is the extraction confidence?

### Reasoning
- Which inferred facts were produced today?
- Which rule produced an inference?

## SHACL Validation

Validate data against `shapes.ttl`:

```bash
# Using Apache Jena SHACL
shacl validate --shapes shapes.ttl --data your-data.ttl
```

Key constraints:
- Memberships must have member, organization, role, and interval
- Intervals must have beginning (end optional for ongoing)
- Events must have timestamp and provenance
- Claims must have rank and source
- Evidence must have text and offsets

## Integration

### With Existing Claims Ontology

The Seattle pack imports `claims.ttl`:

```turtle
owl:imports <http://effect-ontology.dev/claims> .
```

All claims use the existing claims vocabulary for ranks, provenance, and evidence.

### With Extraction Pipeline

Configure `ConfigService.ontology.path` to point to `seattle.ttl`.

### Named Graph Partitioning

```
GRAPH seattle:graph/asserted/current    # Extracted facts
GRAPH seattle:graph/inferred/current    # Inferred facts
GRAPH seattle:graph/deprecated          # Historical facts
```

## References

- [W3C ORG Ontology](https://www.w3.org/TR/vocab-org/)
- [OWL-Time](https://www.w3.org/TR/owl-time/)
- [PROV-O](https://www.w3.org/TR/prov-o/)
- [Popolo Project](https://www.popoloproject.com/specs/)
- [Popolo Alignment Notes](../docs/mvp/popolo_alignment_notes.md)
- [UK Gov ORG Patterns](../docs/mvp/uk_gov_org_patterns.md)
- [Full Design Document](./ONTOLOGY_DESIGN.md)
