# Effect Module Style Guide

Codifies how we write Effect-style modules in this repo, mirroring upstream `effect` (`docs/effect-source/effect/src`) and related packages (`docs/effect-source/platform/src`, `docs/effect-source/typeclass/src`). Use this as the baseline for new code and for migrating existing modules to the modern `Effect.Service` pattern.

## Sources to mirror
- `docs/effect-source/effect/src/Effect.ts`: `Effect.Service`, Tag proxying, accessor generation, and `Default`/`DefaultWithoutDependencies` layering.
- `docs/effect-source/effect/src/Layer.ts`: Layer composition semantics, memoization, tracing hooks.
- `docs/effect-source/effect/src/Option.ts` (and other data modules): public-vs-internal split, `dual` ergonomics, JSDoc categories.
- `docs/effect-source/effect/src/Inspectable.ts`: `Inspectable`, `toJSON`, and Node inspect hooks.
- `docs/effect-source/platform/src/HttpRouter.ts`: Example of a service Tag with convenience helpers and published live layer.
- `docs/effect-source/typeclass/src/data/Effect.ts`: Typeclass-facing re-exports and namespace patterns.

## Module anatomy
1. **Public facade** (`src/<Module>.ts`): exports types and functions, imports implementation from `./internal/<module>.ts`, and houses docs. No side effects beyond exports.
2. **Internal implementation** (`src/internal/<module>.ts`): real logic, non-exported helpers, data constructors, and side-effecting internals.
3. **Test surface** (`test/<Module>.test.ts`): covers public API only; reach into internals only for unavoidable helpers.

## Documentation contract
- Every export gets `@since` and `@category`; categories mirror upstream (`models`, `constructors`, `destructors`, `guards`, `combinators`, `tracing`, `type-level`, etc.).
- Add a short “When to use” or “Details” paragraph for non-trivial APIs (see `Option.ts`).
- Prefer runnable, minimal examples; keep them pipe-friendly.

## Naming and types
- Use `TypeId`/`TypeIdType` constants for branded data (`Effect.ts`, `Inspectable.ts` pattern).
- All object shapes are `readonly`.
- Disallow excess fields where it matters with `NoExcessProperties`-style helpers for config/service definitions.
- Provide namespace helpers for common derived types (e.g., `Layer.Context`, `Option.Value`).

## Ergonomics: data-first & data-last
- Export functions via `dual` to support pipeable and direct styles without duplicating bodies. Pattern:
  ```ts
  export const myOp = dual<
    <A, B>(f: (a: A) => B) => (self: A) => B,
    <A, B>(self: A, f: (a: A) => B) => B
  >(2, (self, f) => f(self))
  ```
- Keep all exported functions `Pipeable` friendly; avoid bespoke `_`/`$` suffixes.

## Services: `Effect.Service` pattern
- Define services with `Effect.Service<Self>()(key, { effect|sync|scoped|succeed, dependencies?, accessors? })`.
- Enable `accessors: true` to get static, cached proxies (`Effect.ts` Tag proxy at ~13410+).
- Publish **both**:
  - `DefaultWithoutDependencies` (auto-created) for internal composition/overrides.
  - `Default` for downstream users; includes declared `dependencies`.
- Prefer method-based service shapes; keep fields effectful or read-only values.
- Construction modes:
  - `sync` for stateless/sync init.
  - `effect` for async or dependency-bearing init.
  - `scoped` for resources needing release.
  - `succeed` for static configs.

### Layer composition guidelines
- Compose once; don’t double-provide dependencies. Upstream shows `Default` includes deps.
- Publish small layer bundles instead of monoliths:
  ```ts
  // Infra
  export const LlmInfra = Layer.mergeAll(LlmService.Default, NlpService.Default)

  // Core
  export const CoreServices = Layer.mergeAll(
    OntologyService.Default,
    RdfBuilder.Default
  ).pipe(Layer.provide(LlmInfra))

  // Extraction
  export const ExtractionServices = Layer.mergeAll(
    EntityExtractor.Default,
    RelationExtractor.Default
  ).pipe(Layer.provide(LlmInfra))

  export const ProductionLayers = Layer.mergeAll(CoreServices, ExtractionServices)
  ```
- Overrides: provide an alternative impl via `Layer.provide` with `DefaultWithoutDependencies` if you need to rewire deps without re-running upstream deps.

## Public vs internal split
- Public module exports the symbols, re-exporting types and constructors from `internal`.
- Keep private helpers, unsafe bits, and non-API combinators in `internal`.
- Mark internal exports with `@internal` so docgen hides them.

## Inspectability & logging
- Implement `Inspectable` when serializing/debugging matters; provide `toJSON` and `toString`, reusing `formatUnknown`-style helpers from `Inspectable.ts`.
- For errors and domain values, ensure `toJSON` is safe (no throws) and avoids cycles.

## Config & defaults
- Provide a `Config`/`Settings` object via `Effect.Service` with `succeed` or `sync`; publish a `Default` layer so runtimes are runnable without manual wiring.
- Adopt `DefaultServices`-style bundles (see `effect/src/DefaultServices.ts`) to make runnable test and prod runtimes obvious.

## Testing expectations
- Unit tests use `DefaultWithoutDependencies` + explicit dependency layers to avoid accidental implicit deps.
- Add accessor smoke tests (ensure generated accessors call through).
- For services, add a “layer builds” test using `Layer.launch`/`Layer.build` to catch missing deps.

## Domain modeling
- Brand domain types with `TypeId` and `@category Models`.
- Keep domain modules pure (no I/O, no service access); schema builders can live in `Schema/` but avoid embedding service calls.
- Add namespace utilities for derived types (e.g., `Entity.Id`, `Relation.Predicate`).

## Observability hooks
- Expose tracing/logging knobs via service config or Layer annotations (`Layer.annotateLogs/Spans` from `Layer.ts`).
- Avoid burying logging in internals; thread through service methods so runtimes can opt in/out.

## Migration checklist (per module)
- [ ] Public/internal split created.
- [ ] `@since` + `@category` on every export.
- [ ] `TypeId` defined and used where applicable.
- [ ] `dual` applied to data-first/data-last candidates.
- [ ] Service converted to `Effect.Service` with `accessors: true` and proper dependencies.
- [ ] `Default`/`DefaultWithoutDependencies` exported; layering samples added.
- [ ] `Inspectable`/`toJSON` provided for inspectable types/errors.
- [ ] Tests cover accessors, layer build, and key behaviors.
