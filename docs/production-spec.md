# Extraction Pipeline Production Spec

## Current Architecture (as-built)
- Single-shot pipeline: prompt render → LLM structured extraction → RDF conversion → (optional) SHACL validation → Turtle output (`packages/core/src/Services/Extraction.ts`).
- Streaming pipeline: sentence windows → concurrent LLM calls → RDF per chunk → label-based merge (`packages/core/src/Services/ExtractionPipeline.ts`, `packages/core/src/Services/EntityResolution.ts`).
- Prompt generation: ontology DAG → knowledge index → structured prompt rendering (`packages/core/src/Prompt/Algebra.ts`, `packages/core/src/Prompt/Solver.ts`, `packages/core/src/Prompt/Render.ts`).
- Schema contract: ontology vocab → Effect Schema for entities (`packages/core/src/Schema/Factory.ts`); RDF conversion with datatype inference from ontology (`packages/core/src/Services/Rdf.ts`).
- LLM abstraction: provider-agnostic Layer (`packages/core/src/Services/LlmProvider.ts`) and guarded extraction (timeout, retries) (`packages/core/src/Services/Llm.ts`).
- Manual runner: local script for real Anthropic run (`packages/core/scripts/test-real-extraction.ts`).

## Observations & Gaps
- Run lifecycle: no run id, status, persistence, or resumability; PubSub/Ref state lives only in-memory.
- Ingestion: accepts raw text only; no provenance, dedup, or backpressure at the source boundary.
- Streaming: currently skips SHACL validation per chunk and on merged graph; observability limited to console logs.
- Throughput control: only per-request timeout + retry; no token/QPS budgeting, circuit breaking, or provider-aware rate limits.
- Entity resolution: label-only, in-memory cache; no durable registry, no sameAs/identifier matching, no confidence tracking.
- Context control: streaming always renders full index; no adaptive pruning/focus or prompt size guardrails.
- Storage: no sink to object store/triple store; Turtle output is transient.

## Production Recommendations

### Run Orchestration & Durability
- Add `RunService` (Layer) to allocate run ids, persist status (queued/running/succeeded/failed/cancelled), checkpoints (chunk offsets), and artifacts (prompt hash, schema version, Turtle, SHACL report when enabled).
- Introduce durable workflow executor with `@effect/workflow` for retries, timers, and idempotent activities:
  - Activities: chunking, LLM extract, RDF convert, validation, persistence, notifications.
  - Timers: backoff for rate limits, resume after failures, SLA alarms.
  - Determinism: store command log and replay state for exactly-once run transitions.
- Expose cancellation and resume; emit events to the run log (in addition to PubSub).

### Ingestion & Provenance
- Wrap inputs in a `Stream`/`Channel` that accepts sources (files/URLs/queue messages) with provenance (uri, byte range, checksum).
- Add ingestion dedup (content hash), size guards, and PII scrubbing before LLM.
- Persist chunk manifest with window indices to support replay without re-splitting.

### Throughput, Cost, and Reliability Controls
- Add provider-aware rate limiter plus `Semaphore` around `LanguageModel.generateObject` (QPS/token window, concurrency caps).
- Add circuit breaker for upstream failures; surface metrics and open/half-open state to logs.
- Make timeout/retry budgets configurable per run; enforce max tokens and cost ceilings.

### Context & Prompt Management
- Cache rendered KnowledgeIndex per ontology version; hash renders to avoid rework.
- Apply focus pruning in streaming path (reuse `Prompt/Focus.ts`) with depth/size limits; allow strict schema mode when ontology metadata is rich and fallback loose for ambiguous vocabularies.
- Add prompt size sentinel (character/token budget) to fail fast before API call.

### Entity Registry & Resolution
- Persist `EntityCache` across runs (label hash + key properties); record confidence, provenance chunk, and sameAs/identifier hints.
- Use identifier-based matching first (email/uri), then label similarity; log resolution decisions.
- Expose canonical map to downstream sinks and for prompt context seeding.

### Validation Strategy (SHACL)
- Keep current behavior (skip in streaming) for latency; add optional batch validator:
  - Per-chunk fast validation gate (toggleable).
  - Post-merge batch validator before publishing to sinks.
  - Dead-letter queue for non-conformant chunks with reasons.

### Storage & Sinks
- Add pluggable sinks: object store (Turtle, JSONL entities, SHACL reports), and triple store ingestion (e.g., Blazegraph/Fuseki) via a sink Layer.
- Persist schemas and prompts alongside outputs for auditability.

### Observability & Ops
- Integrate structured logging and tracing (`Effect.log`, `@effect/opentelemetry`) with spans for chunking, LLM, RDF, validation, persistence.
- Emit metrics: per-stage latency, token usage, retries, failure causes, rate-limit opens, cost per run.
- Health checks: upstream provider reachability, ontology/schema cache status, sink availability.

## Production Readiness Checklist
- [ ] Run orchestration: run id, status transitions, resume/cancel, checkpoints.
- [ ] Durable workflow execution (`@effect/workflow`) for retries/timers/idempotence.
- [ ] Ingestion: provenance, dedup, size/PII guards, manifest.
- [ ] Rate limiting & circuit breaking around LLM calls; configurable budgets.
- [ ] Prompt controls: focus pruning, size guardrails, cached renders.
- [ ] Entity registry: durable cache, confidence, identifier-aware resolution.
- [ ] Validation plan: optional per-chunk gate, post-merge batch SHACL.
- [ ] Storage sinks: object store + triple store; artifacts versioned.
- [ ] Observability: structured logs, traces, metrics dashboard; alerting on error budgets.
- [ ] Operational runbook: backfill/retry flows, dead-letter handling, key rotation.

## Effect API Touchpoints (current)
- Concurrency/streams: `Stream.mapEffect` with configurable `concurrency` (`packages/core/src/Services/ExtractionPipeline.ts`).
- Backoff/timeout: `Schedule.exponential` + `Effect.timeout` around LLM calls (`packages/core/src/Services/Llm.ts`).
- PubSub events for UI: `PubSub.unbounded` broadcasting pipeline stages (`packages/core/src/Services/Extraction.ts`).
- Layers for DI: provider selection (`packages/core/src/Services/LlmProvider.ts`), Rdf/SHACL services.
- Schema-driven validation: dynamic schemas via Effect Schema (`packages/core/src/Schema/Factory.ts`).

## Effect Workflow Strategy (@effect/workflow)
- Model a run as a workflow with deterministic command log; activities wrap side effects (NLU chunking, LLM call, storage write).
- Use workflow timers for retry/backoff and SLA alarms; keep activity timeouts short and idempotent.
- Store workflow state in durable storage (SQL/KV); expose queries for run status and history.
- Provide signals to cancel/resume runs; ensure activities are designed to be replay-safe (idempotent by design or via run/step ids).

## Risk/Robustness Notes
- Token/rate exhaustion is the primary throughput limiter; enforce budgets and fall back to lower-cost models when needed.
- Ontology drift: hash ontology + schema and store with outputs; invalidate prompt cache on change.
- Entity collision risk remains without durable registry; adding identifier-based resolution is high priority.
- SHACL remains off in streaming; plan batch validation before publishing to shared sinks.

## Near-Term Implementation Order
1) Add RunService + workflow-backed orchestration (ids, status, checkpoints).
2) Add provider rate limiter + circuit breaker around LLM calls.
3) Add storage sinks (object store + triple store) and persist artifacts.
4) Enable focus pruning + prompt size guardrails in streaming path.
5) Introduce durable entity registry with identifier-aware resolution.
6) Add optional post-merge SHACL validation job before publish.
