# OWL Restriction Parsing and Constraint Refinement

## Overview

The system parses OWL restrictions (blank nodes) into `PropertyConstraint` lattice elements and refines them through inheritance using the meet operation (⊓).

## Architecture

### 1. PropertyConstraint Model

**Location:** `packages/core/src/Graph/Constraint.ts`

PropertyConstraint is a bounded meet-semilattice element with:
- **ranges**: Array of allowed class IRIs (intersection semantics)
- **minCardinality / maxCardinality**: Interval constraints
- **allowedValues**: Specific value constraints (owl:hasValue)
- **source**: Origin of constraint (domain | restriction | refined)

**Lattice Properties:**
- ⊤ (Top): Unconstrained property
- ⊥ (Bottom): Unsatisfiable constraint (e.g., minCard > maxCard)
- ⊓ (Meet): Greatest lower bound (stricter constraint)

### 2. Restriction Parsing

**Location:** `packages/core/src/Graph/Builder.ts:parseRestriction`

Parses OWL restriction blank nodes:

| OWL Construct | Constraint Effect |
|---------------|------------------|
| `owl:someValuesFrom C` | ranges += [C], minCardinality = 1 |
| `owl:allValuesFrom C` | ranges += [C] |
| `owl:minCardinality n` | minCardinality = n |
| `owl:maxCardinality n` | maxCardinality = n |
| `owl:cardinality n` | minCardinality = n, maxCardinality = n |
| `owl:hasValue v` | allowedValues += [v], cardinality = 1 |

**Process:**
1. Detect blank node in `rdfs:subClassOf` triple
2. Verify `rdf:type owl:Restriction`
3. Extract `owl:onProperty` (required)
4. Parse restriction type and value
5. Build `PropertyConstraint` with `source="restriction"`

### 3. Constraint Refinement

**Location:** `packages/core/src/Services/Inheritance.ts:getEffectivePropertiesImpl`

**Old Behavior (Override):**
```typescript
for (const prop of ancestorProperties) {
  propertyMap.set(prop.iri, prop)  // Last-write-wins
}
```

**New Behavior (Meet-based Fold):**
```typescript
for (const prop of ownProperties) {
  const existing = propertyMap.get(prop.propertyIri)
  if (existing) {
    const refined = meet(existing, prop)  // Lattice meet
    propertyMap.set(prop.propertyIri, refined)
  }
}
```

**Meet Operation:**
- Combines constraints from multiple inheritance paths
- Uses `InheritanceService.isSubclass` for semantic range reasoning
- Uses `InheritanceService.areDisjoint` for disjointness checking
- Returns `source="refined"` to indicate meet was applied

### 4. Example

```turtle
:Person a owl:Class ;
  :hasPet rdfs:domain :Person ;
           rdfs:range :Animal .

:PetOwner rdfs:subClassOf :Person ;
  rdfs:subClassOf [
    owl:onProperty :hasPet ;
    owl:minCardinality 1
  ] .

:DogOwner rdfs:subClassOf :PetOwner ;
  rdfs:subClassOf [
    owl:onProperty :hasPet ;
    owl:someValuesFrom :Dog
  ] .
```

**Constraint Evolution:**

| Class | hasPet Constraint | Derivation |
|-------|------------------|------------|
| Person | range=[Animal], minCard=0 | Domain property |
| PetOwner | range=[Animal], minCard=1 | meet(Person.hasPet, restriction) |
| DogOwner | range=[Dog], minCard=1 | meet(PetOwner.hasPet, restriction) |

## Key Design Decisions

### Why Extract PropertyConstraint to Graph Layer?

**Problem:** Circular dependency:
- Graph/Types → Ontology/Constraint → Services/Inheritance → Graph/Types

**Solution:** Extract `PropertyConstraint` to `Graph/Constraint.ts`:
- Graph/Types imports Graph/Constraint ✓
- Ontology/Constraint re-exports PropertyConstraint ✓
- Services/Inheritance imports Graph/Constraint ✓

### Why Refactor to PropertyConstraint Instead of PropertyData?

**PropertyData (Old):**
- Simple struct: `{ iri, label, range }`
- No cardinality or value constraints
- Can't represent restrictions

**PropertyConstraint (New):**
- Lattice element with meet operation
- Supports full OWL restriction semantics
- Single source of truth for all property constraints

### Why Use Meet Instead of Override?

**Override (Last-Write-Wins):**
- Child constraint replaces parent
- Loses information from parent
- Incorrect for multiple inheritance

**Meet (Lattice Fold):**
- Combines constraints correctly
- Preserves information from all paths
- Mathematically sound (associative, commutative)

## Testing

**Unit Tests:**
- `Constraint.property.test.ts`: Lattice laws (1000+ randomized cases)
- `RestrictionParser.test.ts`: Restriction parsing
- `InheritanceRefinement.test.ts`: Constraint refinement

**Integration Tests:**
- `RestrictionInheritance.test.ts`: Full pipeline (parse → inherit → refine)

## Future Extensions

1. **Qualified Cardinality Restrictions:**
   - `owl:qualifiedCardinality` (e.g., "exactly 2 dogs")

2. **Property Chains:**
   - `owl:propertyChainAxiom` (e.g., "uncle = parent.brother")

3. **SHACL Shape Integration:**
   - Convert `PropertyConstraint` to SHACL shapes for validation
