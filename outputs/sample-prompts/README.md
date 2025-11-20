# Sample Extraction Prompts

Generated on: 2025-11-20T00:39:31.813Z

## Files

- **foaf-extraction-prompt.md** - Complete extraction prompt with FOAF ontology
- **foaf-json-schema.json** - JSON Schema component (largest part of prompt)
- **foaf-stats.json** - Metrics and statistics
- **simple-example.md** - Annotated example showing prompt structure

## Key Findings

### FOAF Ontology
- **Classes**: 11
- **Properties**: 11
- **Total Prompt**: 4429 characters
- **JSON Schema**: 3432 characters (77.5% of prompt)
- **Estimated Tokens**: 317
- **Estimated Cost** (GPT-4 @ $30/1M): $0.009510

### Observations

1. **JSON Schema Dominance**: The JSON Schema represents 77.5% of the total prompt
2. **Enum Overhead**: Each property/class enum in the schema adds significant tokens
3. **Scaling Challenge**: With 11 classes and 11 properties, the schema is already 3.35 KB
4. **Real-world Impact**: For large ontologies (e.g., Schema.org with 800+ classes), JSON Schema can easily exceed 50KB

### Next Steps

1. Review the generated prompts to evaluate quality
2. Test token counting with real tokenizers (@effect/ai-openai, @effect/ai-anthropic)
3. Explore prompt optimization strategies:
   - Selective class/property inclusion
   - Abbreviated schemas for common types
   - Dynamic schema generation based on input text
   - Schema compression techniques

## Usage

These sample prompts demonstrate what will be sent to LLMs for knowledge extraction.
Review them to understand:
- What the LLM sees
- How much of the prompt is schema vs instructions
- Token/cost implications for real-world use