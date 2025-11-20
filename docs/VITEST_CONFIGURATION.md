# Vitest Configuration & Process Management

## Overview

This project uses Vitest for testing with special configuration to prevent orphaned processes and memory leaks.

## Configuration Details

### Process Pool Settings

We use **thread-based pooling** optimized for Bun:

```typescript
pool: "threads",
poolOptions: {
  threads: {
    singleThread: false,  // Allow multiple workers for parallelism
    maxThreads: 4,        // Limit concurrent workers
    minThreads: 1,        // Keep at least one worker alive
    isolate: true,        // Full isolation between test files
    useAtomics: true      // Better cleanup coordination
  }
}
```

**Why threads with Bun?**
- Bun has excellent thread support with fast startup
- Lower memory overhead than forks
- Better cleanup coordination with atomics
- Faster test execution
- Native support for Effect runtime

### Timeout Configuration

All operations have explicit timeouts to prevent hanging:

- **Test timeout**: 30 seconds per test
- **Hook timeout**: 10 seconds for before/after hooks
- **Teardown timeout**: 10 seconds for cleanup

These can be adjusted per-test using:
```typescript
it("long test", { timeout: 60_000 }, () => { /* ... */ })
```

### Mock & Cleanup Settings

Automatic cleanup between tests:

```typescript
restoreMocks: true,   // Restore original implementations
clearMocks: true,     // Clear mock call history
mockReset: true       // Reset mock state
```

## Running Tests

### Standard Test Run (CI/Scripts)

```bash
# From project root
bun run test

# From packages/core
bun run test
```

This uses `vitest --run` which:
- Runs tests once and exits
- Does NOT start file watcher
- Prevents orphaned processes

### Watch Mode (Development)

```bash
# From packages/core
bun run test:watch
```

This starts interactive watch mode. **Note**: You must exit with Ctrl+C when done, or processes may leak.

### Coverage

```bash
# From project root
bun run coverage
```

Uses `vitest run --coverage` to ensure clean exit after coverage collection.

## Process Management

### Checking for Orphaned Processes

```bash
# Find vitest processes
pgrep -f vitest

# Find node worker processes
pgrep -f "node.*worker"

# Get detailed info
ps aux | grep -E "(vitest|node.*worker)"
```

### Cleanup Script

If you experience memory pressure from leaked processes:

```bash
# From project root
./scripts/cleanup-vitest-processes.sh

# Or manually
bun run clean:processes
```

### Manual Cleanup

```bash
# Graceful shutdown
pkill -TERM -f vitest

# Force kill (if graceful fails)
pkill -KILL -f vitest

# Kill all node workers
pkill -f "node.*worker"
```

## Common Issues & Solutions

### Issue: Processes Don't Exit After Tests

**Symptoms:**
- `bun run test` hangs after tests complete
- Multiple node processes remain in `ps aux`

**Solutions:**
1. Ensure you're using `vitest --run` not just `vitest`
2. Check for hanging async operations in tests
3. Verify all Effect programs properly handle errors
4. Add explicit timeouts to long-running tests

### Issue: High Memory Usage

**Symptoms:**
- Memory usage climbs during test runs
- System becomes slow after running tests

**Solutions:**
1. Run cleanup script: `./scripts/cleanup-vitest-processes.sh`
2. Reduce `maxForks` in vitest config (currently 4)
3. Run tests with `--no-threads` flag: `vitest --no-threads`
4. Check for memory leaks in test code (unclosed streams, etc.)

### Issue: Tests Fail with "Pool closed" or "Worker exited"

**Symptoms:**
- Random worker exit errors
- Tests fail inconsistently

**Solutions:**
1. Increase timeouts in vitest.config.ts
2. Check for unhandled promise rejections
3. Verify Effect error handling (all errors should be typed)
4. Reduce test parallelism: `vitest --max-workers=2`

### Issue: Watch Mode Doesn't Restart

**Symptoms:**
- File changes don't trigger test re-runs
- Vitest watch appears stuck

**Solutions:**
1. Exit and restart watch mode (Ctrl+C, then `bun run test:watch`)
2. Check `forceRerunTriggers` in config matches your setup
3. Verify no hanging processes: `pgrep -f vitest`

## Best Practices

### Test Lifecycle Management

1. **Use proper cleanup**: Always clean up resources in `afterEach`/`afterAll`
   ```typescript
   afterEach(() => {
     // Clean up any state, close connections, etc.
   })
   ```

2. **Avoid global state**: Use Effect Layers for dependency injection
   ```typescript
   it.layer(MyService.Test)("test", () => 
     Effect.gen(function*() {
       const service = yield* MyService
       // Test using service
     })
   )
   ```

3. **Handle async properly**: All Effect programs should be yielded
   ```typescript
   it.effect("test", () =>
     Effect.gen(function*() {
       const result = yield* myProgram  // ✅ Correct
       // NOT: const result = await myProgram  // ❌ Wrong
     })
   )
   ```

### Resource Management

1. **Scoped resources**: Use `Effect.scoped` for resources that need cleanup
   ```typescript
   const resource = Effect.acquireRelease(
     acquire,
     (r) => cleanup(r)
   )
   ```

2. **Timeouts on external calls**: Always timeout external operations
   ```typescript
   yield* httpCall.pipe(
     Effect.timeout("5 seconds")
   )
   ```

3. **Interrupt handling**: Test code should handle interrupts
   ```typescript
   yield* longOperation.pipe(
     Effect.race(Effect.interrupt)
   )
   ```

## Configuration Files

### packages/core/vitest.config.ts

Package-specific test configuration. **This is the active config for core tests.**

### vitest.config.ts (root)

Root-level config kept for reference. **Not actively used** - tests run from packages.

### When to Modify Config

**Increase timeouts if:**
- Tests legitimately take longer (LLM calls, large parsing, etc.)
- You see timeout errors but tests pass when run individually

**Decrease maxForks if:**
- High memory usage during tests
- System becomes unresponsive
- Tests fail with resource exhaustion

**Switch to forks if:**
- You experience issues with thread-based isolation
- Native modules cause problems in threads
- You need stronger process isolation

**Note**: With Bun, threads are generally preferred. Only switch to forks if you have specific isolation requirements.

## Monitoring & Debugging

### Check Test Performance

```bash
# Run with reporter to see slow tests
vitest --reporter=verbose

# Run specific test file
vitest test/Graph/Builder.test.ts

# Run with increased logging
DEBUG=* vitest
```

### Profile Memory Usage

```bash
# Run with memory profiling (macOS)
sudo dtrace -n 'proc:::exec-success /execname == "node"/ { printf("%s", curpsinfo->pr_psargs); }'

# Or use Activity Monitor (macOS) / htop (Linux)
```

### Debug Hanging Tests

```bash
# Run tests with timeout detection
vitest --reporter=verbose --bail=1

# Run single test with debug output
NODE_OPTIONS="--inspect-brk" vitest test/specific.test.ts
```

## Version Information

- **Vitest**: ^3.2.0
- **@effect/vitest**: ^0.25.1
- **Bun**: 1.2.23

## References

- [Vitest Pool Options](https://vitest.dev/config/#pool)
- [Vitest Configuration](https://vitest.dev/config/)
- [@effect/vitest Documentation](https://effect.website/docs/guides/testing/vitest)
- [Effect Resource Management](https://effect.website/docs/guides/resource-management/scope)

