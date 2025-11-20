# Local Development Context

## Package Management and Build Tools

**CRITICAL: This project uses Bun as the package manager and runtime**

### Package Manager

- **Bun**: `bun@1.2.23` (specified in package.json `packageManager` field)
- **Workspace**: Monorepo with packages in `packages/*`

### Installation

```bash
# Install dependencies
bun install

# Install in a specific workspace package
cd packages/core && bun install
cd packages/ui && bun install
```

### Available Scripts

**Root-level scripts (from project root):**

```bash
# Development
bun run dev              # Start UI dev server

# Building
bun run build            # Build all packages (core + ui)
bun run build:core       # Build core package only
bun run build:ui         # Build UI package only

# Type checking
bun run check            # Check all packages
bun run check:core       # Check core package
bun run check:ui         # Check UI package

# Linting
bun run lint             # Lint all packages
bun run lint-fix         # Lint and auto-fix

# Testing
bun run test             # Run all tests (currently core only)
bun run test:core        # Run core package tests
bun run coverage         # Run tests with coverage

# Cleanup
bun run clean            # Remove build artifacts
```

**Package-specific scripts:**

```bash
# Core package (packages/core)
cd packages/core
bun run build            # TypeScript build
bun run test             # Run vitest
bun run check            # Type check

# UI package (packages/ui)
cd packages/ui
bun run dev              # Vite dev server
bun run build            # Vite build
bun run check            # Type check
```

### Running TypeScript Scripts

Use `bunx tsx` to run TypeScript files directly:

```bash
# Run a script
bunx tsx packages/core/scripts/test-real-extraction.ts

# Run with environment variables
ANTHROPIC_API_KEY=xxx bunx tsx packages/core/scripts/generate-sample-prompts.ts
```

### Testing

The project uses **Vitest** with **@effect/vitest** for testing:

```bash
# Run all tests
bun run test

# Run tests in watch mode
cd packages/core && bunx vitest

# Run specific test file
cd packages/core && bunx vitest test/Graph/Builder.test.ts

# Run with coverage
bun run coverage
```

### Type Checking

Use `bun run check` for type checking (runs `tsc -b`):

```bash
# Check all packages
bun run check

# Check specific package
bun run check:core
bun run check:ui

# Or directly
cd packages/core && bunx tsc -b tsconfig.json
```

### Common Workflows

**Adding dependencies:**
```bash
# Add to root (shared dependencies)
bun add effect @effect/schema

# Add to specific package
cd packages/core && bun add n3
cd packages/ui && bun add react
```

**Development workflow:**
```bash
# 1. Install dependencies
bun install

# 2. Run type checking
bun run check

# 3. Run tests
bun run test

# 4. Start development
bun run dev
```

**Build and verify:**
```bash
# Clean previous builds
bun run clean

# Build all packages
bun run build

# Verify type checking
bun run check
```

### Important Notes

1. **Always use `bun` commands** - Not npm, yarn, or pnpm
2. **Use `bunx` for executables** - Instead of npx (e.g., `bunx tsx`, `bunx vitest`)
3. **Workspace commands** - Scripts in root package.json coordinate workspace packages
4. **TypeScript execution** - Use `bunx tsx` to run .ts files without pre-compilation
5. **Vitest integration** - All tests use vitest with @effect/vitest helpers

---

## Effect Source Code Context

**CRITICAL: Always search local Effect source before writing Effect code**

This project has full Effect-TS source code available locally for reference. Before writing any Effect code, search the relevant source packages to understand actual implementations, patterns, and APIs.

### Available Source Location

- Path: `docs/effect-source/`
- Contains all Effect packages from the Effect monorepo
- Symlinked to: `~/Dev/effect-source/effect/packages`

### Available Packages

The following Effect packages are available for local reference:

- **effect** - Core Effect library (docs/effect-source/effect/src/)
- **platform** - Platform abstractions (docs/effect-source/platform/src/)
- **platform-node** - Node.js implementations (docs/effect-source/platform-node/src/)
- **platform-bun** - Bun implementations (docs/effect-source/platform-bun/src/)
- **platform-browser** - Browser implementations (docs/effect-source/platform-browser/src/)
- **sql** - SQL abstractions (docs/effect-source/sql/src/)
- **sql-sqlite-node** - SQLite for Node (docs/effect-source/sql-sqlite-node/src/)
- **sql-drizzle** - Drizzle integration (docs/effect-source/sql-drizzle/src/)
- **cli** - CLI framework (docs/effect-source/cli/src/)
- **schema** - Schema validation (docs/effect-source/schema/src/)
- **rpc** - RPC framework (docs/effect-source/rpc/src/)
- **experimental** - Experimental features (docs/effect-source/experimental/src/)
- **opentelemetry** - OpenTelemetry integration (docs/effect-source/opentelemetry/src/)

### Workflow: Search Before You Code

**Always follow this pattern:**

1. **Identify the Effect API** you need to use
2. **Search the local source** to see the actual implementation
3. **Study the types and patterns** in the source code
4. **Write your code** based on real implementations, not assumptions

### Search Commands

Use these grep patterns to find what you need:

```bash
# Find a function or class definition
grep -r "export.*function.*functionName" docs/effect-source/

# Find type definitions
grep -r "export.*interface.*TypeName" docs/effect-source/
grep -r "export.*type.*TypeName" docs/effect-source/

# Find class definitions
grep -r "export.*class.*ClassName" docs/effect-source/

# Search within a specific package
grep -r "pattern" docs/effect-source/effect/src/
grep -r "pattern" docs/effect-source/platform/src/

# Find usage examples in tests
grep -r "test.*pattern" docs/effect-source/effect/test/

# Find all exports from a module
grep -r "export" docs/effect-source/effect/src/Effect.ts
```

### Example Search Patterns

**Before writing Error handling code:**

```bash
grep -r "TaggedError\|catchTag\|catchAll" docs/effect-source/effect/src/
```

**Before working with Layers:**

```bash
grep -F "Layer.succeed" docs/effect-source/effect/src/Layer.ts
grep -F "Layer.effect" docs/effect-source/effect/src/Layer.ts
grep -F "provide" docs/effect-source/effect/src/Layer.ts
```

**Before using SQL:**

```bash
grep -r "SqlClient\|withTransaction" docs/effect-source/sql/src/
```

**Before writing HTTP code:**

```bash
grep -r "HttpServer\|HttpRouter" docs/effect-source/platform/src/
```

**Before using Streams:**

```bash
grep -F "Stream.make" docs/effect-source/effect/src/Stream.ts
grep -F "Stream.from" docs/effect-source/effect/src/Stream.ts
```

### Key Files to Reference

Common entry points for searching:

- **Core Effect**: `docs/effect-source/effect/src/Effect.ts`
- **Layer**: `docs/effect-source/effect/src/Layer.ts`
- **Stream**: `docs/effect-source/effect/src/Stream.ts`
- **Schema**: `docs/effect-source/schema/src/Schema.ts`
- **Config**: `docs/effect-source/effect/src/Config.ts`
- **HttpServer**: `docs/effect-source/platform/src/HttpServer.ts`
- **HttpRouter**: `docs/effect-source/platform/src/HttpRouter.ts`
- **SqlClient**: `docs/effect-source/sql/src/SqlClient.ts`

### Benefits

By searching local source code you will:

1. **See actual implementations** - understand how APIs really work
2. **Discover patterns** - learn idiomatic Effect code from the source
3. **Find all variants** - see all overloads and variations of functions
4. **Avoid deprecated APIs** - work with current implementations
5. **Understand types** - see full type definitions and constraints
6. **Learn from tests** - discover usage patterns from test files

### Maintenance and Updates

**Updating Effect Source:**

When you upgrade @effect packages in package.json, update the local source:

```bash
cd ~/Dev/effect-source/effect
git pull origin main
```

**Verify Symlink:**

Check the symlink is working:

```bash
ls -la docs/effect-source
# Should show: docs/effect-source -> /Users/pooks/Dev/effect-source/effect/packages

# Test access:
ls docs/effect-source/effect/src/Effect.ts
```

**Troubleshooting:**

If symlink is broken:

```bash
ln -sf ~/Dev/effect-source/effect/packages docs/effect-source
```

If source is missing, clone the Effect monorepo:

```bash
mkdir -p ~/Dev/effect-source
cd ~/Dev/effect-source
git clone https://github.com/Effect-TS/effect.git
```

### Integration with Skills

All Effect skills (in `.claude/skills/effect-*.md`) include local source reference guidance. When a skill is active, always combine skill knowledge with local source searches for maximum accuracy.

---

**Remember: Real source code > documentation > assumptions. Always search first.**

## Test Layer Pattern

**CRITICAL: Use Test Layers for mocking services in Effect tests**

The Test Layer pattern is Effect's idiomatic way to provide mock/test implementations of services. This pattern enables clean, composable testing without side effects or global mocks.

### Core Concepts

1. **`.Default` Layer**: Production layer that loads from environment/real resources
2. **`.Test` Layer**: Test layer with sensible mock/fake implementations  
3. **`Layer.effect/succeed`**: Create custom test layers inline
4. **`it.layer()`**: @effect/vitest helper to provide layers to tests

### Pattern: Static `.Test` Property

Services should define both `.Default` (production) and `.Test` (testing) layers:

\`\`\`typescript
export class MyService extends Effect.Service<MyService>()(
  "MyService",
  {
    effect: Effect.gen(function* () {
      // Production implementation - reads from env, makes real API calls, etc.
      const config = yield* Config.string("API_KEY")
      return {
        getData: () => HttpClient.get("https://api.example.com/data")
      }
    }),
    dependencies: []
  }
) {
  /**
   * Test layer with mock implementation.
   * Returns fake data without external dependencies.
   */
  static Test = Layer.succeed(MyService, MyService.make({
    getData: () => Effect.succeed({ data: "test-data" })
  }))
}
\`\`\`

### Real-World Examples from Effect Source

#### Example 1: HttpClient Test Layer (platform/test/HttpClient.test.ts)

\`\`\`typescript
// Create a test service that wraps HttpClient with test baseURL
const makeJsonPlaceholder = Effect.gen(function*() {
  const defaultClient = yield* HttpClient.HttpClient
  const client = defaultClient.pipe(
    HttpClient.mapRequest(
      HttpClientRequest.prependUrl("https://jsonplaceholder.typicode.com")
    )
  )

  const createTodo = (todo) =>
    HttpClientRequest.post("/todos").pipe(
      HttpClientRequest.schemaBodyJson(TodoSchema)(todo),
      Effect.flatMap(client.execute),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
    )

  return { client, createTodo } as const
})

interface JsonPlaceholder extends Effect.Effect.Success<typeof makeJsonPlaceholder> {}
const JsonPlaceholder = Context.GenericTag<JsonPlaceholder>("test/JsonPlaceholder")

// Test layer wraps production HttpClient with test config
const JsonPlaceholderLive = Layer.effect(JsonPlaceholder, makeJsonPlaceholder)
  .pipe(Layer.provideMerge(FetchHttpClient.layer))

// Usage in tests
it.effect("should create todo", () =>
  Effect.gen(function*() {
    const jp = yield* JsonPlaceholder
    const response = yield* jp.createTodo({
      userId: 1,
      title: "test",
      completed: false
    })
    expect(response.title).toBe("test")
  }).pipe(
    Effect.provide(JsonPlaceholderLive)
  )
)
\`\`\`

**Key Pattern**: Test layer wraps real service with controlled test environment.


#### Example 2: Config Test Layers (Our Codebase)

```typescript
export class LlmConfigService extends Effect.Service<LlmConfigService>()(
  "LlmConfigService",
  {
    effect: LlmProviderConfig,  // Loads from environment
    dependencies: []
  }
) {
  /**
   * Test layer with sensible defaults for Anthropic provider.
   * No environment variables needed.
   */
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LLM.PROVIDER", "anthropic"],
        ["LLM.ANTHROPIC_API_KEY", "test-api-key"],
        ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"],
        ["LLM.ANTHROPIC_MAX_TOKENS", "4096"],
        ["LLM.ANTHROPIC_TEMPERATURE", "0.0"]
      ])
    )
  )
}

// Usage in tests
it.layer(LlmConfigService.Test)(
  "should use test config", 
  () => Effect.gen(function*() {
    const config = yield* LlmConfigService
    expect(config.provider).toBe("anthropic")
  })
)
```

**Key Pattern**: `Layer.setConfigProvider` eliminates environment dependencies in tests.

### When to Use Test Layers

**✅ DO use test layers for:**

- **External services**: HTTP clients, databases, LLM APIs
- **Environment-dependent code**: File system, config, network
- **Stateful services**: Caches, queues, background workers
- **Side-effectful operations**: Logging, metrics, notifications
- **Complex dependencies**: Services with multiple layers of deps

**❌ DON'T need test layers for:**

- **Pure functions**: Data transformations, calculations
- **Simple utilities**: String formatting, validation functions
- **Schemas**: Effect Schema definitions (test via encode/decode)
- **Inline Effects**: `Effect.sync(() => ...)` with no deps

### Test Layer Strategies

#### Strategy 1: Static `.Test` Property (Recommended)

Best for services used across many tests:

```typescript
export class DatabaseService extends Effect.Service<DatabaseService>()(...) {
  static Test = Layer.succeed(DatabaseService, {
    query: () => Effect.succeed([{ id: 1, name: "test" }]),
    insert: () => Effect.succeed({ id: 1 })
  })
}
```

#### Strategy 2: Inline Layer Creation

Best for one-off test scenarios:

```typescript
it.effect("custom scenario", () =>
  Effect.gen(function*() {
    const result = yield* myProgram
    expect(result).toBe(42)
  }).pipe(
    Effect.provide(
      Layer.succeed(MyService, { 
        specialBehavior: () => Effect.succeed("custom") 
      })
    )
  )
)
```

#### Strategy 3: ConfigProvider for Config Services

Best for testing configuration-driven behavior:

```typescript
it.layer(
  Layer.setConfigProvider(
    ConfigProvider.fromMap(new Map([["API_URL", "http://localhost:3000"]]))
  )
)("test with custom config", () =>
  Effect.gen(function*() {
    const config = yield* AppConfigService
    expect(config.apiUrl).toBe("http://localhost:3000")
  })
)
```

### Advanced Patterns

#### Layered Hierarchy for Integration Tests

```typescript
// Base service mock
const MockDatabase = Layer.succeed(DatabaseService, mockDbImpl)

// Dependent service uses mock database
const MockUserService = Layer.effect(
  UserService,
  Effect.gen(function*() {
    const db = yield* DatabaseService
    return { 
      getUser: (id) => db.query(`SELECT * FROM users WHERE id = ${id}`)
    }
  })
).pipe(Layer.provideMerge(MockDatabase))

// Test with full hierarchy
it.effect("integration test", () =>
  Effect.gen(function*() {
    const userService = yield* UserService
    const user = yield* userService.getUser(1)
    expect(user.name).toBe("test")
  }).pipe(Effect.provide(MockUserService))
)
```

**CRITICAL**: Use `Layer.provideMerge` for merged layers, not `Layer.provide`.

#### Parameterized Test Layers

```typescript
const makeTestDatabase = (data: User[]) =>
  Layer.succeed(DatabaseService, {
    query: () => Effect.succeed(data)
  })

it.effect("test with specific data", () =>
  Effect.gen(function*() {
    const db = yield* DatabaseService
    const users = yield* db.query()
    expect(users).toHaveLength(2)
  }).pipe(
    Effect.provide(makeTestDatabase([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" }
    ]))
  )
)
```

### Testing Patterns with @effect/vitest

#### Pattern 1: it.layer() for Layer Setup

```typescript
import { describe, expect, it, layer } from "@effect/vitest"

it.layer(MyService.Test)(
  "test name",
  () => Effect.gen(function*() {
    const service = yield* MyService
    // test
  })
)
```

#### Pattern 2: it.effect() with inline Layer.provide

```typescript
it.effect("test name", () =>
  Effect.gen(function*() {
    const service = yield* MyService
    // test
  }).pipe(Effect.provide(MyService.Test))
)
```

Both are equivalent; use `it.layer()` for readability.

### Comparison: Test Layers vs Traditional Mocks

| Aspect | Test Layers (Effect) | Traditional Mocks |
|--------|---------------------|-------------------|
| **Composition** | Layer.merge, Layer.provideMerge | Manual wiring |
| **Dependencies** | Automatic via Context | Manual injection |
| **Reusability** | High - share across tests | Low - test-specific |
| **Type Safety** | Full Effect type inference | Depends on library |
| **Side Effects** | Controlled via Effect | Often uncontrolled |
| **Teardown** | Automatic via scoped layers | Manual cleanup |
| **Testability** | Services inherently testable | Requires design discipline |

### Migration Guide: Adding Test Layers to Existing Code

**Step 1**: Identify services that need test layers
```bash
# Find services without .Test property
grep -r "Effect.Service" packages/core/src/ -A 10 | grep -v "static Test"
```

**Step 2**: Add `.Test` static property to each service

**Step 3**: Update tests to use `it.layer()` or `Effect.provide()`
```typescript
// Before: Direct Effect.gen with no layer
it.effect("test", () =>
  Effect.gen(function*() {
    // This will fail if MyService isn't provided!
    const service = yield* MyService
  })
)

// After: Provide test layer
it.layer(MyService.Test)(
  "test",
  () => Effect.gen(function*() {
    const service = yield* MyService
    // Now MyService is provided via test layer
  })
)
```

**Step 4**: Look for opportunities to extract test service patterns
- Repeated setup code → Static `.Test` property
- Complex mocking logic → Test service layer
- Environment dependencies → ConfigProvider test layer

### Best Practices

1. **Always provide `.Test` layers for services** - Make testing easy by default
2. **Use sensible defaults** - Test layers should work without configuration
3. **Document test behavior** - JSDoc on `.Test` property explaining what's mocked
4. **Prefer Layer.succeed for simple mocks** - Use Layer.effect when construction is effectful
5. **Use ConfigProvider.fromMap for config** - Eliminate environment dependencies
6. **Compose with Layer.merge** - Build complex test scenarios from simple layers
7. **Use Layer.provideMerge for merged layers** - Preserves shared dependencies
8. **Test the test layers** - Verify `.Test` layers provide valid implementations
9. **Keep production and test layers in sync** - Same interface, different impl
10. **Extract common patterns** - Reusable test layers for common scenarios

### References

**Effect Source Examples:**
- `docs/effect-source/platform/test/HttpClient.test.ts` - JsonPlaceholder test service
- `docs/effect-source/effect/test/Layer.test.ts` - Layer composition patterns

**Our Implementation:**
- `packages/core/src/Config/Services.ts` - Config service test layers
- `packages/core/test/Config/Services.test.ts` - Usage with it.layer()

**Effect Documentation:**
- Layer API: https://effect.website/docs/guides/context-management/layers
- Testing Guide: https://effect.website/docs/guides/testing/introduction

---

**Remember: Test layers enable isolated, composable, type-safe testing. Use them liberally.**


---

## LLM Provider Architecture (Data-Driven)

**CRITICAL: This project uses a data-driven approach for LLM providers - NO Effect Config**

The LLM provider system was redesigned (Nov 2025) to eliminate Effect Config complexity and enable dynamic provider switching. Provider configuration is now plain data passed as function arguments.

### Core Principles

1. **Provider params are data, not config** - Pass `LlmProviderParams` as function arguments
2. **Core library is provider-agnostic** - No Effect Config dependency
3. **Dynamic layer composition** - Use `Effect.provide(layer)` inline per call
4. **Atoms handle provider selection** - Read from `browserConfigAtom` (plain data)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Browser/Backend: Plain Data                            │
│ const params: LlmProviderParams = {                    │
│   provider: "anthropic",                               │
│   anthropic: { apiKey: "...", model: "..." }           │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ makeLlmProviderLayer(params)                           │
│ Returns: Layer<LanguageModel.LanguageModel>            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ extractKnowledgeGraph(text, ontology, prompt, schema)  │
│ Requires: LanguageModel.LanguageModel                  │
│ Returns: Effect<KnowledgeGraph, LLMError, LM>          │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Effect.provide(providerLayer)                          │
│ Compose layer inline per call                          │
└─────────────────────────────────────────────────────────┘
```

### Usage Patterns

#### Backend Scripts

```typescript
import { makeLlmProviderLayer, type LlmProviderParams } from "@effect-ontology/core/Services/LlmProvider"
import { extractKnowledgeGraph } from "@effect-ontology/core/Services/Llm"
import { Effect } from "effect"

// Read env vars and create params
const params: LlmProviderParams = {
  provider: (process.env.VITE_LLM_PROVIDER || "anthropic") as any,
  anthropic: {
    apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY || "",
    model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    maxTokens: Number(process.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
    temperature: Number(process.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
  },
  // ... other providers
}

// Create provider layer
const providerLayer = makeLlmProviderLayer(params)

// Use in program
const program = Effect.gen(function*() {
  const result = yield* extractKnowledgeGraph(
    text,
    ontology,
    prompt,
    schema
  )
  console.log(result)
})

Effect.runPromise(program.pipe(Effect.provide(providerLayer)))
```

#### Frontend Atoms

```typescript
import { runtime } from "./runtime/atoms"
import { browserConfigAtom } from "./state/config"
import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { extractKnowledgeGraph } from "@effect-ontology/core/Services/Llm"

export const extractionAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    // Read config as plain data
    const config = get(browserConfigAtom)
    
    // Compose provider layer inline
    const providerLayer = makeLlmProviderLayer(config)
    
    // Provide layer per-call
    return yield* extractKnowledgeGraph(
      text,
      ontology,
      prompt,
      schema
    ).pipe(Effect.provide(providerLayer))
  })
)
```

### Configuration

#### Environment Variables

Both browser and backend use **VITE_* prefixed variables**:

```bash
# .env file
VITE_LLM_PROVIDER=anthropic

VITE_LLM_ANTHROPIC_API_KEY=sk-ant-api03-...
VITE_LLM_ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
VITE_LLM_ANTHROPIC_MAX_TOKENS=4096
VITE_LLM_ANTHROPIC_TEMPERATURE=0.0

VITE_LLM_OPENAI_API_KEY=sk-...
VITE_LLM_OPENAI_MODEL=gpt-4o

VITE_LLM_GEMINI_API_KEY=...
VITE_LLM_GEMINI_MODEL=gemini-2.5-flash

VITE_LLM_OPENROUTER_API_KEY=...
VITE_LLM_OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

**Browser**: Vite automatically loads VITE_* vars into `import.meta.env`
**Backend**: Node reads VITE_* vars from `process.env`

#### Browser Config Atom

```typescript
// packages/ui/src/state/config.ts
import { Atom } from "@effect-atom/atom"
import type { LlmProviderParams } from "@effect-ontology/core/Services/LlmProvider"

// Simple plain-data atom (no Effect Config!)
export const browserConfigAtom = Atom.make<LlmProviderParams>({
  provider: "anthropic",
  anthropic: {
    apiKey: import.meta.env.VITE_LLM_ANTHROPIC_API_KEY || "",
    model: import.meta.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    maxTokens: 4096,
    temperature: 0.0
  },
  // ... other providers
})
```

### Supported Providers

- **Anthropic** (Claude): `@effect/ai-anthropic`
- **OpenAI** (GPT): `@effect/ai-openai`
- **Google** (Gemini): `@effect/ai-google`
- **OpenRouter**: Uses OpenAI adapter with custom URL

### Dynamic Provider Switching

Change provider at runtime without page reload:

```typescript
import { Atom } from "@effect-atom/atom"
import { browserConfigAtom } from "./state/config"

// Switch to OpenAI
Atom.set(browserConfigAtom, {
  ...get(browserConfigAtom),
  provider: "openai"
})

// Next extraction will use OpenAI
```

### Benefits

1. **No config timing issues** - Params are plain data, not Effect Config
2. **Dynamic provider switching** - Change provider without reloading layers
3. **Simpler architecture** - No ConfigProvider, no path delimiters, no timing bugs
4. **Clearer data flow** - Provider params are explicit function arguments
5. **Easier testing** - Pass test params directly, no config mocking
6. **Provider-agnostic core** - Core library has zero config dependencies

### Migration from Old Config System

**Old (Effect Config-based):**
```typescript
// ❌ Deprecated - DO NOT USE
const llm = yield* LlmService
const result = yield* llm.extractKnowledgeGraph(...)
```

**New (Data-driven):**
```typescript
// ✅ Current approach
const params = { provider: "anthropic", anthropic: {...} }
const providerLayer = makeLlmProviderLayer(params)
const result = yield* extractKnowledgeGraph(...)
  .pipe(Effect.provide(providerLayer))
```

### Removed Components

The following were **deleted** in the Nov 2025 refactor:

- ❌ `packages/core/src/Config/Schema.ts` - LLM config schemas
- ❌ `packages/core/src/Config/Services.ts` - Config services (LlmConfigService)
- ❌ `packages/core/src/Config/index.ts` - Config module exports
- ❌ `LlmService` class - Use `extractKnowledgeGraph` function instead

### References

- Core implementation: `packages/core/src/Services/LlmProvider.ts`
- Extraction functions: `packages/core/src/Services/Llm.ts`
- Browser config: `packages/ui/src/state/config.ts`
- Frontend layers: `packages/ui/src/runtime/layers.ts`
- Backend example: `packages/core/scripts/test-real-extraction.ts`
- Design doc: `docs/plans/2025-11-20-remove-config-make-llm-data-driven-design.md`
- Implementation plan: `docs/plans/2025-11-20-remove-config-make-llm-data-driven.md`

---

**Remember: Provider params are data, not config. Pass them as function arguments.**
