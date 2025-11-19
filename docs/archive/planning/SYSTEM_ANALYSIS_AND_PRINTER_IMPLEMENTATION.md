# System Analysis & @effect/printer Implementation Plan

**Branch:** `claude/use-effect-printer-01Qe7XKhHXASuKdkW24qv1kT`
**Date:** 2025-11-19
**Status:** Ready for Implementation

---

## Table of Contents

1. [Complete System Data Flow](#complete-system-data-flow)
2. [Current String Construction Analysis](#current-string-construction-analysis)
3. [Integration Points](#integration-points)
4. [Recommended Implementation Approach](#recommended-implementation-approach)
5. [Detailed Implementation Tasks](#detailed-implementation-tasks)
6. [Testing Strategy](#testing-strategy)
7. [Migration Path & Risk Assessment](#migration-path--risk-assessment)

---

## Complete System Data Flow

### High-Level Architecture

```
Turtle RDF Input
    ↓
[Graph Builder] ──────→ OntologyContext + DependencyGraph
    ↓                          │
    │                          │
    ↓                          ↓
[Extraction Pipeline]    [Prompt Solver]
    │                     (Topological Fold)
    │                          ↓
    │                   StructuredPrompt
    │                    (string arrays)
    │                          ↓
    │                  [buildPromptText]  ← **TARGET FOR @effect/printer**
    │                    (manual string)
    │                          ↓
    └──→ [LLM Service] ← Prompt String
              ↓
         JSON Response
              ↓
         [RDF Service]
              ↓
         Turtle Output
```

### Detailed Data Flow

#### Phase 1: Ontology Parsing (Graph Builder)

**Input:** Turtle RDF ontology
**Output:** `ParsedOntologyGraph`

```typescript
{
  graph: Graph<NodeId, unknown, "directed">,  // Subclass dependencies
  context: OntologyContext                     // Node data store
}

OntologyContext = {
  nodes: HashMap<NodeId, OntologyNode>,        // Class/Property nodes
  universalProperties: PropertyData[],          // Properties without domain
  nodeIndexMap: HashMap<NodeId, NodeIndex>     // Graph index mapping
}
```

**Key Operations:**
1. Parse triples with N3
2. Extract OWL Classes → ClassNodes
3. Extract Properties → attach to ClassNodes or mark as universal
4. Build dependency graph from rdfs:subClassOf relations

**Location:** `packages/core/src/Graph/Builder.ts`

#### Phase 2: Prompt Generation (Solver + Algebra)

**Input:** `Graph<NodeId>` + `OntologyContext` + `PromptAlgebra`
**Output:** `HashMap<NodeId, StructuredPrompt>`

**Algorithm:** Topological Catamorphism
- Traverse graph in dependency order (children before parents)
- Apply algebra at each node to combine node data with children's prompts
- Return HashMap of all results

**PromptAlgebra Type:**
```typescript
type PromptAlgebra = (
  nodeData: OntologyNode,
  childrenResults: ReadonlyArray<StructuredPrompt>
) => StructuredPrompt
```

**Current Implementation:**
```typescript
// Algebra.ts:42-88
const classDefinition = [
  `Class: ${nodeData.label}`,
  `Properties:`,
  formatProperties(nodeData.properties)  // ← Manual string formatting
].join("\n")

return StructuredPrompt.make({
  system: [classDefinition, ...childrenPrompt.system],
  user: childrenPrompt.user,
  examples: childrenPrompt.examples
})
```

**StructuredPrompt Structure:**
```typescript
class StructuredPrompt {
  system: string[]     // System instructions
  user: string[]       // User context
  examples: string[]   // Few-shot examples
}
```

**Monoid Operations:**
- `combine(a, b)` - Component-wise array concatenation
- `empty()` - Three empty arrays
- `combineAll(prompts)` - Fold over array

**Location:**
- `packages/core/src/Prompt/Solver.ts` (graph traversal)
- `packages/core/src/Prompt/Algebra.ts` (prompt construction)

#### Phase 3: String Rendering (LLM Service)

**Input:** `StructuredPrompt` + `text: string`
**Output:** `string` (final prompt for LLM)

**🎯 CRITICAL INTEGRATION POINT:**

```typescript
// Llm.ts:76-109
const buildPromptText = (prompt: StructuredPrompt, text: string): string => {
  const parts: Array<string> = []

  // Add system instructions
  if (prompt.system.length > 0) {
    parts.push("SYSTEM INSTRUCTIONS:")
    parts.push(prompt.system.join("\n\n"))  // ← Manual join
    parts.push("")
  }

  // Add user context
  if (prompt.user.length > 0) {
    parts.push("CONTEXT:")
    parts.push(prompt.user.join("\n"))      // ← Manual join
    parts.push("")
  }

  // Add examples
  if (prompt.examples.length > 0) {
    parts.push("EXAMPLES:")
    parts.push(prompt.examples.join("\n\n")) // ← Manual join
    parts.push("")
  }

  // Add task
  parts.push("TASK:")
  parts.push("Extract knowledge graph from the following text:")
  parts.push("")
  parts.push(text)
  parts.push("")
  parts.push("Return a valid JSON object...")

  return parts.join("\n")  // ← Final manual join
}
```

**Issues with Current Approach:**
1. **Hardcoded formatting** - "\n" vs "\n\n" scattered throughout
2. **No semantic structure** - Just string concatenation
3. **Difficult to test** - Must compare entire string output
4. **Not composable** - Can't reuse section builders
5. **No layout flexibility** - Always same format regardless of context
6. **Manual empty line management** - Easy to make mistakes

**Location:** `packages/core/src/Services/Llm.ts`

#### Phase 4: Extraction (Extraction Pipeline)

**Input:** `ExtractionRequest`
**Output:** `ExtractionResult`

**Orchestration Flow:**
1. Emit `LLMThinking` event
2. Generate prompt via Solver
3. Extract vocabulary (classIris, propertyIris)
4. Generate dynamic schema
5. Call LLM with structured output
6. Emit `JSONParsed` event
7. Convert JSON → RDF (RdfService)
8. Emit `RDFConstructed` event
9. Validate with SHACL (TODO)
10. Emit `ValidationComplete` event

**Event Broadcasting:** PubSub.unbounded for multiple UI consumers

**Location:** `packages/core/src/Services/Extraction.ts`

---

## Current String Construction Analysis

### Where Strings Are Built

#### 1. Algebra (Property Formatting)

```typescript
// Algebra.ts:17-28
const formatProperties = (properties: ReadonlyArray<PropertyData>): string => {
  if (properties.length === 0) {
    return "  (no properties)"
  }

  return properties
    .map((prop) => {
      const rangeLabel = prop.range.split("#")[1] || prop.range.split("/").pop() || prop.range
      return `  - ${prop.label} (${rangeLabel})`  // ← Hardcoded "  - "
    })
    .join("\n")  // ← Hardcoded newline
}
```

**Problems:**
- Hardcoded indentation ("  ")
- Hardcoded bullet ("- ")
- No way to change formatting without modifying function

#### 2. Algebra (Class Definition)

```typescript
// Algebra.ts:48-52
const classDefinition = [
  `Class: ${nodeData.label}`,
  `Properties:`,
  formatProperties(nodeData.properties)
].join("\n")  // ← Manual array + join pattern
```

**Problems:**
- String array + join pattern repeated everywhere
- No semantic structure (just string concatenation)
- Hard to test individual components

#### 3. Algebra (Universal Properties)

```typescript
// Algebra.ts:106-109
const universalSection = [
  "Universal Properties (applicable to any resource):",
  formatProperties(universalProperties)
].join("\n")
```

**Same Issues:** Manual array + join

#### 4. LLM Service (Section Headers)

```typescript
// Llm.ts:80-84
if (prompt.system.length > 0) {
  parts.push("SYSTEM INSTRUCTIONS:")
  parts.push(prompt.system.join("\n\n"))  // ← Different spacing!
  parts.push("")                          // ← Manual blank line
}
```

**Problems:**
- Inconsistent spacing ("\n" vs "\n\n")
- Manual blank line management
- Duplicate logic for each section

### Common Anti-Patterns

1. **Array Push + Join:**
   ```typescript
   const parts: string[] = []
   parts.push("Header:")
   parts.push(content)
   parts.push("")  // Blank line
   return parts.join("\n")
   ```

2. **Hardcoded Whitespace:**
   ```typescript
   return `  - ${item}`  // Fixed indentation
   ```

3. **Inconsistent Spacing:**
   ```typescript
   system.join("\n\n")   // Double newline for system
   user.join("\n")       // Single newline for user
   ```

4. **String Interpolation Everywhere:**
   ```typescript
   `Class: ${label}`
   `Properties:`
   `  - ${prop.label} (${prop.range})`
   ```

### Why This Matters

**Current Issues:**
- **Maintainability:** Formatting logic scattered across files
- **Testability:** Must test entire strings, not components
- **Flexibility:** Can't adapt layout without code changes
- **Semantics:** No distinction between "header", "list", "section"
- **Consistency:** Easy to make spacing mistakes

**@effect/printer Benefits:**
- **Semantic structure:** `section()`, `header()`, `bulletList()`
- **Composability:** Build complex docs from simple parts
- **Testability:** Test individual document components
- **Flexibility:** Change layout algorithm without touching structure
- **Correctness:** Layout algorithms guarantee consistent spacing

---

## Integration Points

### Primary Integration: Llm.ts:76-109

**Replace:**
```typescript
const buildPromptText = (prompt: StructuredPrompt, text: string): string
```

**With:**
```typescript
const buildPromptDoc = (prompt: StructuredPrompt, text: string): Doc.Doc<never>
```

**Impact:**
- ✅ Zero breaking changes (only internal implementation)
- ✅ Output identical to current version
- ✅ Existing tests continue to pass
- ✅ Foundation for future improvements

**Dependencies:**
- Must create `DocBuilder.ts` utilities first
- Must create `PromptDoc.ts` rendering functions
- Must verify output matches exactly

### Secondary Integration: Algebra.ts:17-28, 48-52

**Current:**
```typescript
const formatProperties = (properties: ReadonlyArray<PropertyData>): string
```

**Future (Phase 2):**
```typescript
const formatProperties = (properties: ReadonlyArray<PropertyData>): Doc.Doc<never>
```

**Impact:**
- ⚠️ Requires changing return type of algebra
- ⚠️ May require updating StructuredPrompt type
- ✅ Better semantic structure
- ✅ More testable

**Recommendation:** Do NOT change in Phase 1
- Keep algebra returning `string[]`
- Convert to Doc only at render time in Llm.ts
- Migrate algebra in Phase 2 after validating Phase 1

### Tertiary: Future Enhancements

1. **Multiple Output Formats**
   - Plain text (current)
   - Markdown (for documentation)
   - HTML (for web UI)
   - ANSI colored (for CLI debugging)

2. **Width-Aware Layouts**
   - Adapt to different LLM context windows
   - Compact format for small contexts
   - Verbose format for large contexts

3. **Semantic Annotations**
   - Mark IRIs as links
   - Syntax highlighting for examples
   - Debug annotations for testing

---

## Recommended Implementation Approach

### Phase 1: Drop-In Replacement (Current Plan)

**Goal:** Replace `buildPromptText` with Doc-based version, zero breaking changes

**Strategy:**
1. Install `@effect/printer`
2. Create core utilities (DocBuilder.ts)
3. Create prompt rendering (PromptDoc.ts)
4. Replace `buildPromptText` in Llm.ts
5. Verify tests pass with identical output

**Benefits:**
- ✅ Low risk (no API changes)
- ✅ Immediate value (better code structure)
- ✅ Foundation for future work
- ✅ Can validate approach before deeper integration

**Timeline:** 1-2 hours

### Phase 2: Enhance Algebra (Future)

**Goal:** Update Algebra to use Doc for better composability

**Strategy:**
1. Add Doc variants of formatProperties, etc.
2. Optionally update StructuredPrompt to store Doc
3. Migrate algebra functions gradually
4. Provide backward compatibility

**Benefits:**
- ✅ Semantic structure in algebra
- ✅ Better testability
- ✅ Reusable document components

**Timeline:** 2-3 hours (future work)

### Phase 3: Advanced Features (Future)

**Goal:** Leverage full power of @effect/printer

**Strategy:**
1. Multiple output formats
2. Width-aware layouts
3. Semantic annotations
4. Interactive rendering

**Timeline:** Future (as needed)

---

## Detailed Implementation Tasks

### Task 1: Install Dependencies ✅

```bash
cd packages/core
bun add @effect/printer
```

**Verification:**
- Can import `{ Doc }` from "@effect/printer"
- TypeScript compilation succeeds

**Estimated Time:** 2 minutes

---

### Task 2: Create DocBuilder.ts

**File:** `packages/core/src/Prompt/DocBuilder.ts`

**Functions to Implement:**

```typescript
/**
 * Create a header with trailing colon (e.g., "SYSTEM:")
 */
export const header = (title: string): Doc.Doc<never>

/**
 * Create a section with title and items
 *
 * Example:
 * SYSTEM:
 * instruction 1
 * instruction 2
 */
export const section = (
  title: string,
  items: ReadonlyArray<string>
): Doc.Doc<never>

/**
 * Create a bullet list
 *
 * Example:
 * - item 1
 * - item 2
 */
export const bulletList = (
  items: ReadonlyArray<string>,
  bullet?: string
): Doc.Doc<never>

/**
 * Create a numbered list
 */
export const numberedList = (
  items: ReadonlyArray<string>
): Doc.Doc<never>

/**
 * Render Doc to string with pretty layout
 */
export const renderDoc = (doc: Doc.Doc<never>): string

/**
 * Render with custom width constraint
 */
export const renderDocWithWidth = (
  doc: Doc.Doc<never>,
  width: number
): string
```

**Key Design Decisions:**

1. **Empty sections return Doc.empty**
   - Allows conditional composition
   - `Doc.vsep()` automatically filters empty docs

2. **Consistent spacing**
   - Sections use `Doc.vsep()` for vertical separation
   - Blank lines added via `Doc.empty` in array

3. **Uppercase headers**
   - Match current format ("SYSTEM INSTRUCTIONS:")
   - Applied in `header()` function

**Implementation Notes:**

```typescript
// Good: Semantic structure
const doc = Doc.vcat([
  header(title),
  Doc.vsep(items.map(Doc.text)),
  Doc.empty  // Blank line after section
])

// Avoid: Manual string building (defeats purpose)
const doc = Doc.text(items.join("\n"))
```

**Estimated Time:** 30 minutes

---

### Task 3: Create PromptDoc.ts

**File:** `packages/core/src/Prompt/PromptDoc.ts`

**Functions to Implement:**

```typescript
/**
 * Build Doc from StructuredPrompt
 *
 * Creates three sections (SYSTEM, CONTEXT, EXAMPLES)
 * Empty sections are omitted
 */
export const buildPromptDoc = (
  prompt: StructuredPrompt
): Doc.Doc<never>

/**
 * Build complete extraction prompt Doc
 *
 * Combines StructuredPrompt + TASK section with text
 */
export const buildExtractionPromptDoc = (
  prompt: StructuredPrompt,
  text: string
): Doc.Doc<never>

/**
 * Render StructuredPrompt to string (convenience)
 */
export const renderStructuredPrompt = (
  prompt: StructuredPrompt
): string

/**
 * Render extraction prompt to string (main export)
 */
export const renderExtractionPrompt = (
  prompt: StructuredPrompt,
  text: string
): string
```

**Critical Implementation Detail:**

Must match current `buildPromptText` output exactly:

```typescript
// Current spacing rules (from Llm.ts:76-109):
// 1. System section: join with "\n\n" (double newline)
// 2. User section: join with "\n" (single newline)
// 3. Examples section: join with "\n\n" (double newline)
// 4. Blank line after each section
// 5. Task section has multiple parts with specific spacing

// Doc implementation:
const systemDoc = Doc.vcat([
  Doc.text("SYSTEM INSTRUCTIONS:"),
  Doc.vsep(prompt.system.map(Doc.text).map(doc =>
    Doc.cat(doc, Doc.hardLine)  // Force paragraph breaks
  )),
  Doc.empty
])
```

**Testing Requirements:**
- Compare output character-by-character with current version
- Test empty sections
- Test all sections populated
- Test edge cases (empty strings, special characters)

**Estimated Time:** 45 minutes

---

### Task 4: Update Llm.ts

**Changes Required:**

```typescript
// Add import
import { renderExtractionPrompt } from "../Prompt/PromptDoc.js"

// Remove old function
// const buildPromptText = (prompt: StructuredPrompt, text: string): string => { ... }

// Update extractKnowledgeGraph (line 176-178)
// OLD:
const promptText = buildPromptText(prompt, text)

// NEW:
const promptText = renderExtractionPrompt(prompt, text)
```

**Verification:**
1. All imports resolve
2. TypeScript compiles
3. Tests pass
4. Output identical to previous version

**Estimated Time:** 10 minutes

---

### Task 5: Add Tests

**File:** `packages/core/test/Prompt/DocBuilder.test.ts`

**Test Cases:**

```typescript
describe("DocBuilder", () => {
  test("header creates uppercase title with colon")
  test("section creates titled block with items")
  test("section returns empty for no items")
  test("bulletList creates bullet points")
  test("bulletList allows custom bullet")
  test("numberedList creates numbered items")
  test("renderDoc produces string output")
})
```

**File:** `packages/core/test/Prompt/PromptDoc.test.ts`

**Test Cases:**

```typescript
describe("PromptDoc", () => {
  test("buildPromptDoc creates doc with all sections")
  test("buildPromptDoc omits empty sections")
  test("buildExtractionPromptDoc includes task section")
  test("output matches buildPromptText format exactly")  // Critical!
  test("handles edge cases: empty strings, special characters")
})
```

**File:** `packages/core/test/Services/Llm.test.ts`

**Add Integration Test:**

```typescript
test("prompt rendering matches previous format", () => {
  const prompt = StructuredPrompt.make({
    system: ["instruction 1", "instruction 2"],
    user: ["context 1"],
    examples: ["example 1"]
  })

  const text = "Test text"
  const output = renderExtractionPrompt(prompt, text)

  // Verify structure
  expect(output).toMatch(/SYSTEM INSTRUCTIONS:/)
  expect(output).toMatch(/CONTEXT:/)
  expect(output).toMatch(/EXAMPLES:/)
  expect(output).toMatch(/TASK:/)
  expect(output).toContain(text)

  // Verify spacing (critical!)
  expect(output).toContain("\n\ninstruction 2")  // System uses double newline
  expect(output).not.toContain("context 1\n\ncontext 2")  // User uses single newline
})
```

**Estimated Time:** 45 minutes

---

### Task 6: Export Public API

**File:** `packages/core/src/Prompt/index.ts`

**Add:**

```typescript
// Document builders
export * from "./DocBuilder.js"
export * from "./PromptDoc.js"
```

**Verification:**
- Can import from `@effect-ontology/core/Prompt`
- TypeScript types resolve correctly

**Estimated Time:** 5 minutes

---

### Task 7: Update Documentation

**File:** `docs/plans/effect-printer-integration-analysis.md`

**Add Section:**

```markdown
## Implementation Status

### ✅ Phase 1: Core Integration (Complete)

- [x] Install @effect/printer
- [x] Create DocBuilder utilities
- [x] Create PromptDoc rendering
- [x] Replace buildPromptText in Llm.ts
- [x] All tests passing
- [x] Output verified identical

**Files Changed:**
- `packages/core/src/Prompt/DocBuilder.ts` (new)
- `packages/core/src/Prompt/PromptDoc.ts` (new)
- `packages/core/src/Services/Llm.ts` (modified)
- `packages/core/test/Prompt/DocBuilder.test.ts` (new)
- `packages/core/test/Prompt/PromptDoc.test.ts` (new)

**Next Steps:** Phase 2 (Algebra enhancement) - TBD
```

**Estimated Time:** 10 minutes

---

## Testing Strategy

### Unit Tests

**Level 1: DocBuilder Functions**
- Test each utility in isolation
- Verify semantic structure (not just string output)
- Test edge cases

**Level 2: PromptDoc Functions**
- Test section composition
- Verify empty section handling
- Test complete prompt building

### Integration Tests

**Level 3: LLM Service**
- Verify output matches previous version exactly
- Test with real StructuredPrompt instances
- Test error handling

### Regression Tests

**Level 4: End-to-End**
- Run existing extraction pipeline tests
- Verify no behavioral changes
- Confirm event emissions unchanged

### Verification Strategy

**Output Comparison:**

```typescript
// Generate reference output with old implementation
const oldOutput = buildPromptText(testPrompt, testText)

// Generate new output with Doc implementation
const newOutput = renderExtractionPrompt(testPrompt, testText)

// Compare character-by-character
expect(newOutput).toBe(oldOutput)

// Also verify structure
expect(newOutput.split("\n").length).toBe(oldOutput.split("\n").length)
```

**Snapshot Testing:**

```typescript
test("prompt rendering matches snapshot", () => {
  const output = renderExtractionPrompt(examplePrompt, exampleText)
  expect(output).toMatchSnapshot()
})
```

---

## Migration Path & Risk Assessment

### Phase 1: Drop-In Replacement

**Risk Level:** 🟢 Low

**Why Low Risk:**
- No API changes
- Output identical
- Isolated to Llm.ts
- Easy to revert

**Validation:**
1. Compare output string-by-string
2. Run all existing tests
3. Verify extraction pipeline unchanged
4. Check event emissions identical

**Rollback Plan:**
- Revert Llm.ts changes
- Remove DocBuilder and PromptDoc files
- Uninstall @effect/printer
- Total rollback time: 5 minutes

### Phase 2: Algebra Enhancement (Future)

**Risk Level:** 🟡 Medium

**Why Medium Risk:**
- Changes StructuredPrompt type (maybe)
- Affects multiple files
- More extensive testing needed

**Mitigation:**
- Provide backward compatibility layer
- Migrate gradually (one function at a time)
- Keep old implementations during transition
- Extensive testing at each step

### Phase 3: Advanced Features (Future)

**Risk Level:** 🟢 Low

**Why Low Risk:**
- Additive only (no breaking changes)
- Optional features
- Can be disabled if issues arise

---

## Success Criteria

### Phase 1 Must-Have

- [x] Plan created and validated
- [ ] `@effect/printer` installed
- [ ] DocBuilder.ts implemented and tested
- [ ] PromptDoc.ts implemented and tested
- [ ] Llm.ts updated to use renderExtractionPrompt
- [ ] All existing tests pass
- [ ] Output verified identical to previous version
- [ ] No breaking changes to public API
- [ ] Documentation updated

### Phase 1 Quality Gates

1. **Output Verification**
   - Character-by-character comparison passes
   - Snapshot tests pass
   - Structure tests pass

2. **Test Coverage**
   - DocBuilder: 100% function coverage
   - PromptDoc: 100% function coverage
   - Integration: All existing tests pass

3. **Code Quality**
   - No eslint errors
   - No TypeScript errors
   - Follows Effect patterns

4. **Documentation**
   - README updated
   - Implementation doc updated
   - Code comments clear

---

## Alignment with System Architecture

### Effect-TS Patterns ✅

**Functional Composition:**
- Doc combinators align with Effect's compositional style
- Pure functions throughout
- Immutable data structures

**Type Safety:**
- `Doc.Doc<never>` fully typed
- No `any` types
- Schema integration ready

**Error Handling:**
- Rendering cannot fail (Doc always valid)
- No Effect wrapper needed for pure rendering
- Errors handled at algebra/solver level

### Integration with Existing Services ✅

**Llm Service:**
- Minimal changes (just prompt building)
- Effect workflow unchanged
- LanguageModel integration untouched

**Extraction Pipeline:**
- No changes needed
- Event flow unchanged
- PubSub integration preserved

**Prompt Solver:**
- Algebra interface unchanged (Phase 1)
- StructuredPrompt type unchanged (Phase 1)
- Topological fold algorithm unchanged

### Declarative Functional Patterns ✅

**Before (Imperative):**
```typescript
const parts: string[] = []
parts.push("Header:")
if (items.length > 0) {
  parts.push(items.join("\n"))
}
parts.push("")
return parts.join("\n")
```

**After (Declarative):**
```typescript
return section("Header", items)
```

**Benefits:**
- ✅ Semantic intent clear
- ✅ No mutation
- ✅ Composable
- ✅ Testable
- ✅ Reusable

---

## Conclusion

This implementation plan provides a **low-risk, high-value** migration to `@effect/printer` that:

1. **Preserves all existing behavior** (output identical)
2. **Requires minimal changes** (one file primarily)
3. **Provides immediate value** (better code structure)
4. **Enables future enhancements** (multiple formats, layouts)
5. **Aligns with Effect patterns** (functional, composable, declarative)

**Recommendation:** Proceed with Phase 1 implementation immediately.

**Estimated Total Time:** ~2.5 hours

**Next Steps:**
1. Install @effect/printer
2. Create DocBuilder.ts with tests
3. Create PromptDoc.ts with tests
4. Update Llm.ts
5. Verify output identical
6. Commit and push

**Follow-up:** Evaluate Phase 2 (Algebra enhancement) after Phase 1 validates the approach.
