# Effect Application Patterns

Reference for applying Effect primitives to our application logic. Derived from upstream `effect` sources (`docs/effect-source/effect/src`, `docs/effect-source/platform/src`, `docs/effect-source/typeclass/src`) to give engineering a strong foundation for data flow, concurrency, and service composition.

## Core ideas to emulate
- **Data-first & data-last**: All combinators should be usable via `pipe`. Use `Effect.map/flatMap`, `Effect.all`, and `dual` when exporting helpers.
- **Typed errors, no throws**: Use `Either`/`Option`/typed domain errors. Prefer `Effect.fail` and `Effect.mapError` over `throw`.
- **Resource safety**: Use `Effect.scoped` and `Effect.acquireRelease` for clients/stores. Services exposing resources should use `Effect.Service` with `scoped` mode.
- **Deterministic layering**: Publish `Default`/`DefaultWithoutDependencies` on services; compose layers once to avoid double instantiation. Use small bundles (Infra, Core, Workflow) with `Layer.provide`.

## Data flow patterns (from effect-source)
- **Parallel + bounded concurrency**: `Effect.all`/`Effect.forEach` with `{ concurrency, batching }` (see `typeclass/src/data/Effect.ts`). Use for parallel LLM/embedding calls; set `batching: "inherit"` when nesting.
- **Batching/deduping requests**: Model external calls as `Request` classes and resolve with `RequestResolver.makeBatched`/`makeWithEntry` (`effect/src/Request.ts`, `RequestResolver.ts`). Combine with `Cache.make` to memoize prompt/schema + input.
- **Streaming**: Use `Stream`/`Channel` for incremental workloads (document chunking, streaming extraction). Compose with `mapEffect`, `tap`, `grouped`, `debounce`, `takeWhile` to control flow and backpressure.
- **Coordination**: Use `Deferred` for rendezvous and `Queue` for producer/consumer pipelines; `Ref`/`Ref.Synchronized` for shared mutable state; `FiberRef` for contextual defaults.
- **Retry/timeout policies**: Apply `Effect.timeout`, `Effect.retry` with `Schedule` (exponential/backoff/jitter) for flaky I/O; avoid manual loops.
- **Tracing/logging**: Attach spans and log annotations via `Effect.withSpan`, `Layer.annotateLogs/annotateSpans`, and `Tracer` so services emit structured telemetry.

## Service implementation guidance
- Define services with `Effect.Service` (`effect/src/Effect.ts` ~13534+):
  - `sync` for stateless helpers (tokenization, schema building).
  - `effect` for async init or dependency-bearing services (LLM, ontology).
  - `scoped` for resources needing cleanup (N3 stores, HTTP clients).
  - `succeed` for static config.
- Always enable `accessors: true` unless there’s a reason not to; consume via `yield* Service.method(...)`.
- Export `DefaultWithoutDependencies` (auto) and `Default` (with deps). Use `Layer.provide` to override implementations cleanly.

## Domain modeling
- Keep domain modules pure: branded `TypeId`s, `readonly` shapes, schemas for validation/serialization, no I/O.
- Put dynamic schema builders in `Schema/`, and keep prompt/LLM wiring in services/workflows.
- Implement `Inspectable`/`toJSON` for domain types and errors where debugging matters (`effect/src/Inspectable.ts` pattern).

## Workflow composition examples
- **Two-stage extraction**: Use `Effect.gen` + service accessors; guard early exits with `Option`/length checks; wrap RDF building in `Effect.scoped` so stores close.
- **Streaming extraction**: Build as `Stream` pipeline (chunk text → mapEffect to extraction → tap for metrics → takeWhile on budget).
- **Batch jobs**: Use `Effect.forEach` with concurrency limits; include `Schedule` retries around external calls; log spans per batch.

## Testing expectations
- Accessor smoke tests for each `Effect.Service` (call generated accessor).
- Layer build tests using `Layer.build`/`Layer.launch` to catch missing deps.
- Property/fixture tests on pure domain modules; golden tests on workflow outputs.
- Resolver tests for `RequestResolver` batching/deduping paths with small fixtures.
