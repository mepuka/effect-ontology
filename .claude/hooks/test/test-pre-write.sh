#!/bin/bash
# Test PreToolUse hook

set -e

# Test 1: Block unbounded concurrency
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/tmp/test.ts",
    "content": "Effect.all(items.map(x => process(x)))"
  }
}'

set +e  # Temporarily disable exit on error for this test
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?
set -e  # Re-enable

if [[ $EXIT_CODE -eq 2 ]]; then
  echo "✓ Test 1: Blocked unbounded concurrency (exit 2)"
else
  echo "✗ Test 1: Should block unbounded concurrency (got exit $EXIT_CODE)"
  exit 1
fi

# Test 2: Allow bounded concurrency
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "content": "Effect.all(items.map(x => process(x)), { concurrency: 10 })"
  }
}'

set +e
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ Test 2: Allowed bounded concurrency (exit 0)"
else
  echo "✗ Test 2: Should allow bounded concurrency (got exit $EXIT_CODE)"
  exit 1
fi

# Test 3: Respect override comment
TEST_INPUT='{
  "tool_name": "Edit",
  "tool_input": {
    "new_string": "// @effect-hook-ignore: intentional for testing\nEffect.fork(task)"
  }
}'

set +e
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ Test 3: Respected override comment (exit 0)"
else
  echo "✗ Test 3: Should respect override (got exit $EXIT_CODE)"
  exit 1
fi

echo ""
echo "PreToolUse hook tests passed!"
