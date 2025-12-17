# Embedding Architecture

> **Created**: 2025-12-16
> **Status**: Implemented
> **Related Issues**: EMB-1, EMB-2, EMB-3, EMB-4

## Overview

The embedding subsystem provides pre-computed vector embeddings for ontology elements (classes and properties), enabling fast semantic search without on-demand embedding computation. This is critical for serverless deployments where cold-start latency matters.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Embedding Architecture                            │
└─────────────────────────────────────────────────────────────────────────┘

                      ┌──────────────────────────┐
                      │    ComputeEmbeddings     │
                      │       Activity           │
                      │  (DurableActivities.ts)  │
                      └───────────┬──────────────┘
                                  │ Computes on ontology change
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           GCS Storage                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  gs://bucket/ontologies/{namespace}/{name}/                      │    │
│  │    ├── ontology.ttl           ← Source ontology                  │    │
│  │    └── ontology-embeddings.json  ← Pre-computed vectors          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Loaded at startup
                                  ▼
                      ┌──────────────────────────┐
                      │    OntologyLoader        │
                      │ loadOntologyWithEmbed    │
                      │     dings()              │
                      └───────────┬──────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
              ▼                                       ▼
┌──────────────────────────┐            ┌──────────────────────────┐
│    OntologyContext       │            │   OntologyEmbeddings     │
│  (classes, properties,   │            │  (pre-computed vectors   │
│   hierarchy, etc.)       │            │   for semantic search)   │
└──────────────────────────┘            └───────────┬──────────────┘
                                                    │
                                                    ▼
                                        ┌──────────────────────────┐
                                        │  searchClassesWithEmbed  │
                                        │        dings()           │
                                        │   BM25 + Semantic + RRF  │
                                        └──────────────────────────┘
```

## Components

### 1. OntologyEmbeddings Schema

**Location**: `Domain/Model/OntologyEmbeddings.ts`

Pre-computed embeddings blob stored as JSON alongside the ontology file.

```typescript
export const OntologyEmbeddings = Schema.Struct({
  ontologyUri: Schema.String,        // "gs://bucket/ontologies/football/ontology.ttl"
  version: Schema.String,            // SHA-256 hash of ontology content (16 chars)
  model: Schema.String,              // "nomic-embed-text-v1.5"
  dimension: Schema.Number,          // 768
  createdAt: Schema.DateTimeUtc,     // When embeddings were computed
  classes: Schema.Array(ElementEmbedding),     // Class embeddings
  properties: Schema.Array(ElementEmbedding)   // Property embeddings
})

export const ElementEmbedding = Schema.Struct({
  iri: Schema.String,       // Full IRI: "http://example.org/football#Player"
  text: Schema.String,      // "Player. A football player. Also known as: athlete"
  embedding: Schema.Array(Schema.Number)  // [0.123, -0.456, ...]
})
```

### 2. ComputeOntologyEmbeddings Activity

**Location**: `Workflow/DurableActivities.ts:781-884`

Durable activity that pre-computes embeddings for an ontology.

**Pipeline**:
1. Load ontology content from storage
2. Compute version hash (SHA-256)
3. Parse ontology to extract classes and properties
4. Build embedding text for each element (label + description + altLabels)
5. Embed all texts using `EmbeddingService`
6. Create `OntologyEmbeddings` blob
7. Store blob to GCS alongside ontology

```typescript
export const makeComputeEmbeddingsActivity = (input: ComputeEmbeddingsInput) =>
  Activity.make({
    name: `compute-embeddings-${computeOntologyVersion(input.ontologyUri).slice(0, 8)}`,
    success: ComputeEmbeddingsOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      // ... pipeline implementation
    })
  })
```

**Output**:
```typescript
{
  embeddingsUri: "gs://bucket/ontologies/football/ontology-embeddings.json",
  version: "8270884161fe2248",
  classCount: 45,
  propertyCount: 23,
  dimension: 768,
  durationMs: 12543
}
```

### 3. EmbeddingCache

**Location**: `Service/EmbeddingCache.ts`

In-memory content-addressable cache with TTL and LRU eviction.

```typescript
interface EmbeddingCacheService {
  get: (hash: string) => Effect<Option<Embedding>>
  set: (hash: string, embedding: Embedding) => Effect<void>
  has: (hash: string) => Effect<boolean>
  size: () => Effect<number>
  clear: () => Effect<void>
}
```

**Configuration**:
```typescript
const defaultCacheConfig = {
  ttlMs: 3600000,   // 1 hour
  maxEntries: 10000  // Max cached embeddings
}
```

**Eviction Policy**: LRU (Least Recently Used) when `maxEntries` reached.

### 4. EmbeddingService

**Location**: `Service/Embedding.ts`

Cache-through wrapper around `NomicNlpService`.

```typescript
export const EmbeddingServiceLive = Layer.effect(
  EmbeddingService,
  Effect.gen(function*() {
    const nomic = yield* NomicNlpService
    const cache = yield* EmbeddingCache
    return {
      embed: (text, taskType = "search_document") =>
        Effect.gen(function*() {
          const hash = yield* hashEmbeddingKey(text, taskType)
          const cached = yield* cache.get(hash)
          if (Option.isSome(cached)) return cached.value
          const embedding = yield* nomic.embed(text, taskType)
          yield* cache.set(hash, embedding)
          return embedding
        }),
      cosineSimilarity: nomic.cosineSimilarity
    }
  })
)
```

### 5. OntologyLoader

**Location**: `Service/OntologyLoader.ts`

Loads ontology with pre-computed embeddings.

```typescript
loadOntologyWithEmbeddings: (ontologyUri: string) =>
  Effect.gen(function*() {
    const embeddingsPath = embeddingsPathFromOntology(ontologyUri)

    // Load ontology and embeddings in parallel
    const [ontologyContent, embeddingsJson] = yield* Effect.all([
      storage.get(ontologyUri),
      storage.get(embeddingsPath)
    ], { concurrency: 2 })

    // Parse and validate version match
    const embeddings = yield* Schema.decode(OntologyEmbeddingsJson)(embeddingsJson)
    const expectedVersion = computeOntologyVersion(ontologyContent)

    if (embeddings.version !== expectedVersion) {
      return yield* Effect.fail(new EmbeddingsVersionMismatch({ ... }))
    }

    return { context, embeddings }
  })
```

### 6. Hybrid Search with RRF

**Location**: `Service/OntologyLoader.ts` + `Utils/Retrieval.ts`

Combines BM25 lexical search with semantic embedding search using Reciprocal Rank Fusion.

```typescript
searchClassesWithEmbeddings: (
  query: string,
  ontologyContext: OntologyContext,
  ontologyEmbeddings: OntologyEmbeddings,
  limit: number = 100
) => Effect.gen(function*() {
  // 1. Embed query (search_query task type)
  const queryEmbedding = yield* embedding.embed(query, "search_query")

  // 2. Compute semantic similarity scores
  const semanticScores = ontologyEmbeddings.classes.map(cls => ({
    id: cls.iri,
    similarity: embedding.cosineSimilarity(queryEmbedding, cls.embedding)
  }))

  // 3. Get BM25 scores
  const bm25Results = yield* getBm25Index(ontologyContext).search(query)

  // 4. Fuse with RRF
  const fused = rrfFusion([
    semanticScores.sort((a, b) => b.similarity - a.similarity),
    bm25Results
  ])

  return fused.slice(0, limit)
})
```

## Storage Layout

```
gs://effect-ontology-{env}/
└── ontologies/
    └── {namespace}/
        └── {name}/
            ├── ontology.ttl           # Source OWL ontology
            └── ontology-embeddings.json  # Pre-computed embeddings blob
```

**Embeddings Blob Size**: ~2-5MB for typical ontologies (50-200 classes)

## Version Validation

Embeddings are invalidated when ontology content changes:

1. **Compute Phase**: SHA-256 hash of ontology content → `version` field
2. **Load Phase**: Compare stored version with computed version
3. **Mismatch**: Fail with `EmbeddingsVersionMismatch` error

```typescript
// Computing version
const version = computeOntologyVersion(ontologyContent)
// Returns: "8270884161fe2248" (first 16 chars of SHA-256)
```

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `EmbeddingsNotFound` | Blob missing from storage | Re-run compute activity |
| `EmbeddingsVersionMismatch` | Ontology changed since embeddings computed | Re-run compute activity |
| `OntologyFileNotFound` | Ontology file missing | Check storage path |

## Service Dependency Graph

```
                    ┌─────────────────┐
                    │  OntologyLoader │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  RdfBuilder     │  │ EmbeddingService│  │ StorageService  │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
           ┌─────────────────┐  ┌─────────────────┐
           │ NomicNlpService │  │ EmbeddingCache  │
           └─────────────────┘  └─────────────────┘
```

## Testing

**Test Layers**:
- `EmbeddingCacheTest` - Always misses cache
- `StorageServiceTest` - In-memory storage

**Test Files**:
- `test/Service/OntologyLoader.embeddings.test.ts` - loadOntologyWithEmbeddings
- `test/Workflow/ComputeEmbeddingsActivity.test.ts` - Activity pipeline
- `test/Service/EmbeddingCache.test.ts` - Cache behavior

## Performance Considerations

1. **Pre-computation**: Run `ComputeEmbeddingsActivity` when ontology changes, not per-request
2. **Caching**: `EmbeddingCache` prevents redundant model calls for identical text
3. **Parallel Loading**: Ontology and embeddings loaded concurrently
4. **Vector Dimension**: 768 dimensions (Nomic model) × ~100 classes ≈ 300KB vectors per ontology

## Configuration

```bash
# Embedding model (future: configurable)
EMBEDDING_MODEL=nomic-embed-text-v1.5

# Cache settings
EMBEDDING_CACHE_TTL_MS=3600000     # 1 hour
EMBEDDING_CACHE_MAX_ENTRIES=10000   # Max cached vectors
```
