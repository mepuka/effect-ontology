#!/bin/bash
# Test PostToolUse hook

set -e

# Create test file
TEST_FILE="/tmp/test-effect-service.ts"
cat > "$TEST_FILE" <<'EOF'
export class TestService extends Effect.Service<TestService>()("TestService", {
  scoped: Effect.gen(function* () {
    return {
      query: Effect.succeed("test")
    }
  })
}) {}

export const TestServiceLive = Layer.scoped(
  TestService,
  Effect.gen(function* () {
    return new TestService()
  })
)
EOF

# Test hook
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "'"$TEST_FILE"'"
  }
}'

RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-post-write.sh)

# Verify JSON output
if ! echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✗ Invalid JSON output"
  rm "$TEST_FILE"
  exit 1
fi

# Check for continue: true
if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ PostToolUse hook continues"
else
  echo "✗ Hook should continue"
  rm "$TEST_FILE"
  exit 1
fi

# Verify state was updated
if [[ -f ~/.claude/effect-session-state.json ]]; then
  STATE=$(cat ~/.claude/effect-session-state.json)
  if echo "$STATE" | jq -e '.last_scan' >/dev/null; then
    echo "✓ State updated after write"
  else
    echo "✗ State not properly updated"
    rm "$TEST_FILE"
    exit 1
  fi
fi

# Cleanup
rm "$TEST_FILE"

echo ""
echo "PostToolUse hook tests passed!"
