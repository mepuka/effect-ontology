# JSON Schema & Tool Generation Alignment Evaluation

## Executive Summary
The current JSON Schema generation (`Schema/Factory.ts`) uses a "Loose" validation strategy that ensures valid RDF structure but **does not enforce** the rich semantic constraints (cardinality, ranges, allowed values) now present in the prompts.

While this prevents direct contradictions (the schema is permissive), it misses an opportunity to guide the LLM structurally. We recommend upgrading the schema generation to use **Discriminated Unions** and **Schema Annotations** to strictly align with the new constraint-aware prompts.

## Current Status

### 1. Prompt Generation (Frontend)
- **Status:** High Fidelity (after recent updates)
- **Features:** Explicitly states constraints:
  - "hasPet: Dog (required, at least 1 value)"
  - "email: string (optional, functional)"
- **Instruction:** "Return a valid JSON object matching the schema..."

### 2. Schema Generation (Backend)
- **Status:** Low Fidelity ("Loose" Schema)
- **Structure:**
  ```typescript
  {
    "@type": ClassIRI,
    "properties": [
      {
        "predicate": PropertyIRI, // Union of ALL properties
        "object": string | { "@id": string } // Union of ALL value types
      }
    ]
  }
  ```
- **Gap:** The schema allows *any* property to take *any* value type (literal or reference) and does not enforce cardinality (min/max items).

## Alignment Analysis

| Feature | Prompt Instruction | Current Schema Validation | Alignment |
|---------|-------------------|---------------------------|-----------|
| **Vocabulary** | Uses specific IRIs | Validates IRIs | ✅ Aligned |
| **Cardinality** | "Required", "Max 1" | `S.Array` (0 to infinite) | ⚠️ Weak (Schema is too loose) |
| **Value Type** | "Dog" (Object) vs "string" (Literal) | `string | { @id: string }` | ⚠️ Weak (Allows wrong types) |
| **Allowed Values** | "red, green, blue" | `string` | ⚠️ Weak (No enum validation) |

### Risk of Contradiction
There is no *direct* contradiction (Schema doesn't forbid what Prompt requires), but the **ambiguity** in the schema allows the LLM to generate invalid data (e.g., a string value for an object property) that the Prompt explicitly warned against.

## Recommendations

### 1. Implement Discriminated Unions for Properties
Instead of a generic `{ predicate, object }` struct, generate a union of specific property shapes. This forces the LLM to use the correct value structure for each property.

**Current:**
```typescript
S.Struct({
  predicate: S.Union("hasPet", "name"),
  object: S.Union(S.String, S.Struct({ "@id": S.String }))
})
```

**Proposed:**
```typescript
S.Union(
  // Object Property
  S.Struct({
    predicate: S.Literal("hasPet"),
    object: S.Struct({ "@id": S.String })
  }),
  // Datatype Property
  S.Struct({
    predicate: S.Literal("name"),
    object: S.String
  })
)
```

### 2. Add Schema Annotations
Inject the same constraint descriptions used in the prompt into the JSON Schema `description` fields. This reinforces the instructions at the structural level.

```typescript
S.Struct({
  predicate: S.Literal("hasPet"),
  object: S.Struct({ "@id": S.String })
}).annotations({
  description: "Dog (required, at least 1 value)" // Matches prompt text
})
```

### 3. (Future) Class-Specific Schemas
For higher precision, generate distinct schemas for each class (e.g., `PersonSchema`, `OrganizationSchema`) instead of a generic `EntitySchema`. This would allow enforcing `minItems`/`maxItems` for specific properties on specific classes.

## Implementation Plan (Schema Alignment)

1.  **Update `Schema/Factory.ts`**:
    -   Accept `OntologyContext` instead of just IRI arrays.
    -   Iterate over properties to determine Type (Object vs Datatype).
    -   Generate Discriminated Union for `properties` array.
2.  **Integrate `ConstraintFormatter`**:
    -   Use `formatConstraint` to generate descriptions for schema fields.
3.  **Update `LlmService`**:
    -   Pass `OntologyContext` to factory.

## Conclusion
The current system is safe but suboptimal. Implementing **Discriminated Unions** is the highest-value change to ensure the JSON Schema structurally enforces the semantic distinctions (Literal vs Reference) made in the prompt.
