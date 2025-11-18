#!/bin/bash
# Test cases for pattern matchers

set -e

source "$(dirname "$0")/../lib/pattern-matchers.sh"

# Test 1: Detect unbounded Effect.all
TEST_CODE='Effect.all(items.map(x => process(x)))'
if detect_unbounded_concurrency "$TEST_CODE"; then
  echo "✓ Test 1: Unbounded concurrency detected"
else
  echo "✗ Test 1: FAILED to detect unbounded concurrency"
  exit 1
fi

# Test 2: Allow bounded Effect.all
TEST_CODE='Effect.all(items.map(x => process(x)), { concurrency: 10 })'
if ! detect_unbounded_concurrency "$TEST_CODE"; then
  echo "✓ Test 2: Bounded concurrency allowed"
else
  echo "✗ Test 2: FAILED - false positive on bounded concurrency"
  exit 1
fi

# Test 2b: Detect "unbounded" string literal (CRITICAL)
TEST_CODE='Effect.all(items.map(x => process(x)), { concurrency: "unbounded" })'
if detect_unbounded_concurrency "$TEST_CODE"; then
  echo "✓ Test 2b: Unbounded string literal detected"
else
  echo "✗ Test 2b: FAILED to detect unbounded string literal"
  exit 1
fi

# Test 3: Detect Effect.fork (should use forkScoped)
TEST_CODE='const fiber = yield* Effect.fork(task)'
if detect_fork_usage "$TEST_CODE"; then
  echo "✓ Test 3: Effect.fork detected"
else
  echo "✗ Test 3: FAILED to detect Effect.fork"
  exit 1
fi

# Test 4: Detect error eating (BAD - direct instantiation)
TEST_CODE='Effect.catchAll(e => new MyError(e))'
if detect_error_eating "$TEST_CODE"; then
  echo "✓ Test 4: Error eating detected"
else
  echo "✗ Test 4: FAILED to detect error eating"
  exit 1
fi

# Test 4b: Allow valid error transformation with Effect.fail (IMPORTANT)
TEST_CODE='Effect.catchAll(e => Effect.fail(new MyError(e)))'
if ! detect_error_eating "$TEST_CODE"; then
  echo "✓ Test 4b: Valid error transformation allowed"
else
  echo "✗ Test 4b: FAILED - false positive on valid error transformation"
  exit 1
fi

# Test 5: Detect Layer.provide on merged layers
TEST_CODE='Layer.mergeAll(A, B).pipe(Layer.provide(Dep))'
if detect_layer_provide_misuse "$TEST_CODE"; then
  echo "✓ Test 5: Layer.provide misuse detected"
else
  echo "✗ Test 5: FAILED to detect Layer.provide misuse"
  exit 1
fi

# Test 6: Detect override comment
TEST_CODE='// @effect-hook-ignore: intentional fork
const fiber = yield* Effect.fork(task)'
if check_override_comment "$TEST_CODE"; then
  echo "✓ Test 6: Override comment detected"
else
  echo "✗ Test 6: FAILED to detect override comment"
  exit 1
fi

echo ""
echo "All pattern matcher tests passed!"
