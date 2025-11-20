# Provenance Visualization Implementation Roadmap

**Status:** Ready for implementation
**Design Doc:** `PROVENANCE_VISUALIZATION_DESIGN.md`
**Estimated Effort:** 2-3 days for Phase 1-3, 1-2 days for Phase 4-6

---

## Priority Order (Based on User Feedback)

### 🔴 Phase 1: JSON Schema Viewer (CRITICAL)
**Why:** User specifically requested visualization of "the actual tool call structured output"

**Deliverables:**
1. `JsonSchemaViewer` component with Anthropic/OpenAI/Raw tabs
2. `InteractiveJsonTree` with collapsible sections
3. `IriChip` component for clickable IRI values
4. Split panel layout (Prompt | JSON Schema)
5. Copy-to-clipboard for all formats

**Files to Create:**
- `packages/ui/src/components/JsonSchemaViewer.tsx`
- `packages/ui/src/components/InteractiveJsonTree.tsx`
- `packages/ui/src/components/IriChip.tsx`
- `packages/ui/src/components/LLMToolCallPreview.tsx`
- `packages/ui/src/utils/schemaUtils.ts` (dereferencing, stats)

**Dependencies:**
- `effect` (JSONSchema.make)
- `@effect-ontology/core/Schema/Factory` (makeKnowledgeGraphSchema)
- Existing atoms: `ontologyGraphAtom`, `generatedPromptsAtom`

**Estimated Time:** 6-8 hours

---

### 🟠 Phase 2: Provenance-Enriched Prompts
**Why:** Foundation for all other features (hover, linking, metadata)

**Deliverables:**
1. `PromptFragment` Schema with provenance metadata
2. `EnrichedStructuredPrompt` Schema
3. Updated `promptAlgebra` to produce fragments
4. Updated atoms to handle enriched types

**Files to Modify:**
- `packages/core/src/Prompt/Types.ts` (add PromptFragment)
- `packages/core/src/Prompt/Render.ts` (update algebra)
- `packages/ui/src/state/store.ts` (update atoms)
- `packages/ui/src/components/PromptPreview.tsx` (consume fragments)

**Estimated Time:** 4-6 hours

---

### 🟡 Phase 3: Aesthetics & Polish
**Why:** User wants "really good comprehensive UX/UI design" following cookbook

**Deliverables:**
1. Typography system (JetBrains Mono, Space Grotesk)
2. Depth-based color scale (warm → cool)
3. Layered backgrounds with gradients
4. Staggered motion variants

**Files to Modify:**
- `packages/ui/src/styles/globals.css` (CSS variables)
- `packages/ui/index.html` (Google Fonts)
- All components (apply new typography/colors)

**Estimated Time:** 3-4 hours

---

### 🟢 Phase 4: Interactive Hover System
**Why:** Core usability feature for provenance exploration

**Deliverables:**
1. `ProvenanceTooltip` component (Radix UI)
2. Depth color scale utility
3. Navigation handler (fragment → graph)
4. Bidirectional highlighting

**Files to Create:**
- `packages/ui/src/components/ProvenanceTooltip.tsx`
- `packages/ui/src/utils/colorScale.ts`

**Files to Modify:**
- `packages/ui/src/state/store.ts` (add `highlightedSourceAtom`)
- `packages/ui/src/components/PromptPreview.tsx` (render tooltips)
- `packages/ui/src/components/EnhancedTopologicalRail.tsx` (respond to highlights)

**Dependencies:**
- `pnpm add @radix-ui/react-tooltip`

**Estimated Time:** 4-5 hours

---

### 🔵 Phase 5: Observable Plot Visualizations
**Why:** Requested in original task ("better visualization utilities")

**Deliverables:**
1. `DependencyGraphView` (force-directed layout)
2. `HierarchyTreeView` (tree layout)
3. `TokenStatsChart` (bar chart)
4. Computed atoms for plot data

**Files to Create:**
- `packages/ui/src/components/DependencyGraphView.tsx`
- `packages/ui/src/components/HierarchyTreeView.tsx`
- `packages/ui/src/components/TokenStatsChart.tsx`
- `packages/ui/src/components/VisualizationPanel.tsx` (tab container)

**Files to Modify:**
- `packages/ui/src/state/store.ts` (add plot data atoms)

**Dependencies:**
- Already have: `@observablehq/plot@0.6.17`

**Estimated Time:** 6-8 hours

---

### 🟣 Phase 6: Search, Filter, Export
**Why:** Usability improvements for large ontologies

**Deliverables:**
1. `SearchBar` component with command UI
2. `TokenOptimizationControl` slider
3. `ExportButton` with JSON/Markdown/CSV
4. Keyboard navigation

**Files to Create:**
- `packages/ui/src/components/SearchBar.tsx`
- `packages/ui/src/components/TokenOptimizationControl.tsx`
- `packages/ui/src/components/ExportButton.tsx`

**Dependencies:**
- May need: `pnpm add cmdk` (command palette)

**Estimated Time:** 4-5 hours

---

## Implementation Strategy

### Incremental Rollout

1. **Start with Phase 1** (JSON Schema Viewer) - Most critical, can demo immediately
2. **Then Phase 3** (Aesthetics) - Quick wins, improves everything
3. **Then Phase 2** (Provenance data) - Foundation for advanced features
4. **Then Phase 4** (Hover system) - Builds on Phase 2
5. **Then Phase 5** (Observable Plot) - Independent feature
6. **Finally Phase 6** (Search/export) - Nice-to-have enhancements

### Testing Strategy

**Unit Tests:**
- `PromptFragment` Schema encoding/decoding
- `makeKnowledgeGraphSchema` with various inputs
- OpenAI schema dereferencing utility
- Color scale calculations

**Integration Tests:**
- End-to-end: Turtle → Prompt + Schema → UI
- Atom reactivity (change input → updates propagate)
- Navigation flows (click IRI → highlight graph)

**Manual QA:**
- Load FOAF ontology → verify schema correctness
- Load Schema.org subset → test performance
- Try all export formats → verify structure

---

## Risk Mitigation

### Potential Issues

1. **Performance with Large Ontologies:**
   - Risk: 100+ classes may slow down Observable Plot
   - Mitigation: Virtualization, lazy rendering, WebWorkers for heavy computation

2. **Schema Dereferencing Edge Cases:**
   - Risk: Complex $ref structures may break OpenAI conversion
   - Mitigation: Comprehensive tests, fallback to Anthropic format

3. **Provenance Tracking Overhead:**
   - Risk: PromptFragment may increase memory usage
   - Mitigation: Measure with React DevTools, optimize if needed

4. **Type Safety with Dynamic Schemas:**
   - Risk: Effect Schema type inference may not work perfectly
   - Mitigation: Use explicit type annotations, test with real data

---

## Acceptance Criteria

**Must Have (Phase 1-3):**
- ✅ JSON Schema viewer with all 3 formats
- ✅ IRI values link to ontology graph
- ✅ Distinctive typography and colors applied
- ✅ Copy-to-clipboard works
- ✅ Split panel layout functional

**Should Have (Phase 4-5):**
- ✅ Hover tooltips show provenance
- ✅ Bidirectional highlighting works
- ✅ Observable Plot graphs render correctly
- ✅ Depth-based color coding consistent

**Nice to Have (Phase 6):**
- ✅ Search finds and highlights nodes
- ✅ Export works for JSON/Markdown
- ✅ Token optimization slider functional

---

## Next Steps

1. Review this roadmap with user
2. Start Phase 1 implementation
3. Create feature branch: `feature/provenance-visualization`
4. Commit incrementally with clear messages
5. Test each phase before moving to next
6. Update design doc with any deviations
7. Create pull request when Phase 1-3 complete

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Author:** Claude (Sonnet 4.5)
