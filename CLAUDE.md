# Local Development Context

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

