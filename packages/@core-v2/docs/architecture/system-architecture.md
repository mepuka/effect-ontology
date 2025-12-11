# Effect-Ontology @core-v2 System Architecture

> **Version:** 2.0.0
> **Last Updated:** December 2024
> **Status:** Implementation Complete

## Table of Contents

1. [Overview](#overview)
2. [System Context](#system-context)
3. [Component Architecture](#component-architecture)
4. [Workflow Pipeline](#workflow-pipeline)
5. [Service Layer](#service-layer)
6. [Data Model](#data-model)
7. [Infrastructure](#infrastructure)
8. [Layer Composition](#layer-composition)
9. [API Reference](#api-reference)

---

## Overview

Effect-Ontology is a knowledge graph extraction system that transforms unstructured text into RDF triples using LLM-powered entity and relation extraction, guided by domain ontologies.

### Key Capabilities

- **Ontology-Guided Extraction**: Uses SKOS/OWL ontologies to constrain entity types and relation predicates
- **Durable Workflows**: @effect/workflow-based pipelines with PostgreSQL persistence for crash recovery
- **Batch Processing**: 4-stage pipeline (Extract → Resolve → Validate → Ingest)
- **Entity Resolution**: Graph-based clustering for entity deduplication
- **SHACL Validation**: Optional shape-based constraint checking

---

## System Context

```mermaid
C4Context
    title System Context Diagram

    Person(user, "API Consumer", "Application or service consuming the extraction API")

    System(core, "Effect-Ontology Core", "Knowledge graph extraction service")

    System_Ext(llm, "LLM Provider", "Anthropic/OpenAI/Google AI")
    System_Ext(gcs, "Google Cloud Storage", "Document and graph storage")
    System_Ext(postgres, "PostgreSQL", "Workflow state persistence")

    Rel(user, core, "POST /api/v1/extract", "HTTPS")
    Rel(user, core, "POST /api/v1/batch", "HTTPS")
    Rel(core, llm, "Generate entities/relations", "HTTPS")
    Rel(core, gcs, "Read/write documents and graphs", "HTTPS")
    Rel(core, postgres, "Persist workflow state", "TCP")
```

---

## Component Architecture

```mermaid
graph TB
    subgraph "HTTP Layer"
        API[HTTP Server]
        MW[Middleware<br/>CORS, Logging, Auth]
        HC[Health Check]
    end

    subgraph "Service Layer"
        subgraph "Orchestration"
            WO[WorkflowOrchestrator]
            JM[JobManager]
            ER[ExtractionRun]
        end

        subgraph "Extraction"
            EE[EntityExtractor]
            RE[RelationExtractor]
            GR[Grounder]
        end

        subgraph "Core Services"
            CS[ConfigService]
            SS[StorageService]
            OS[OntologyService]
            RB[RdfBuilder]
        end

        subgraph "LLM Control"
            TB[TokenBudget]
            ST[StageTimeout]
            RL[RateLimiter]
        end
    end

    subgraph "Workflow Layer"
        BW[BatchExtractionWorkflow]
        DA[DurableActivities]
        SE[StreamingExtraction]
        ERS[EntityResolution]
    end

    subgraph "Runtime Layer"
        PR[ProductionRuntime]
        TR[TestRuntime]
        PS[PostgresPersistence]
        WE[WorkflowEngine]
    end

    subgraph "Domain Layer"
        ID[Identity Types]
        PL[PathLayout]
        MD[Domain Models]
        SC[Schemas]
    end

    API --> MW
    MW --> WO
    MW --> JM

    WO --> WE
    WE --> BW
    BW --> DA

    DA --> EE
    DA --> RE
    DA --> GR
    DA --> SS
    DA --> RB

    EE --> OS
    RE --> OS
    GR --> OS

    EE --> TB
    EE --> ST
    EE --> RL

    WE --> PS
    PS --> PostgreSQL[(PostgreSQL)]

    SS --> GCS[(GCS)]
    SS --> Local[(Local FS)]

    style WO fill:#e1f5fe
    style BW fill:#fff3e0
    style PS fill:#f3e5f5
```

---

## Workflow Pipeline

### Batch Extraction Workflow

The core processing pipeline consists of 4 durable stages:

```mermaid
stateDiagram-v2
    [*] --> Pending: start()

    Pending --> Extracting: Load manifest

    Extracting --> Resolving: All documents extracted
    Extracting --> Failed: Extraction error

    Resolving --> Validating: Graphs merged
    Resolving --> Failed: Resolution error

    Validating --> Ingesting: SHACL conforms
    Validating --> Failed: Validation failed

    Ingesting --> Complete: Written to canonical
    Ingesting --> Failed: Ingestion error

    Complete --> [*]
    Failed --> [*]

    note right of Extracting
        Parallel execution
        concurrency: 5
    end note

    note right of Validating
        Optional SHACL
        shapes validation
    end note
```

### Activity Sequence

```mermaid
sequenceDiagram
    participant C as Client
    participant WO as WorkflowOrchestrator
    participant WE as WorkflowEngine
    participant EA as ExtractionActivity
    participant RA as ResolutionActivity
    participant VA as ValidationActivity
    participant IA as IngestionActivity
    participant S as StorageService
    participant PG as PostgreSQL

    C->>WO: start(payload)
    WO->>WE: execute(BatchExtractionWorkflow)
    WE->>PG: Journal workflow start

    Note over WE: Stage 1: Extraction
    loop For each document (parallel x5)
        WE->>EA: makeExtractionActivity
        EA->>S: Read source document
        EA->>S: Write document graph
        WE->>PG: Journal activity complete
    end

    Note over WE: Stage 2: Resolution
    WE->>RA: makeResolutionActivity
    RA->>S: Read all document graphs
    RA->>S: Write merged graph
    WE->>PG: Journal activity complete

    Note over WE: Stage 3: Validation
    WE->>VA: makeValidationActivity
    VA->>S: Read merged graph
    VA->>S: Read SHACL shapes (optional)
    VA->>S: Write validation report
    WE->>PG: Journal activity complete

    Note over WE: Stage 4: Ingestion
    WE->>IA: makeIngestionActivity
    IA->>S: Read validated graph
    IA->>S: Write to canonical store
    WE->>PG: Journal workflow complete

    WE-->>WO: BatchState (Complete)
    WO-->>C: executionId
```

---

## Service Layer

### Service Dependency Graph

```mermaid
graph LR
    subgraph "Entry Points"
        WO[WorkflowOrchestrator]
        JM[JobManager]
    end

    subgraph "Workflow Services"
        ER[ExtractionRun]
        WP[WorkflowPersistence]
    end

    subgraph "Extraction Services"
        EE[EntityExtractor]
        RE[RelationExtractor]
        GR[Grounder]
        NLP[NlpService]
    end

    subgraph "Core Services"
        CS[ConfigService]
        SS[StorageService]
        OS[OntologyService]
        RB[RdfBuilder]
    end

    subgraph "LLM Stack"
        LM[LanguageModel]
        LR[LlmWithRetry]
        LS[LlmSemaphore]
        CB[CircuitBreaker]
    end

    subgraph "LLM Control"
        TB[TokenBudgetService]
        ST[StageTimeoutService]
        RL[CentralRateLimiter]
    end

    WO --> WE[WorkflowEngine]
    WO --> SS

    JM --> ER
    ER --> EE
    ER --> RE
    ER --> GR

    EE --> LR
    RE --> LR
    GR --> LR

    LR --> LM
    LR --> LS
    LR --> CB

    EE --> TB
    EE --> ST
    EE --> RL

    EE --> OS
    RE --> OS
    GR --> NLP

    OS --> RB
    OS --> SS

    RB --> CS
    SS --> CS
    NLP --> CS

    style WO fill:#bbdefb
    style EE fill:#c8e6c9
    style CS fill:#fff9c4
```

### Service Specifications

| Service | Purpose | Layer | Dependencies |
|---------|---------|-------|--------------|
| `WorkflowOrchestrator` | High-level batch workflow API | Service | WorkflowEngine |
| `JobManager` | Async job submission/polling | Service | ExtractionRun |
| `ExtractionRun` | Single extraction state machine | Service | EntityExtractor, RelationExtractor, Grounder |
| `EntityExtractor` | LLM-based named entity recognition | Service | LanguageModel, OntologyService |
| `RelationExtractor` | LLM-based relation extraction | Service | LanguageModel, OntologyService |
| `Grounder` | Entity grounding/linking | Service | NlpService, OntologyService |
| `ConfigService` | Centralized configuration | Core | Environment |
| `StorageService` | Abstracted storage (GCS/Local/Memory) | Core | ConfigService |
| `OntologyService` | SKOS/OWL ontology operations | Core | RdfBuilder, StorageService |
| `RdfBuilder` | RDF parsing/serialization (N3.js) | Core | ConfigService |

---

## Data Model

### Branded Identity Types

```mermaid
classDiagram
    class BatchId {
        +String value
        +Pattern: batch-[a-f0-9]{12}
    }

    class DocumentId {
        +String value
        +Pattern: doc-[a-f0-9]{12}
    }

    class GcsUri {
        +String value
        +Pattern: gs://bucket/path
    }

    class OntologyVersion {
        +String value
        +Pattern: namespace/name@[a-f0-9]{16}
    }

    class Namespace {
        +String value
        +Pattern: [a-z][a-z0-9-]*
    }
```

### BatchState Union Type

```mermaid
classDiagram
    class BatchState {
        <<union>>
    }

    class Pending {
        +_tag: "Pending"
        +batchId: BatchId
        +manifestUri: GcsUri
        +ontologyVersion: OntologyVersion
        +createdAt: DateTime
    }

    class Extracting {
        +_tag: "Extracting"
        +...Pending fields
        +documentsTotal: number
        +documentsCompleted: number
    }

    class Resolving {
        +_tag: "Resolving"
        +...fields
        +documentGraphUris: GcsUri[]
    }

    class Validating {
        +_tag: "Validating"
        +...fields
        +resolvedGraphUri: GcsUri
    }

    class Ingesting {
        +_tag: "Ingesting"
        +...fields
        +validatedGraphUri: GcsUri
        +conforms: boolean
    }

    class Complete {
        +_tag: "Complete"
        +...fields
        +canonicalGraphUri: GcsUri
        +stats: BatchStats
        +completedAt: DateTime
    }

    class Failed {
        +_tag: "Failed"
        +...fields
        +error: string
        +failedAt: DateTime
        +stage: string
    }

    BatchState <|-- Pending
    BatchState <|-- Extracting
    BatchState <|-- Resolving
    BatchState <|-- Validating
    BatchState <|-- Ingesting
    BatchState <|-- Complete
    BatchState <|-- Failed
```

### Storage Path Layout

```mermaid
graph TD
    ROOT["📁 Storage Root"]

    ROOT --> BATCHES["📁 batches/"]
    ROOT --> DOCS["📁 documents/"]
    ROOT --> CANON["📁 canonical/"]
    ROOT --> ONTOS["📁 ontologies/"]

    BATCHES --> BATCH_ID["📁 batch-id/"]
    BATCH_ID --> MANIFEST["📄 manifest.json"]
    BATCH_ID --> STATUS["📄 status.json"]
    BATCH_ID --> RESOL["📁 resolution/"]
    BATCH_ID --> VALID["📁 validation/"]
    BATCH_ID --> BATCH_CANON["📁 canonical/"]

    RESOL --> MERGED["📄 merged.ttl"]
    VALID --> VALID_GRAPH["📄 graph.ttl"]
    VALID --> REPORT["📄 report.json"]
    BATCH_CANON --> BATCH_ENTITIES["📄 entities.ttl"]

    DOCS --> DOC_ID["📁 doc-id/"]
    DOC_ID --> INPUT["📄 input.txt"]
    DOC_ID --> DOC_GRAPH["📄 graph.ttl"]

    CANON --> NS["📁 namespace/"]
    NS --> NS_ENTITIES["📄 entities.ttl"]
    NS --> NS_RELATIONS["📄 relations.ttl"]

    ONTOS --> ONT_NS["📁 namespace/"]
    ONT_NS --> ONTOLOGY["📄 ontology.ttl"]
    ONT_NS --> SHAPES["📄 shapes.ttl"]
```

---

## Infrastructure

### GCP Architecture

```mermaid
graph TB
    subgraph "Google Cloud Platform"
        subgraph "Compute"
            CR[Cloud Run<br/>effect-ontology-core]
            CE[Compute Engine<br/>e2-micro<br/>PostgreSQL 15]
        end

        subgraph "Storage"
            GCS[Cloud Storage<br/>effect-ontology-prod]
            SM[Secret Manager<br/>API Keys]
        end

        subgraph "Networking"
            VPC[VPC Network]
            CONN[VPC Connector]
            FW[Firewall Rules]
        end
    end

    subgraph "External"
        LLM[LLM Providers<br/>Anthropic/OpenAI]
        CLIENT[API Clients]
    end

    CLIENT -->|HTTPS| CR
    CR -->|HTTPS| LLM
    CR -->|HTTPS| GCS
    CR -->|Read| SM
    CR -->|TCP via VPC| CONN
    CONN --> VPC
    VPC --> CE
    FW -->|Allow 5432| CE

    style CR fill:#4285f4,color:#fff
    style CE fill:#34a853,color:#fff
    style GCS fill:#fbbc04,color:#000
```

### Terraform Module Structure

```mermaid
graph TD
    subgraph "infra/"
        MAIN[main.tf]
        VARS[variables.tf]
        OUT[outputs.tf]

        subgraph "modules/"
            CR_MOD[cloud_run/]
            STORAGE_MOD[storage/]
            PG_MOD[postgres/]
            SECRETS_MOD[secrets/]
        end
    end

    MAIN --> CR_MOD
    MAIN --> STORAGE_MOD
    MAIN --> PG_MOD
    MAIN --> SECRETS_MOD

    CR_MOD --> CR_RES[google_cloud_run_v2_service]
    STORAGE_MOD --> GCS_RES[google_storage_bucket]
    PG_MOD --> CE_RES[google_compute_instance]
    PG_MOD --> VPC_RES[google_compute_network]
    SECRETS_MOD --> SM_RES[google_secret_manager_secret]
```

### Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM backend (anthropic/openai/google) | anthropic |
| `LLM_MODEL` | Model identifier | claude-3-haiku-20240307 |
| `LLM_API_KEY` | API key (from Secret Manager) | required |
| `STORAGE_TYPE` | Storage backend (gcs/local/memory) | local |
| `STORAGE_BUCKET` | GCS bucket name | - |
| `ONTOLOGY_PATH` | Path to ontology file | required |
| `POSTGRES_HOST` | PostgreSQL host | localhost |
| `POSTGRES_PORT` | PostgreSQL port | 5432 |
| `POSTGRES_DATABASE` | Database name | workflow |
| `POSTGRES_USER` | Database user | workflow |
| `POSTGRES_PASSWORD` | Database password (secret) | required |

---

## Layer Composition

### Effect Layer Stack

```mermaid
graph TB
    subgraph "Application Layer"
        APP[Application Program]
    end

    subgraph "HTTP Layer"
        HTTP[HttpServer.Default]
    end

    subgraph "Orchestration Layer"
        WO_LAYER[WorkflowOrchestratorFullLive]
        WO_IMPL[WorkflowOrchestratorLive]
        BW_LAYER[BatchExtractionWorkflowLayer]
    end

    subgraph "Workflow Engine Layer"
        WE_MEM[WorkflowEngine.layerMemory<br/>Tests/Dev]
        WE_PG[ClusterWorkflowEngine<br/>Production]
    end

    subgraph "Persistence Layer"
        PG_LIVE[PostgresPersistenceLive]
        MSG[SqlMessageStorage]
        RUN[SqlRunnerStorage]
        PG_CLIENT[PgClient]
    end

    subgraph "Service Layers"
        EXTRACT[EntityExtractor.Default<br/>RelationExtractor.Default]
        GROUNDER[Grounder.Default]
        CORE[StorageService.Default<br/>OntologyService.Default<br/>RdfBuilder.Default]
        CONFIG[ConfigService.Default]
    end

    subgraph "LLM Layers"
        LLM_CTRL[LlmControlLayers<br/>TokenBudget + Timeout + Rate]
        LLM_MODEL[LanguageModel.layer]
    end

    subgraph "Platform Layer"
        BUN[BunContext.layer]
    end

    APP --> HTTP
    HTTP --> WO_LAYER
    WO_LAYER --> WO_IMPL
    WO_LAYER --> BW_LAYER

    WO_IMPL --> WE_MEM
    WO_IMPL --> WE_PG

    WE_PG --> PG_LIVE
    PG_LIVE --> MSG
    PG_LIVE --> RUN
    MSG --> PG_CLIENT
    RUN --> PG_CLIENT

    BW_LAYER --> EXTRACT
    BW_LAYER --> CORE

    EXTRACT --> GROUNDER
    EXTRACT --> LLM_CTRL
    EXTRACT --> LLM_MODEL

    CORE --> CONFIG
    CONFIG --> BUN

    style WO_LAYER fill:#e3f2fd
    style PG_LIVE fill:#f3e5f5
    style CONFIG fill:#fff8e1
```

### Test vs Production Layers

```mermaid
graph LR
    subgraph "Test Configuration"
        T_WE[WorkflowEngine.layerMemory]
        T_SS[StorageServiceTest<br/>In-memory Map]
        T_EE[EntityExtractor.Test<br/>Deterministic stub]
        T_RE[RelationExtractor.Test<br/>Deterministic stub]
        T_GR[Grounder.Test<br/>Always pass]
        T_LM[MockLanguageModel<br/>Empty responses]
        T_CS[ConfigServiceTest<br/>DEFAULT_CONFIG]
    end

    subgraph "Production Configuration"
        P_WE[ClusterWorkflowEngine<br/>PostgreSQL-backed]
        P_SS[StorageService.Default<br/>GCS/Local]
        P_EE[EntityExtractor.Default<br/>LLM-powered]
        P_RE[RelationExtractor.Default<br/>LLM-powered]
        P_GR[Grounder.Default<br/>Embedding-based]
        P_LM[AnthropicLanguageModel<br/>Real API calls]
        P_CS[ConfigService.Default<br/>From environment]
    end

    T_WE -.->|swap| P_WE
    T_SS -.->|swap| P_SS
    T_EE -.->|swap| P_EE
    T_RE -.->|swap| P_RE
    T_GR -.->|swap| P_GR
    T_LM -.->|swap| P_LM
    T_CS -.->|swap| P_CS
```

---

## API Reference

### REST Endpoints

```mermaid
graph LR
    subgraph "Health"
        H1[GET /health]
        H2[GET /ready]
    end

    subgraph "Extraction"
        E1[POST /api/v1/extract]
        E2[GET /api/v1/jobs/:id]
    end

    subgraph "Batch Workflow"
        B1[POST /api/v1/batch/start]
        B2[GET /api/v1/batch/:id]
        B3[POST /api/v1/batch/:id/interrupt]
        B4[POST /api/v1/batch/:id/resume]
    end
```

### WorkflowOrchestrator Interface

```typescript
interface WorkflowOrchestrator {
  // Start workflow (fire-and-forget)
  start(payload: BatchWorkflowPayload): Effect<string, string>

  // Start and wait for completion
  startAndWait(payload: BatchWorkflowPayload): Effect<BatchState, string>

  // Poll for result
  poll(executionId: string): Effect<Workflow.Result<BatchState, string> | undefined>

  // Interrupt running workflow
  interrupt(executionId: string): Effect<void>

  // Resume suspended workflow
  resume(executionId: string): Effect<void>
}
```

### BatchWorkflowPayload Schema

```typescript
const BatchWorkflowPayload = Schema.Struct({
  batchId: BatchId,           // batch-xxxxxxxxxxxx
  manifestUri: GcsUri,        // gs://bucket/manifests/batch-xxx.json
  ontologyVersion: OntologyVersion  // namespace/name@hash
})
```

### BatchManifest Schema

```typescript
const BatchManifest = Schema.Struct({
  batchId: BatchId,
  ontologyUri: GcsUri,
  ontologyVersion: OntologyVersion,
  shaclUri: Schema.optional(GcsUri),
  targetNamespace: Namespace,
  documents: Schema.Array(Schema.Struct({
    documentId: DocumentId,
    sourceUri: GcsUri,
    contentType: Schema.String,
    sizeBytes: Schema.Number
  })),
  createdAt: Schema.DateTimeUtc
})
```

---

## File Reference

| Path | Purpose |
|------|---------|
| `src/Service/WorkflowOrchestrator.ts` | High-level workflow API |
| `src/Service/Config.ts` | Centralized configuration |
| `src/Service/Storage.ts` | Storage abstraction |
| `src/Service/Extraction.ts` | Entity/Relation extractors |
| `src/Service/Grounder.ts` | Entity grounding |
| `src/Service/JobManager.ts` | Async job management |
| `src/Workflow/DurableActivities.ts` | @effect/workflow activities |
| `src/Workflow/StreamingExtraction.ts` | 2-stage extraction pipeline |
| `src/Workflow/EntityResolution.ts` | Graph-based entity resolution |
| `src/Runtime/ProductionRuntime.ts` | Production layer stack |
| `src/Runtime/TestRuntime.ts` | Test layer stack |
| `src/Runtime/Persistence/PostgresLayer.ts` | PostgreSQL persistence |
| `src/Domain/Identity.ts` | Branded ID types |
| `src/Domain/PathLayout.ts` | Type-safe storage paths |
| `src/Domain/Model/BatchWorkflow.ts` | BatchState union type |
| `src/Domain/Schema/Batch.ts` | Activity input/output schemas |
| `infra/modules/postgres/` | Terraform for PostgreSQL |
| `infra/modules/cloud_run/` | Terraform for Cloud Run |
