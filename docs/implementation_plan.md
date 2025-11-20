# Implementation Plan: End-to-End Extraction Studio

## Goal

Transform the current **Ontology Editor** into a fully functional **Extraction Studio** that allows users to input unstructured text, run the extraction pipeline against their ontology, and view validated results in real-time.

## User Review Required

> [!IMPORTANT] > **Streaming Strategy**: The current `LanguageModel` usage is blocking. We will implement a "Stream of Molecules" approach where the UI receives events (`LLMThinking`, `JSONParsed`) but the text generation itself might remain blocking in the first iteration unless we switch to `streamText`.
> **Chunking**: Large texts will be split into chunks. Cross-chunk entity resolution (smushing) is out of scope for MVP and will be handled by simple concatenation of RDF graphs.
> **NLP Layer**: We will introduce a dedicated `NlpService` wrapped as an Effect Service, using `wink-nlp` for fast client-side operations (sentencizing, tokenization).

## Proposed Changes

### 1. Core Enhancements (`packages/core`)

#### [NEW] `src/Services/Nlp.ts`

- **Purpose**: A lightweight service for fast NLP operations.
- **Interface**:
  - `sentencize(text: string): Effect<string[]>`
  - `tokenize(text: string): Effect<string[]>`
  - `extractKeywords(text: string): Effect<string[]>`
- **Implementation**: `WinkNlpService` using `wink-nlp` and `wink-eng-lite-web-model`.

#### [NEW] `src/Extraction/Chunking.ts`

- **Purpose**: Split large input texts into manageable windows for the LLM.
- **Logic**: Semantic splitting using `NlpService` (sentences) with overlap.

#### [MODIFY] `src/Services/Extraction.ts`

- **Update**: `extract` method to handle multiple chunks.
- **Update**: Emit events for _each_ chunk processed.
- **New**: `extractStream` method (future) to return `Stream<ExtractionEvent>`.

### 2. State Management (`packages/ui/src/state`)

#### [NEW] `extraction.ts`

- **Atoms**:
  - `inputTextAtom`: The unstructured text input.
  - `extractionStatusAtom`: Idle | Running | Complete | Error.
  - `extractionResultsAtom`: List of `{ chunkId, json, rdf, report }`.
  - `combinedResultAtom`: Merged RDF and aggregated Validation Report.

### 3. UI Components (`packages/ui/src/components`)

#### [NEW] `ExtractionPanel.tsx`

- **Location**: New tab or split view in the Right Panel.
- **Features**:
  - `TextArea` for input.
  - `Run Extraction` button (disabled if Ontology is invalid).
  - `ProgressBar` linked to pipeline events.

#### [NEW] `ResultsViewer.tsx`

- **Features**:
  - **Tabs**:
    - **JSON**: View raw extracted entities.
    - **Turtle**: View the resulting RDF graph.
    - **Validation**: View SHACL report (Green/Red indicators).
  - **Visuals**: Use `EnhancedNodeInspector` style for entity details.

### 4. Integration (`packages/ui/src`)

#### [MODIFY] `App.tsx`

- **Layout**: Add a mode switcher or new panel to accommodate the Extraction workflow.
- **Wiring**: Connect `ExtractionPanel` to `extraction.ts` atoms.

## Verification Plan

### Automated Tests

- **Unit**: Test `Chunking.ts` logic with mocked NlpService.
- **Integration**: Test `WinkNlpService` with real text.

### Manual Verification

1.  **Load Ontology**: Use the default "Zoo" ontology.
2.  **Input Text**: Paste a paragraph about animals (e.g., "Fido is a Dog owned by Alice.").
3.  **Run**: Click Extract.
4.  **Verify**:
    - Status changes to "Thinking...".
    - JSON output appears: `{"@type": "Dog", "name": "Fido"}`.
    - Turtle output appears: `:Fido a :Dog`.
    - Validation passes (Green).
5.  **Negative Test**: Input text that violates constraints (e.g., "Fido is a Dog with 5 names" if maxCardinality=1). Verify SHACL error report.
