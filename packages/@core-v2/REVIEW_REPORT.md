# Code Review Report: @core-v2

## Overview
The `@core-v2` package implements an Effect-native knowledge extraction framework. It features a robust architecture leveraging the `Effect` ecosystem for concurrency, error handling, and schema validation.

## Key Findings

### 1. Architecture & Design
-   **Modular Structure**: The codebase is well-organized into `Domain`, `Schema`, `Service`, and `Workflow` layers. This separation of concerns enhances maintainability.
-   **Effect Integration**: The use of `Effect` is pervasive and idiomatic. Features like `Effect.gen`, `Effect.service`, and `Layer` are used effectively to manage dependencies and side effects.
-   **Streaming Pipeline**: The `streamingExtraction` workflow implements a sophisticated 6-phase pipeline (Chunk -> Mention -> Class Retrieval -> Entity -> Property Scoping -> Relation -> Merge). It uses `Stream` and bounded concurrency to handle large documents efficiently.

### 2. Robustness & Reliability
-   **Error Isolation**: In `streamingExtraction`, individual chunk processing is wrapped in `Effect.either`. This prevents a failure in one text chunk from crashing the entire extraction process, which is a critical feature for processing large documents.
-   **Retry Logic**: `generateObjectWithFeedback` implements a retry mechanism with feedback loops, improving the reliability of LLM interactions.
-   **Type Safety**: `Schema` (from `effect/Schema`) is used extensively for runtime validation of LLM outputs. This ensures that the data flowing through the system matches the expected domain models.

### 3. Observability
-   **Telemetry**: The code is heavily instrumented with `Effect.log` and `Effect.withSpan`. Custom attributes (e.g., `LlmAttributes`) are used to track token usage, prompt lengths, and extraction statistics, which is excellent for debugging and monitoring.

### 4. Gaps & Concerns

#### Usability
-   **Hardcoded Configuration**:
    -   In `Workflow/StreamingExtraction.ts`, `maxChunkSize` is hardcoded to `500`. This might need to be configurable based on the input text type or LLM context window.
    -   `src/main.ts` contains a hardcoded file path: `/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl`. This makes the example non-portable.
-   **Concurrency Control**: While `streamingExtraction` accepts a `concurrency` argument, other internal limits (like `concurrency: 5` for semantic search) are hardcoded.

#### Code Quality
-   **Unused Variables**: There are instances where variables are defined but not used (silenced with `void variableName`). While this suppresses warnings, it might indicate unfinished features or legacy code (e.g., `datatypeProperties` in `EntityFactory.ts`).
-   **Test Coverage**: While `EntityResolution` has detailed tests, the `StreamingExtraction` workflow itself (the most complex part) relies on integration tests that might be brittle if they depend on real LLMs (though `TestRuntime` seems to exist).

#### Test Failures
Running `bun test` revealed several issues:
-   **Ontology Tests**: `OntologyService - Football Ontology` tests fail due to `OntologyFileNotFound` error. The path `/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl` is hardcoded in `Ontology.test.ts` or the service setup.
-   **RdfBuilder**: `RdfBuilder > Resource management > should clean up store after scope` fails because `expect(storeSize).toBeGreaterThan(0)` receives a non-numeric value or undefined.
-   **Environment Issues**: Some tests fail with `Cannot find package 'test'`, suggesting configuration issues with the test runner or environment.

#### Potential Bugs/Edge Cases
-   **Entity ID Generation**: The `generateEntityId` function creates IDs by lowercasing and replacing spaces. While simple, it might lead to collisions for distinct entities with similar names (e.g., "The Rock" vs "The_Rock").
-   **Memory Usage**: The `streamingExtraction` workflow accumulates `graphFragments` in memory before merging. For extremely large documents, holding all fragments in memory might be an issue, although `Stream.runFold` mitigates this for the final merge.

## Recommendations
1.  **Externalize Configuration**: Move hardcoded values like `maxChunkSize` and internal concurrency limits to a configuration object or service.
2.  **Fix Hardcoded Paths**: Update `main.ts` and test files to use relative paths or environment variables for locating ontology files.
3.  **Review ID Generation**: Consider a more robust ID generation strategy or collision detection.
4.  **Fix Tests**: Address the test environment issues and fix the hardcoded paths in the test suite. Investigate the `RdfBuilder` test failure.
5.  **Expand Tests**: Ensure `StreamingExtraction` is tested with mocked services to verify edge cases (e.g., all chunks failing, empty text) without incurring LLM costs.

## Conclusion
The `@core-v2` package is a high-quality, modern TypeScript project. It demonstrates advanced usage of the `Effect` library to solve a complex problem (knowledge extraction). The identified gaps are mostly related to configuration flexibility, test portability, and environment setup.
