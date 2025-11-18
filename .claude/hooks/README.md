# Effect-Focused Claude Code Hooks

Comprehensive hook system to improve Effect-TS usage, catch production pitfalls, and guide API exploration.

## Quick Start

Hooks are automatically active in this project. They will:
- **Block** critical anti-patterns (resource leaks, type safety violations)
- **Warn** about suboptimal implementations
- **Guide** you toward better Effect APIs

## Hook Events

### SessionStart

**Script**: `effect-session-start.sh`

Scans codebase and injects Effect topology context at session start.

**What it does:**
- Finds all Effect services and layers
- Builds dependency graph
- Injects pattern reminders and API exploration guidance
- Creates session state file at `~/.claude/effect-session-state.json`

**Example Output:**
```
Effect Development Session Started

Current Effect Topology:
- Layers: DatabaseLive, ConfigLive, LoggerLive
- Services: Database, Config, Logger

Pattern Reminders:
- Use Layer.scoped (not Layer.effect) for resources with cleanup
- Use Layer.provideMerge (not provide) for merged layers
...
```

### PreToolUse (Write/Edit)

**Script**: `effect-pre-write.sh`

Fast pattern checks **before** code is written. This is the first line of defense.

**Blocks (exit code 2):**
- Unbounded `Effect.all` (missing `concurrency`)
- `Effect.fork` (should use `forkScoped`)
- `Layer.provide` on merged layers (should use `provideMerge`)
- `Effect.promise` (should use `tryPromise`)
- `catchAll` with error eating
- `Layer.effect` with resources (should use `Layer.scoped`)

**Warns (exit code 0 with message):**
- Manual retry logic (consider `Schedule`)
- Manual batching (consider `RequestResolver`)
- Manual pooling (consider `Pool.make`)

### PostToolUse (Write/Edit)

**Script**: `effect-post-write.sh`

Deep validation **after** code is written. Provides comprehensive analysis and guidance.

**Validates:**
- Layer composition correctness
- Resource cleanup patterns against Effect source
- Error channel integrity
- `Config.option` usage for optional config

**Suggests:**
- Better Effect APIs for common patterns
- Source references for canonical implementations
- Links to Effect source code for exploration

**Updates:**
- Session state with new services/layers
- Dependency graph

### Stop/SubagentStop

**Script**: `effect-stop-validation.sh`

Final coherence check before completing work. Ensures no critical issues slip through.

**Blocks if found:**
- Error collapsing patterns (catchAll wrapping errors)
- Orphaned layer dependencies (Layer.provide on merged layers)
- Untyped promise wrappers (Effect.promise usage)

## Escape Hatch

To bypass validation for a specific case, add comment:

```typescript
// @effect-hook-ignore: reason for exception
Effect.fork(specialCase)
```

**Important**: Use sparingly and document why the exception is necessary.

## Testing

### Run Individual Tests

```bash
# Test pattern matchers
.claude/hooks/test/test-patterns.sh

# Test codebase scanner
.claude/hooks/test/test-scanner.sh

# Test session start hook
.claude/hooks/test/test-session-start.sh

# Test pre-write hook
.claude/hooks/test/test-pre-write.sh

# Test post-write hook
.claude/hooks/test/test-post-write.sh

# Test stop validation hook
.claude/hooks/test/test-stop-validation.sh
```

### Run All Tests

```bash
# Run all individual tests
for test in .claude/hooks/test/test-*.sh; do
  echo "Running: $test"
  "$test"
done

# Run integration test
.claude/hooks/test/integration-test.sh
```

### Expected Output

All tests should pass with checkmarks:

```
Running: test-patterns.sh
✓ Test 1: Unbounded concurrency detected
✓ Test 2: Bounded concurrency allowed
✓ Test 3: Effect.fork detected
...
All pattern matcher tests passed!
```

## Debugging

### Enable Debug Mode

```bash
# Launch Claude in debug mode
claude --debug

# Check hook registration
/hooks
```

### View Session State

```bash
# Pretty-print current session state
cat ~/.claude/effect-session-state.json | jq .
```

### Test Hook Manually

```bash
# Test SessionStart hook
echo '{"session_id": "test-123", "cwd": "'"$(pwd)"'", "hook_event_name": "SessionStart"}' | \
  .claude/hooks/effect-session-start.sh

# Test PreToolUse hook
echo '{"tool_name": "Write", "tool_input": {"content": "Effect.all(items)"}}' | \
  .claude/hooks/effect-pre-write.sh

# Test PostToolUse hook
echo '{"tool_name": "Write", "tool_input": {"file_path": "/tmp/test.ts"}}' | \
  .claude/hooks/effect-post-write.sh

# Test Stop hook
echo '{"hook_event_name": "Stop"}' | \
  .claude/hooks/effect-stop-validation.sh
```

### Check Hook Logs

```bash
# If a hook fails, check what it's outputting
.claude/hooks/effect-pre-write.sh 2>&1 <<EOF
{"tool_name": "Write", "tool_input": {"content": "Effect.fork(task)"}}
EOF
```

## Architecture

### Directory Structure

```
.claude/hooks/
├── README.md                      # This file
├── VERIFICATION.md                # Configuration verification log
├── effect-session-start.sh        # SessionStart hook
├── effect-pre-write.sh            # PreToolUse hook
├── effect-post-write.sh           # PostToolUse hook
├── effect-stop-validation.sh      # Stop/SubagentStop hook
├── lib/
│   ├── pattern-matchers.sh        # Anti-pattern detection
│   ├── codebase-scanner.sh        # Service/layer scanning
│   └── source-validator.sh        # Effect source validation
└── test/
    ├── test-patterns.sh           # Pattern matcher tests
    ├── test-scanner.sh            # Scanner tests
    ├── test-session-start.sh      # SessionStart tests
    ├── test-pre-write.sh          # PreToolUse tests
    ├── test-post-write.sh         # PostToolUse tests
    ├── test-stop-validation.sh    # Stop validation tests
    └── integration-test.sh        # Full integration test
```

### Libraries

#### `lib/pattern-matchers.sh`

Regex-based anti-pattern detection.

**Functions:**
- `check_override_comment()` - Check for `@effect-hook-ignore`
- `detect_unbounded_concurrency()` - Find Effect.all without concurrency
- `detect_fork_usage()` - Find Effect.fork (should use forkScoped)
- `detect_error_eating()` - Find catchAll with error wrapping
- `detect_layer_provide_misuse()` - Find Layer.provide on merged layers
- `detect_untyped_promise()` - Find Effect.promise usage
- `detect_layer_effect_with_resources()` - Find Layer.effect with resources
- `detect_manual_retry()` - Find manual retry loops
- `detect_manual_batching()` - Find manual batching logic
- `detect_manual_pooling()` - Find manual pooling logic
- `check_all_patterns()` - Run all pattern checks

#### `lib/codebase-scanner.sh`

Service/layer/dependency scanning.

**Functions:**
- `scan_services()` - Find all Effect.Service definitions
- `scan_layers()` - Find all Layer definitions (*Live)
- `extract_service_methods()` - Extract methods from service
- `build_dependency_graph()` - Build layer dependency graph
- `update_session_state()` - Update state after file write
- `find_orphaned_dependencies()` - Find Layer.provide misuse

#### `lib/source-validator.sh`

Validation against Effect source code.

**Functions:**
- `validate_layer_scoped()` - Check Layer.scoped for resources
- `validate_promise_wrapping()` - Check Effect.tryPromise usage
- `validate_config_optional()` - Check Config.option for optional values
- `analyze_for_better_apis()` - Suggest Effect APIs
- `validate_against_effect_source()` - Run all validators

### State Management

**Session State File**: `~/.claude/effect-session-state.json`

**Structure:**
```json
{
  "session_id": "abc-123",
  "layers": ["DatabaseLive", "ConfigLive", "LoggerLive"],
  "services": ["Database", "Config", "Logger"],
  "dependencies": {
    "AppLive": ["DatabaseLive", "ConfigLive"]
  },
  "last_scan": "2025-11-15T12:30:00Z"
}
```

**Update Frequency:**
- Created on SessionStart
- Updated after every Write/Edit (per-write refresh)
- Contains current codebase topology

### Severity Levels

1. **Block (exit code 2)**: Critical issues that cause production problems
   - Process stops
   - Error message displayed
   - Code is not written

2. **Warn (exit code 0 + systemMessage)**: Suboptimal patterns
   - Process continues
   - Warning displayed
   - Code is written but flagged

3. **Context (exit code 0 + additionalContext)**: Guidance and suggestions
   - Process continues
   - Helpful context injected
   - No immediate action required

### Hook Execution Flow

```
SessionStart
  ├─> Scan codebase
  ├─> Build topology
  ├─> Save state
  └─> Inject context

Write/Edit Request
  ├─> PreToolUse (fast check)
  │   ├─> Pattern matching
  │   ├─> Block if critical
  │   └─> Warn if suboptimal
  │
  ├─> [Tool executes if allowed]
  │
  └─> PostToolUse (deep validation)
      ├─> Source validation
      ├─> Update state
      ├─> Check composition
      └─> Suggest APIs

Stop/SubagentStop
  ├─> Scan final state
  ├─> Check for errors
  └─> Block if issues found
```

## Hook Configuration

Hooks are configured in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-session-start.sh",
        "timeout": 10000
      }]
    }],
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-pre-write.sh",
        "timeout": 5000
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-post-write.sh",
        "timeout": 15000
      }]
    }],
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh",
        "timeout": 10000
      }]
    }],
    "SubagentStop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh",
        "timeout": 10000
      }]
    }]
  }
}
```

**Timeouts:**
- SessionStart: 10s (codebase scan can take time)
- PreToolUse: 5s (fast pattern matching)
- PostToolUse: 15s (deep validation + state update)
- Stop: 10s (final validation)

## Common Issues

### Hook Doesn't Execute

**Symptom**: No messages from hooks during development

**Checks**:
1. Verify hooks in settings: `jq '.hooks' .claude/settings.local.json`
2. Check script permissions: `ls -l .claude/hooks/*.sh`
3. Test manually: `echo '{}' | .claude/hooks/effect-session-start.sh`
4. Enable debug mode: `claude --debug`

### Hook Times Out

**Symptom**: "Hook timed out" error

**Solutions**:
1. Increase timeout in settings
2. Optimize hook script (reduce file scanning)
3. Check for infinite loops in hook logic

### False Positives

**Symptom**: Hook blocks valid code

**Solutions**:
1. Use `@effect-hook-ignore` comment with reason
2. File issue if pattern matcher is too strict
3. Adjust pattern in `lib/pattern-matchers.sh`

### State Not Updating

**Symptom**: Session state shows outdated topology

**Checks**:
1. Verify state file: `cat ~/.claude/effect-session-state.json`
2. Check file permissions: `ls -l ~/.claude/`
3. Test scanner: `source .claude/hooks/lib/codebase-scanner.sh && scan_services .`

## References

- **Design Document**: `docs/plans/2025-11-15-effect-hooks-design.md`
- **Implementation Plan**: `docs/plans/2025-11-15-effect-hooks-implementation.md`
- **Effect Source**: `docs/effect-source/`
- **Production Pitfalls Skill**: `.claude/skills/effect-production-pitfalls/`

## Development

### Adding New Patterns

1. Add detection function to `lib/pattern-matchers.sh`
2. Add test case to `test/test-patterns.sh`
3. Update `check_all_patterns()` to include new check
4. Run tests: `.claude/hooks/test/test-patterns.sh`
5. Update this README with new pattern

### Modifying Hooks

1. Update hook script
2. Update corresponding test
3. Run integration test: `.claude/hooks/test/integration-test.sh`
4. Test manually with real code
5. Update documentation

### Performance Optimization

If hooks slow down development:

1. Profile with `time`:
   ```bash
   time .claude/hooks/effect-post-write.sh < test-input.json
   ```

2. Common optimizations:
   - Cache scan results
   - Limit search depth
   - Skip non-TS files early
   - Use faster grep patterns

3. Adjust timeouts if needed

## Support

For issues or questions:

1. Check this README
2. Run tests to verify hooks are working
3. Enable debug mode: `claude --debug`
4. Review design docs in `docs/plans/`

## License

Part of the Crate project. Same license as project root.
