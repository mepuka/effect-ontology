#!/bin/bash
# PreToolUse hook - fast pattern checks before Write/Edit

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract tool input - handle both Write and Edit
CONTENT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# Skip if no content
if [[ -z "$CONTENT" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Source pattern matchers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/pattern-matchers.sh"

# Run pattern checks (will exit 2 if blocked, 0 if allowed)
check_all_patterns "$CONTENT"
