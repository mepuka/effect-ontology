# Architecture & Simplification Review

Date: 2025-11-23  
Reviewer: Codex (automated)  
Scope: Services under `packages/core/src/Services` plus workflow orchestration. Focus on simplifying, consolidating, and removing drifted/duplicated paths.

## Current Architecture Snapshot
- **Extraction surfaces**
  - `ExtractionPipeline` (streaming, chunked via `NlpService.streamChunks`, focusing + two-stage LLM, entity resolution merge).
  - `ExtractionPipeline` service (`Services/Extraction.ts`) for single-shot runs with PubSub events.
  - Workflow layer (`Workflow/ExtractionWorkflow` + `Activities`) for resumable/batched runs; uses character chunking and its own entity accumulation.
- **LLM path**
  - Prompt build from `KnowledgeIndex` → `render*` → `Llm.extractKnowledgeGraphTwoStage` (entities then triples) → `RdfService` → optional SHACL → merge via `EntityResolution`.
- **Stateful helpers**
  - `EntityDiscoveryService` (per-run cache), `OntologyCache` (KnowledgeIndex cache), `RunService`/`Database`/`ArtifactStore` for persistence, `WorkflowManager` for fibers.
- **Support**
  - `NlpService` (wink-nlp + BM25), `FocusingService` (keyword/BM25 relevance), `PropertyFilteringService` (fallback vocabulary pruning), chunking utilities, provider layers.

### Flow Diagram (happy path)
```
Input text
  └─> Chunker (Nlp semantic or char)
       └─ per chunk:
           ├─ EntityDiscovery snapshot (run state)
           ├─ Focusing (BM25 over KnowledgeIndex) -> focused index
           ├─ Prompt render (+ optional dynamic few-shot)
           ├─ LLM Stage 1: entities
           ├─ LLM Stage 2: triples constrained by entities/vocabulary
           ├─ RDF conversion (+ datatype inference)
           └─ EntityDiscovery update
  └─> Graph merge + entity resolution (label-based) -> Turtle
  └─> SHACL validation (single-shot pipeline only)
  └─> Persist artifacts / checkpoints (workflow path)
```

## Service-by-Service Notes (refactor/cleanup targets)
- **Chunking (`ChunkingStrategy`, `ExtractionWorkflow.chunkText`, `ExtractionPipeline`)**
  - Three different chunkers (semantic stream, character window, strategy helpers) diverge. Consolidate on `ChunkingStrategy` with NLP-backed semantic default and remove bespoke character splitter in workflow.
  - Expose chunk metadata (sentence offsets) once, reuse across pipelines/tests.
- **NlpService**
  - Very broad surface (sentences, verbs, BM25, embeddings, hybrid MMR). Consider trimming to the handful of operations actually used (sentencize, streamChunks, BM25 search, lemmas) and hiding experimental selectors behind an optional module.
  - Error channel is `NlpError` but some methods still return `unknown` upstream; tighten signatures.
- **FocusingService**
  - Currently keyword-overlap despite BM25 comment; no typed errors. Move BM25 creation/search here, return ranked context + rationale, and make it deterministic (stable limit, tie-breaking).
  - Co-locate with property filtering (single “ContextSelection” module) to avoid two relevance systems.
- **PropertyFilteringService**
  - Default layer is overwritten via `Object.defineProperty`, which can confuse DI and testing. Replace with explicit `Live` layer export and keep auto-generated `Default` untouched.
  - Exists only as fallback when focused vocabulary is null; decide to either integrate into main vocabulary builder or drop.
- **LlmService**
  - Monolithic file with deprecated single-stage APIs, duplicated logging (`LLM triple extraction call started` logged twice at lines ~655-668), heavy instrumentation, and unsafe `as unknown as` casts for vocabulary.
  - Split into smaller modules: prompt rendering helpers, entity stage, triple stage, telemetry. Delete deprecated `extractKnowledgeGraph*` wrappers once callers are migrated.
  - Centralize retry/timeout policy and schema generation.
- **ExtractionPipeline (streaming)**
  - Does not call `EntityDiscoveryService.cleanup(runId)` on completion/failure (leaks per-run caches).
  - Rebuilds KnowledgeIndex every run instead of using `OntologyCache`; chunk loop duplicates logic from workflow activities.
  - Add finalizers around per-run services (discovery/focusing indexes) and consider moving merge to an external “BatchAssembler” so pipelines share one path.
- **Extraction service (`Services/Extraction.ts`)**
  - Second orchestrator with its own vocabulary selection and PubSub events. High overlap with streaming pipeline but diverging options (context strategies, dynamic examples, SHACL). Recommend collapsing into a single orchestrator with pluggable stages (focusing strategy, validation on/off, event sink).
- **EntityDiscoveryService**
  - Run-scoped state keyed in a Ref with no eviction/cleanup; absent finalizers in both pipelines and workflows. Add scoped constructor or explicit `cleanup` calls; consider moving to pure accumulator returned by pipeline to simplify concurrency.
- **EntityResolution**
  - Parses every chunk output twice (parse + final store) and uses label-only dedupe. Consider moving skolemization/dedup into RDF conversion stage and letting caller pass canonical IRI strategy; expose a pluggable resolution policy (label, embeddings, none).
- **Chunking/Resolution duplication in Workflow Activities**
  - Activities implement their own chunking, prompting, and entity registration loops (character-based, sequential) that diverge from streaming pipeline. Refactor to call the same chunker + extraction worker as streaming path and keep workflow limited to persistence/checkpoint concerns.
- **RunService/Database/ArtifactStore**
  - Default DB layer is in-memory (`DatabaseLive`), while workflow paths expect persistence. Make file-backed layer the default in production bundles and gate in-memory to tests.
  - Artifact paths + base dir are hardcoded (`extraction_data`); surface as config and add size/retention guards.
- **WorkflowManager**
  - Tracks fibers but does not attach cleanup for `EntityDiscovery`/indexes; ensure workflows provide a finalizer bundle and always interrupt children on scope exit.
- **OntologyCache**
  - Only used by workflow activities. Reuse it inside streaming pipelines to avoid recomputing KnowledgeIndex per request; promote to shared dependency in orchestrator.

## Simplification Plan (proposed order)
1) **Unify orchestrators**: Extract a single `ExtractionRunner` that accepts strategy hooks (chunking, focusing, vocab source, validation, event sink) and reuse in streaming, single-shot, and workflow paths. Remove duplicated prompt/LLM/RDF code from Activities/Extraction.ts.
2) **Consolidate chunking/context**: Standardize on `ChunkingStrategy` + `FocusingService` (BM25-backed) with shared vocabulary builder. Drop character splitter in `ExtractionWorkflow` and the fallback-only property filter unless integrated.
3) **Scope & cleanup**: Make `EntityDiscoveryService` scoped with auto-cleanup; ensure workflows and pipelines call cleanup/finalizers. Add config for cache TTL and max entries.
4) **Slim Llm layer**: Remove deprecated APIs, fix duplicate logging, separate telemetry from business logic, and codify retry/timeout policy in one place.
5) **Persistence/config hygiene**: Default to file-backed DB and configurable artifact root; add retention policy knobs for artifacts/checkpoints and validate on startup.
