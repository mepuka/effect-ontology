# Remaining OWL Feature Priorities

## Completed ✅
1. ✅ **Class Expressions** (unionOf, intersectionOf, complementOf) - HIGH PRIORITY
2. ✅ **Functional Properties** - HIGH PRIORITY  
3. ✅ **Property Characteristics** (Symmetric, Transitive, InverseFunctional) - MEDIUM PRIORITY

## Remaining Priorities

### MEDIUM Priority

#### 1. Property Hierarchies (rdfs:subPropertyOf)
**Severity:** MEDIUM  
**Frequency:** Common in well-structured ontologies (30-40% of real ontologies)

**Example:**
```turtle
:homePhone rdfs:subPropertyOf :phone .
:workPhone rdfs:subPropertyOf :phone .
:phone rdfs:domain :Person ;
       rdfs:range xsd:string .
```

**Problem:** Currently `:homePhone` may not be recognized as applicable to `:Person`

**Implementation Needed:**
- Parse `rdfs:subPropertyOf` relationships
- Build property dependency graph (similar to class hierarchy)
- Inherit domains/ranges from parent properties
- Include sub-properties when parent property is expected

**Complexity:** Medium
- Need property graph structure
- Extend InheritanceService or create PropertyInheritanceService
- Property constraint inheritance through hierarchy

**Impact:** Enables correct property inheritance and domain/range propagation

---

### LOW Priority

#### 2. owl:equivalentClass / owl:equivalentProperty
**Severity:** LOW-MEDIUM  
**Frequency:** Common in ontology alignment (20% of ontologies)

**Example:**
```turtle
:Person owl:equivalentClass foaf:Person .
```

**Use Case:** Normalize multiple ontologies that describe the same concepts

**Implementation:** 
- Parse equivalence relationships
- Store bidirectional equivalence map
- Use for IRI normalization in extraction

---

#### 3. Qualified Cardinality Restrictions
**Severity:** LOW  
**Frequency:** Rare in practice (<10% of ontologies)

**Example:**
```turtle
:DogOwner rdfs:subClassOf [
  a owl:Restriction ;
  owl:onProperty :hasPet ;
  owl:minQualifiedCardinality 2 ;
  owl:onClass :Dog
] .
```

**Current:** Ignores `owl:onClass`, treats as unqualified cardinality

**Implementation:**
- Parse `owl:minQualifiedCardinality`, `owl:maxQualifiedCardinality`, `owl:qualifiedCardinality`
- Store qualified class in constraint
- Include in prompts: "at least 2 Dogs"

---

#### 4. Data Range Restrictions  
**Severity:** LOW  
**Frequency:** Rare (<5% of ontologies)

**Example:**
```turtle
:AdultAge rdfs:subClassOf [
  a owl:Restriction ;
  owl:onProperty :hasAge ;
  owl:onDataRange [
    owl:oneOf ( "18"^^xsd:integer "19"^^xsd:integer "20"^^xsd:integer )
  ]
] .
```

**Implementation:**
- Parse `owl:onDataRange` with `owl:oneOf`
- Reuse RDF list parser from union classes
- Store in `allowedValues` (already supported!)

---

#### 5. owl:inverseOf
**Severity:** LOW-MEDIUM  
**Frequency:** Occasionally useful (15% of ontologies)

**Example:**
```turtle
:hasChild owl:inverseOf :hasParent .
```

**Use Case:** Bidirectional relationship inference

**Implementation:**
- Parse `owl:inverseOf` relationships
- Store inverse property map
- Use for bidirectional extraction hints

---

## Recommendation

**Next Implementation: Property Hierarchies (rdfs:subPropertyOf)**

**Rationale:**
1. MEDIUM priority (highest remaining)
2. Common in well-structured ontologies
3. Significant impact on correctness
4. Builds on existing inheritance infrastructure

**Estimated Effort:** 2-3 hours
- Property graph construction
- Property inheritance logic
- Domain/range propagation
- 10-15 tests

**Alternative: Skip to equivalentClass/Property**
- Lower priority but simpler to implement
- Good for ontology alignment use cases
- Could be quick win before tackling property hierarchies







