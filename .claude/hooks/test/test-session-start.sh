#!/bin/bash
# Test SessionStart hook

set -e

# Create test hook input
TEST_INPUT='{
  "session_id": "test-123",
  "cwd": "'"$(pwd)"'",
  "hook_event_name": "SessionStart"
}'

# Run hook
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-session-start.sh)

# Verify JSON output
if ! echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✗ Invalid JSON output"
  exit 1
fi

# Check for additionalContext
if echo "$RESULT" | jq -e '.additionalContext' >/dev/null; then
  echo "✓ SessionStart hook produces context"
else
  echo "✗ Missing additionalContext"
  exit 1
fi

# Check for continue: true
if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ Hook continues execution"
else
  echo "✗ Hook doesn't continue"
  exit 1
fi

# Verify state file created
if [[ -f ~/.claude/effect-session-state.json ]]; then
  echo "✓ State file created"
else
  echo "✗ State file not created"
  exit 1
fi

echo ""
echo "SessionStart hook tests passed!"
