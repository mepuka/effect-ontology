# SOTA Review: NLP/LLM Extraction, Entity Resolution, and RDF Handling

## Scope and Constraints
- Reviewed local research docs: `packages/@core-v2/docs/ontology_research/llm_owl.md` and `packages/@core-v2/docs/ontology_research/prod_owl_rdf_pipelines.md`.
- Code and workflows examined across `packages/@core-v2/src` (prompting, extraction services, resolution, RDF services, durable activities).
- Network access is restricted, so cited external sources in the research docs were not fetched or validated.

## Research Doc Takeaways (Local)
- **LLM ↔ OWL**: Emphasizes prompt-constrained extraction/generation (local names, Turtle/JSON-LD output), few-shot and decomposed prompting, and validation loops (RDFLib/Owlready2 + feedback). Highlights RAG over ontology modules, memoryless CQ-by-CQ and Ontogenia-style iterative refinement, and structured outputs to bound hallucinations.
- **Pipelines (RDF/OWL/SHACL)**: Advocates incremental ingestion + reasoning + SHACL validation, entity consolidation before validation, and provenance via named graphs/RDF-star. Notes industrial patterns: incremental SHACL (GraphDB), DRed incremental reasoning (RDFox), SPARQL for transforms, and RDF/JS tooling (N3.js, Comunica, rdf-validate-shacl).

## Implementation Review
- **NLP + Retrieval** (`src/Service/Nlp.ts`, `Workflow/StreamingExtraction.ts`):
  - Sentence-aware chunking with overlap and hybrid class search (BM25 + embeddings via Nomic) on aggregated mentions per chunk. Good guardrails (timeouts, fallbacks), but retrieval is coarse: single aggregated query per chunk, no per-mention/topical RAG, and no subclass/parent expansion for recall.
- **Prompting & LLM Contracts** (`src/Prompt/PromptGenerator.ts`, `src/Prompt/RuleSet.ts`, `src/Service/Extraction.ts`):
  - Strong schema-prompt alignment: local-name outputs, rule sets, JSON Schema decoding with feedback/retry, and logging/telemetry. Grounder re-verifies relations with a second LLM pass.
  - Gaps: no few-shot/CQ-driven variants, no self-check traces, and prompts don’t carry per-class examples or property-specific constraints (domains/ranges not enforced in prompts beyond listing). Mention extraction is single-shot without context retrieval.
- **Entity/Relation Extraction** (`src/Service/Extraction.ts`):
  - Entities: candidate classes scoped via hybrid search; datatype properties fetched but only filtered post-hoc. Attribute validation is minimal (presence in provided datatype props), no type/range coercion, no literal normalization.
  - Relations: schema enforces allowed predicates and entity IDs, but domain/range compatibility is not checked post-LLM; datatype values are untyped literals. Grounding filters relations but not entity attributes.
- **Entity Resolution & Clustering**:
  - Two implementations exist: a simple similarity merge (`Workflow/EntityResolution.ts`) and an embedding/blocking-based graph clustering with Effect Graph (`Workflow/EntityResolutionGraph.ts`), including provenance-friendly models in `Domain/Model/EntityResolution*.ts`.
  - **Not wired into workflows**: streaming extraction stops at merge-by-id; durable resolution activity only concatenates Turtle and reports counts—no clustering, sameAs mapping, or relation re-pointing.
- **RDF Graph Handling** (`src/Service/Rdf.ts`, `src/Service/Ontology.ts`):
  - Ontology parsing covers labels/domains/ranges/hierarchies; RdfBuilder wraps N3 for parse/serialize and graph construction.
  - SHACL validation is a placeholder returning `conforms: true`; no OWL/RDFS reasoning or functional-property enforcement. Provenance fields (chunkId/chunkIndex) are not materialized into RDF (no named graphs/RDF-star).
- **Activity/Workflow Layer** (`src/Workflow/StreamingExtraction.ts`, `src/Workflow/DurableActivities.ts`, `src/Workflow/BatchWorkflow.ts`):
  - Streaming pipeline aligns with the functional spec (chunk → hybrid retrieval → entities → properties → relations → grounder → merge). Good failure handling for systemic errors.
  - Durable workflow (batch) runs extraction → “resolution” → validation → ingestion, but resolution is a noop merge of Turtle files and validation uses the SHACL stub, so downstream graphs can accumulate duplicates and invalid triples unchecked.

## Gaps and Risks
- No end-to-end entity resolution or cross-document linking in production workflows; duplicates and conflicting relations will persist.
- Validation is ineffective: SHACL stub and no reasoning; domain/range/functional constraints are never enforced.
- Provenance is not persisted in RDF; chunk-level metadata is dropped when serializing.
- Retrieval/prompting do not leverage competency questions, design patterns, or per-mention RAG as suggested by the research docs; recall and precision likely suffer.
- Relation extraction does not enforce ontology domain/range or datatype normalization; attribute literals remain untyped.

## Recommendations (Prioritized)
1) **Wire real ER + linking into workflows**: Replace the resolution activity with the graph-based clustering (`Workflow/EntityResolutionGraph.ts`) to emit canonical IDs, sameAs mappings, and remap relations; persist mappings for downstream merges.
2) **Introduce actual SHACL + light reasoning**: Integrate a validator (e.g., rdf-validate-shacl or pyshacl) in `RdfBuilder.validate` and enforce domain/range/functional constraints; run post-resolution and pre-ingestion. Add optional RDFS/OWL-RL materialization for type propagation.
3) **Upgrade prompts and retrieval**: Add per-mention RAG over ontology modules + few-shot exemplars; include domain/range cues and examples in prompts; adopt CQ-by-CQ or Ontogenia-style iterative prompts for complex docs; surface self-check/critique before acceptance.
4) **Provenance and typing in RDF**: Emit named graphs or RDF-star annotations carrying chunkId/chunkIndex and source doc; normalize literals with datatypes; attach confidence scores from grounder and ER.
5) **Attribute and relation normalization**: Enforce datatype ranges (dates/numbers/booleans), coerce/validate literals, and add domain/range post-filters before graph merge; propagate property hierarchy for scoping.
6) **Activity robustness**: Make resolution/validation steps fail the batch on ER/SHACL errors; store validation reports; add regression tests around extraction schemas, ER clustering, and RDF serialization.

## Quick Alignment Plan
- Short term: implement real SHACL validation + ER clustering in activities; persist provenance; add domain/range filters on relations.
- Medium term: introduce CQ-driven prompts with per-mention RAG and iterative refinement; add datatype normalization and hierarchy-aware scoping.
- Long term: incremental validation/reasoning in storage, RDF-star provenance, and external KB linking (Wikidata/DBpedia) for canonical IDs and clustering priors.
