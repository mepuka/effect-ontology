# Fixed Option Rendering Bug in Prompts

**Date:** 2025-11-23  
**Issue:** Raw `Option` objects were being rendered in LLM prompts instead of unwrapped values  
**Impact:** ~2900 extra characters of JSON noise in prompts, confusing the LLM

## Problem

The `formatUnit` function in `packages/core/src/Prompt/Render.ts` was treating `maxCardinality` as `number | undefined`, but it's actually `Option<number>` (from Effect Schema).

**Before:**
```typescript
const cardinality = prop.minCardinality !== undefined || prop.maxCardinality !== undefined
  ? ` [${prop.minCardinality ?? 0}..${prop.maxCardinality ?? "*"}]`
  : ""
```

This rendered as:
```
Properties:
  - competesIn (Match) [0..{"_id": "Option", "_tag": "None"}]
  - partOf (Tournament) [0..{"_id": "Option", "_tag": "Some", "value": 1}]
```

## Solution

Properly unwrap `Option<number>` using `Option.match`:

```typescript
const maxCard = Option.match(prop.maxCardinality, {
  onNone: () => "*",
  onSome: (max) => String(max)
})
const cardinality = ` [${prop.minCardinality}..${maxCard}]`
```

Now renders as:
```
Properties:
  - competesIn (Match) [0..*]
  - partOf (Tournament) [0..1]
  - playsIn (Stadium) [0..1]
```

## Impact

- **Prompt size reduced:** 19198 → 16297 characters (~15% reduction)
- **Cleaner prompts:** LLM sees human-readable cardinality constraints
- **Better extraction:** LLM can properly understand functional properties and cardinality limits

## Files Modified

- `packages/core/src/Prompt/Render.ts` (lines 153-163)

## Verification

```bash
# Before: Prompt length 19198
# After: Prompt length 16297
ENABLE_TRACING=true bun run benchmarks/scripts/test-footology-with-scraped-data.ts
```

## Related

- Original property rendering fix: `docs/analysis/2025-11-23-property-rendering-fix.md`
- This fix completes the property rendering improvements

