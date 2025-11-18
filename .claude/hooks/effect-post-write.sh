#!/bin/bash
# PostToolUse hook - deep validation and state refresh

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract file path
FILE_PATH=$(echo "$HOOK_INPUT" | jq -r '.tool_input.file_path // ""')

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Skip if file doesn't exist (might have been deleted)
if [[ ! -f "$FILE_PATH" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"
source "$SCRIPT_DIR/lib/source-validator.sh"

# Update session state (per-write refresh)
update_session_state "$FILE_PATH"

# Run source validation
SOURCE_ISSUES=""
if ! validate_against_effect_source "$FILE_PATH" 2>&1; then
  SOURCE_ISSUES=$(validate_against_effect_source "$FILE_PATH" 2>&1)
fi

# Get API suggestions
API_SUGGESTIONS=$(analyze_for_better_apis "$FILE_PATH")

# Check for layer composition issues
STATE_FILE="$HOME/.claude/effect-session-state.json"
COMPOSITION_ISSUES=""
if [[ -f "$STATE_FILE" ]]; then
  COMPOSITION_ISSUES=$(find_orphaned_dependencies)
fi

# Build response
if [[ -n "$SOURCE_ISSUES" || -n "$COMPOSITION_ISSUES" ]]; then
  # Has issues - add warning
  MESSAGE="⚠️  Effect Validation Issues:"
  [[ -n "$SOURCE_ISSUES" ]] && MESSAGE="$MESSAGE\n\n$SOURCE_ISSUES"
  [[ -n "$COMPOSITION_ISSUES" ]] && MESSAGE="$MESSAGE\n\n$COMPOSITION_ISSUES"

  ADDITIONAL=""
  [[ -n "$API_SUGGESTIONS" ]] && ADDITIONAL="$API_SUGGESTIONS\n\nSearch Effect source: docs/effect-source/"

  cat <<EOF
{
  "continue": true,
  "systemMessage": $(echo -e "$MESSAGE" | jq -Rs .),
  "additionalContext": $(echo -e "$ADDITIONAL" | jq -Rs .)
}
EOF
else
  # No issues - maybe just suggestions
  if [[ -n "$API_SUGGESTIONS" ]]; then
    cat <<EOF
{
  "continue": true,
  "additionalContext": $(echo -e "$API_SUGGESTIONS" | jq -Rs .)
}
EOF
  else
    echo '{"continue": true}'
  fi
fi
