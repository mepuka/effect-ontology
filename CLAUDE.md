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
