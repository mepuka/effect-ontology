#!/bin/bash
# Pattern matching library for Effect anti-patterns

# Check for override comment
check_override_comment() {
  local code="$1"
  echo "$code" | grep -q "@effect-hook-ignore"
}

# Detect unbounded Effect.all
detect_unbounded_concurrency() {
  local code="$1"

  # Check for override
  if check_override_comment "$code"; then
    return 1  # Not detected (override active)
  fi

  # Pattern 1: Effect.all( without { concurrency:
  if echo "$code" | grep -q "Effect\.all\s*(" && \
     ! echo "$code" | grep -q "concurrency\s*:"; then
    return 0  # Detected
  fi

  # Pattern 2: { concurrency: "unbounded" } string literal
  if echo "$code" | grep -q 'concurrency\s*:\s*"unbounded"'; then
    return 0  # Detected
  fi

  return 1  # Not detected
}

# Detect Effect.fork (should use forkScoped)
detect_fork_usage() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  echo "$code" | grep -q "Effect\.fork\s*("
}

# Detect error eating (catchAll/mapError immediately after definition)
detect_error_eating() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: catchAll with new Error WITHOUT Effect.fail wrapper
  # This is BAD: catchAll(e => new MyError(e))
  # This is GOOD: catchAll(e => Effect.fail(new MyError(e)))
  if echo "$code" | grep -q "catchAll.*new.*Error\s*(" && \
     ! echo "$code" | grep -q "Effect\.fail"; then
    return 0
  fi

  # Pattern: mapError with type coercion
  if echo "$code" | grep -q "mapError.*=>.*as\s"; then
    return 0
  fi

  return 1
}

# Detect Layer.provide on merged layers
detect_layer_provide_misuse() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: mergeAll/merge followed by Layer.provide (not provideMerge)
  if echo "$code" | grep -q "merge" && \
     echo "$code" | grep -q "Layer\.provide\s*(" && \
     ! echo "$code" | grep -q "provideMerge"; then
    return 0
  fi

  return 1
}

# Detect Effect.promise (should use tryPromise)
detect_untyped_promise() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  echo "$code" | grep -q "Effect\.promise\s*("
}

# Detect Layer.effect with resources (should use Layer.scoped)
detect_layer_effect_with_resources() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: Layer.effect with acquireRelease
  if echo "$code" | grep -q "Layer\.effect" && \
     echo "$code" | grep -q "acquireRelease"; then
    return 0
  fi

  return 1
}

# Detect manual retry logic (should use Schedule)
detect_manual_retry() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: for loop with retry counter
  echo "$code" | grep -q "for.*retry.*<.*max"
}

# Detect manual batching (should use Effect.cached or RequestResolver)
detect_manual_batching() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: batch array with push and setTimeout
  if echo "$code" | grep -q "batch.*=.*\[\]" && \
     echo "$code" | grep -q "push" && \
     echo "$code" | grep -q "setTimeout"; then
    return 0
  fi

  return 1
}

# Detect manual pooling (should use Pool.make)
detect_manual_pooling() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: Map with available/acquire pattern
  if echo "$code" | grep -q "pool.*=.*new Map" && \
     echo "$code" | grep -q "available" && \
     echo "$code" | grep -q "acquire"; then
    return 0
  fi

  return 1
}

# Main validation function - checks all patterns
check_all_patterns() {
  local code="$1"
  local errors=""

  if detect_unbounded_concurrency "$code"; then
    errors="${errors}❌ Unbounded concurrency detected. Add { concurrency: N } to Effect.all\n"
  fi

  if detect_fork_usage "$code"; then
    errors="${errors}❌ Effect.fork detected. Use Effect.forkScoped for automatic cleanup\n"
  fi

  if detect_error_eating "$code"; then
    errors="${errors}❌ Error eating detected. Don't catchAll to fix types - check layer composition\n"
  fi

  if detect_layer_provide_misuse "$code"; then
    errors="${errors}❌ Layer.provide on merged layers. Use Layer.provideMerge to preserve shared dependencies\n"
  fi

  if detect_untyped_promise "$code"; then
    errors="${errors}❌ Effect.promise detected. Use Effect.tryPromise with typed error\n"
  fi

  if detect_layer_effect_with_resources "$code"; then
    errors="${errors}❌ Layer.effect with resources. Use Layer.scoped for proper cleanup\n"
  fi

  if detect_manual_retry "$code"; then
    echo "⚠️  Manual retry logic detected. Consider Schedule.exponential: grep -r 'Schedule.exponential' docs/effect-source/effect/src/Schedule.ts" >&2
  fi

  if detect_manual_batching "$code"; then
    echo "⚠️  Manual batching detected. Consider Effect.cached or Request/RequestResolver: grep -r 'RequestResolver' docs/effect-source/" >&2
  fi

  if detect_manual_pooling "$code"; then
    echo "⚠️  Manual pooling detected. Use Pool.make: grep -r 'Pool.make' docs/effect-source/platform/src/Pool.ts" >&2
  fi

  if [[ -n "$errors" ]]; then
    echo -e "$errors" >&2
    exit 2  # Block with exit code 2
  fi

  exit 0  # Allow
}
