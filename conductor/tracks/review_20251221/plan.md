# Plan: Effect Code Review & Refactoring

## Phase 1: Analysis & Reporting
- [x] Task: Scan `packages/@core-v2/src` for Effect anti-patterns (e.g., deeply nested pipes, `runPromise` in business logic, lack of `Effect.gen`). 8cc17eb
- [x] Task: Compile a prioritized list of files or modules requiring refactoring. 8cc17eb
- [ ] Task: Conductor - User Manual Verification 'Analysis & Reporting' (Protocol in workflow.md)

## Phase 2: Domain Layer Refactoring
- [ ] Task: Refactor Domain schemas and models to strictly use `Effect.Schema` and branded types where applicable.
- [ ] Task: Ensure all Domain functions are pure and free of side effects (referential transparency).
- [ ] Task: Conductor - User Manual Verification 'Domain Layer Refactoring' (Protocol in workflow.md)

## Phase 3: Service Layer Refactoring
- [ ] Task: Update Service definitions to use `Effect.Tag` and `Context` correctly.
- [ ] Task: Refactor Service implementations to use `Effect.gen` for readability and error handling.
- [ ] Task: Ensure proper Layer construction and composition.
- [ ] Task: Conductor - User Manual Verification 'Service Layer Refactoring' (Protocol in workflow.md)

## Phase 4: Workflow & Runtime Refactoring
- [ ] Task: Refactor high-level workflows to leverage structured concurrency (`Effect.all`, `Effect.forEach`) efficiently.
- [ ] Task: Verify resource management (scopes) in the Runtime layer.
- [ ] Task: Conductor - User Manual Verification 'Workflow & Runtime Refactoring' (Protocol in workflow.md)
