# Strategy Comparison: FOAF (Minimal)

**Ontology:** foaf-minimal.ttl
**Focus Nodes:** http://xmlns.com/foaf/0.1/Person, http://xmlns.com/foaf/0.1/Organization

## Results Summary

| Strategy | Classes | Properties | Tokens | System | User | Examples | Schema (KB) |
|----------|---------|------------|--------|--------|------|----------|-------------|
| Full | 11 | 11 | 317 | 11 | 0 | 0 | 3.35 |
| Focused | 3 | 10 | 163 | 3 | 0 | 0 | 3.35 |
| Neighborhood | 3 | 10 | 163 | 3 | 0 | 0 | 3.35 |

## Token Reduction
- **Focused**: 48.6% reduction (317 → 163 tokens)
- **Neighborhood**: 48.6% reduction (317 → 163 tokens)

## Strategy Details

### Full
- Uses entire ontology without pruning
- Best for comprehensive extraction
- Highest token cost

### Focused
- Includes only focus nodes + ancestors
- Good for targeted extraction
- Moderate token reduction

### Neighborhood
- Includes focus nodes + ancestors + children
- Best for exploring related concepts
- Balanced token cost

## Output Files

- `prompt-full.txt` - Full strategy prompt
- `schema-full.json` - Full strategy schema
- `prompt-focused.txt` - Focused strategy prompt
- `schema-focused.json` - Focused strategy schema
- `prompt-neighborhood.txt` - Neighborhood strategy prompt
- `schema-neighborhood.json` - Neighborhood strategy schema