#!/bin/bash
# Integration test - verify all hooks work together

set -e

echo "Running Effect Hooks Integration Tests..."
echo ""

# Test 1: SessionStart
echo "Test 1: SessionStart hook..."
TEST_INPUT='{"session_id": "integration-test", "cwd": "'"$(pwd)"'", "hook_event_name": "SessionStart"}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-session-start.sh)

if echo "$RESULT" | jq -e '.continue == true and .additionalContext' >/dev/null; then
  echo "✓ SessionStart hook working"
else
  echo "✗ SessionStart hook failed"
  exit 1
fi

# Test 2: PreToolUse blocking
echo "Test 2: PreToolUse blocks anti-patterns..."
TEST_INPUT='{"tool_name": "Write", "tool_input": {"content": "Effect.all(items.map(x => x))"}}'
if echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1 >/dev/null; then
  echo "✗ PreToolUse should have blocked"
  exit 1
else
  echo "✓ PreToolUse blocking works"
fi

# Test 3: PreToolUse allows good code
echo "Test 3: PreToolUse allows good code..."
TEST_INPUT='{"tool_name": "Write", "tool_input": {"content": "Effect.all(items.map(x => x), { concurrency: 10 })"}}'
if echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh >/dev/null 2>&1; then
  echo "✓ PreToolUse allows good code"
else
  echo "✗ PreToolUse should allow good code"
  exit 1
fi

# Test 4: PostToolUse
echo "Test 4: PostToolUse validates files..."
TEST_FILE="/tmp/integration-test.ts"
echo 'export const test = "test"' > "$TEST_FILE"
TEST_INPUT='{"tool_name": "Write", "tool_input": {"file_path": "'"$TEST_FILE"'"}}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-post-write.sh)

if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ PostToolUse hook working"
else
  echo "✗ PostToolUse hook failed"
  exit 1
fi
rm "$TEST_FILE"

# Test 5: Stop validation
echo "Test 5: Stop validation..."
TEST_INPUT='{"hook_event_name": "Stop"}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-stop-validation.sh)

if echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✓ Stop validation hook working"
else
  echo "✗ Stop validation hook failed"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All integration tests passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Effect hooks are ready to use!"
echo ""
echo "To verify hooks are registered, run:"
echo "  claude --debug"
echo "  /hooks"
