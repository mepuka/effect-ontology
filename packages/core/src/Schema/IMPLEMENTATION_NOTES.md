# Effect Schema Implementation Notes

**Date:** 2025-11-18
**Source:** `/docs/effect-source/effect/src/Schema.ts`, `/docs/effect-source/effect/src/SchemaAST.ts`

## Key Findings from Source Code Analysis

### 1. Schema.Literal() Implementation

**Location:** `Schema.ts:686-713`

```typescript
function makeLiteralClass<Literals extends array_.NonEmptyReadonlyArray<AST.LiteralValue>>(
  literals: Literals,
  ast: AST.AST = getDefaultLiteralAST(literals)
): Literal<Literals> {
  return class LiteralClass extends make<Literals[number]>(ast) {
    static override annotations(annotations: Annotations.Schema<Literals[number]>): Literal<Literals> {
      return makeLiteralClass(this.literals, mergeSchemaAnnotations(this.ast, annotations))
    }
    static literals = [...literals] as Literals
  }
}

export function Literal<Literals extends ReadonlyArray<AST.LiteralValue>>(
  ...literals: Literals
): SchemaClass<Literals[number]> | Never {
  return array_.isNonEmptyReadonlyArray(literals) ? makeLiteralClass(literals) : Never
}
```

**Key Points:**
- `Schema.Literal()` accepts **variadic arguments**, not an array
- Returns `Never` if called with zero arguments
- Uses `AST.Literal` internally via `getDefaultLiteralAST`
- Each literal value creates an `AST.Literal` instance

### 2. Schema.Union() Implementation

**Location:** `Schema.ts:1267-1305`

```typescript
const getDefaultUnionAST = <Members extends AST.Members<Schema.All>>(members: Members): AST.AST =>
  AST.Union.make(members.map((m) => m.ast))

function makeUnionClass<Members extends AST.Members<Schema.All>>(
  members: Members,
  ast: AST.AST = getDefaultUnionAST(members)
): Union<Members> {
  return class UnionClass extends make<
    Schema.Type<Members[number]>,
    Schema.Encoded<Members[number]>,
    Schema.Context<Members[number]>
  >(ast) {
    static override annotations(annotations: Annotations.Schema<Schema.Type<Members[number]>>): Union<Members> {
      return makeUnionClass(this.members, mergeSchemaAnnotations(this.ast, annotations))
    }
    static members = [...members]
  }
}

export function Union<Members extends ReadonlyArray<Schema.All>>(
  ...members: Members
) {
  return AST.isMembers(members)
    ? makeUnionClass(members)
    : array_.isNonEmptyReadonlyArray(members)
    ? members[0]
    : Never
}
```

**Key Points:**
- `Schema.Union()` also accepts **variadic arguments**
- Flattens and unifies the union members via `AST.Union.make()`
- Returns single member if only one schema passed
- Returns `Never` if called with zero arguments

### 3. AST.Literal Structure

**Location:** `SchemaAST.ts:527-547`

```typescript
export class Literal implements Annotated {
  readonly _tag = "Literal"
  constructor(readonly literal: LiteralValue, readonly annotations: Annotations = {}) {}
  toString() {
    return Option.getOrElse(getExpected(this), () => Inspectable.formatUnknown(this.literal))
  }
  toJSON(): object {
    return {
      _tag: this._tag,
      literal: Predicate.isBigInt(this.literal) ? String(this.literal) : this.literal,
      annotations: toJSONAnnotations(this.annotations)
    }
  }
}

export type LiteralValue = string | number | boolean | null | bigint
```

**Key Points:**
- AST.Literal holds a single primitive value
- Supports: `string | number | boolean | null | bigint`
- Has annotations support for metadata

### 4. AST.Union Structure

**Location:** `SchemaAST.ts:1677-1697`

```typescript
export class Union<M extends AST = AST> implements Annotated {
  static make = (types: ReadonlyArray<AST>, annotations?: Annotations): AST => {
    return isMembers(types) ? new Union(types, annotations) : types.length === 1 ? types[0] : neverKeyword
  }

  static unify = (candidates: ReadonlyArray<AST>, annotations?: Annotations): AST => {
    return Union.make(unify(flatten(candidates)), annotations)
  }

  readonly _tag = "Union"
  private constructor(readonly types: Members<M>, readonly annotations: Annotations = {}) {}

  toString() {
    return Option.getOrElse(getExpected(this), () => this.types.map(String).join(" | "))
  }
}
```

**Key Points:**
- `AST.Union.make()` is the factory (not a constructor)
- Automatically flattens nested unions
- Unifies duplicate members
- Returns single type if only one member

## Implementation Strategy for Dynamic Schemas

### Challenge: Variadic Arguments vs Arrays

Since we have dynamic arrays of IRIs from the ontology, we can't use variadic arguments directly.

**Solution: Use spread operator with proper typing**

```typescript
// ❌ Won't work - type mismatch
const literals = classIris.map(iri => Schema.Literal(iri))
const union = Schema.Union(...literals) // Type error!

// ✅ Correct approach
import { Schema as S, Array as A } from "effect"

export const makeClassUnion = (classIris: ReadonlyArray<string>) => {
  // Create array of Schema instances
  const schemas = A.map(classIris, (iri) => S.Literal(iri))

  // TypeScript can spread the array if we assert the type
  return S.Union(...(schemas as [S.Schema<string>, ...Array<S.Schema<string>>]))
}
```

### Alternative: Use Schema.Enums for String Unions

**Location:** `Schema.ts:747-780`

For our use case with string IRIs, `Schema.Enums` might be more appropriate:

```typescript
const getDefaultEnumsAST = <A extends EnumsDefinition>(enums: A) =>
  new AST.Enums(
    Object.keys(enums).filter(
      (key) => typeof enums[enums[key] as any] !== "number"
    ).map((key) => [key, enums[key]])
  )

export interface Enums<A extends EnumsDefinition> extends AnnotableClass<Enums<A>, A[keyof A]> {
  readonly enums: A
}
```

**But:** Enums require an object definition, not a dynamic array. Less flexible.

## Recommended Pattern for Our Use Case

After analysis, the **correct pattern** is:

```typescript
import { Schema as S, Array as A } from "effect"

export const makeKnowledgeGraphSchema = (
  classIris: ReadonlyArray<string>,
  propertyIris: ReadonlyArray<string>
) => {
  // Handle edge case: empty arrays
  if (A.isEmptyReadonlyArray(classIris)) {
    throw new Error("Cannot create schema with zero class IRIs")
  }
  if (A.isEmptyReadonlyArray(propertyIris)) {
    throw new Error("Cannot create schema with zero property IRIs")
  }

  // Create individual Literal schemas
  const classSchemas = A.map(classIris, (iri) => S.Literal(iri))
  const propSchemas = A.map(propertyIris, (iri) => S.Literal(iri))

  // Union them - TypeScript needs proper typing
  // Use Array.headNonEmpty + Array.tailNonEmpty to satisfy type constraints
  const ClassUnion = S.Union(
    A.headNonEmpty(classSchemas),
    ...A.tailNonEmpty(classSchemas)
  )

  const PropertyUnion = S.Union(
    A.headNonEmpty(propSchemas),
    ...A.tailNonEmpty(propSchemas)
  )

  return S.Struct({
    entities: S.Array(
      S.Struct({
        "@id": S.String,
        "@type": ClassUnion,
        properties: S.Array(
          S.Struct({
            predicate: PropertyUnion,
            object: S.Union(
              S.String,
              S.Struct({ "@id": S.String })
            )
          })
        )
      })
    )
  })
}
```

### Why This Works:

1. **Type Safety:** `headNonEmpty` + `tailNonEmpty` satisfy the `[T, ...T[]]` constraint
2. **Runtime Safety:** We check for empty arrays upfront
3. **No AST Manipulation:** Uses public API only
4. **Performant:** Schema construction is one-time cost

## Alternative: Helper Function

For cleaner code, we can create a helper:

```typescript
const unionFromArray = <T extends string>(
  values: ReadonlyArray<T>
): S.Schema<T> => {
  if (A.isEmptyReadonlyArray(values)) {
    return S.Never as any // or throw
  }
  const schemas = A.map(values, (v) => S.Literal(v))
  return S.Union(A.headNonEmpty(schemas), ...A.tailNonEmpty(schemas))
}

// Usage
const ClassUnion = unionFromArray(classIris)
const PropertyUnion = unionFromArray(propertyIris)
```

## Next Steps

1. Implement the schema factory with the pattern above
2. Write tests verifying:
   - Valid IRIs accepted
   - Unknown IRIs rejected
   - Empty arrays handled gracefully
3. Benchmark performance with large ontologies (1000+ classes)

---

**Source References:**
- Schema.Literal: `/docs/effect-source/effect/src/Schema.ts:686-713`
- Schema.Union: `/docs/effect-source/effect/src/Schema.ts:1267-1305`
- AST.Literal: `/docs/effect-source/effect/src/SchemaAST.ts:527-547`
- AST.Union: `/docs/effect-source/effect/src/SchemaAST.ts:1677-1697`
