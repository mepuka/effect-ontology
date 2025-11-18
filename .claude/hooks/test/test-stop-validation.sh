#!/bin/bash
# Test Stop validation hook

set -e

# Get absolute path to hook before changing directory
HOOK_SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/effect-stop-validation.sh"

# Create test codebase with error eating
mkdir -p /tmp/test-codebase
cat > /tmp/test-codebase/bad-service.ts <<'EOF'
export const myEffect = Effect.gen(function* () {
  yield* serviceA.call()
}).pipe(
  Effect.catchAll(e => new MyError(e))
)
EOF

# Test hook (should block)
cd /tmp/test-codebase
TEST_INPUT='{
  "hook_event_name": "Stop"
}'

RESULT=$(echo "$TEST_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | jq -e '.decision == "block"' >/dev/null 2>&1; then
  echo "✓ Test 1: Blocked on error eating"
else
  echo "✗ Test 1: Should block on error eating"
  echo "Got: $RESULT"
  rm -rf /tmp/test-codebase
  exit 1
fi

# Clean up and create good codebase
rm -rf /tmp/test-codebase
mkdir -p /tmp/test-codebase
cat > /tmp/test-codebase/good-service.ts <<'EOF'
export const myEffect = Effect.gen(function* () {
  yield* serviceA.call()
})
EOF

# Test hook (should continue)
cd /tmp/test-codebase
RESULT=$(echo "$TEST_INPUT" | "$HOOK_SCRIPT")

if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ Test 2: Allowed clean code"
else
  echo "✗ Test 2: Should allow clean code"
  rm -rf /tmp/test-codebase
  exit 1
fi

# Cleanup
rm -rf /tmp/test-codebase

echo ""
echo "Stop validation hook tests passed!"
