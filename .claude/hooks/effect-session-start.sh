#!/bin/bash
# SessionStart hook - scan codebase and inject Effect guidance

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract session info
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"

# Scan codebase
cd "$CWD"
LAYERS=$(scan_layers "." 2>/dev/null || echo '[]')
SERVICES=$(scan_services "." 2>/dev/null || echo '[]')
DEPS=$(build_dependency_graph "." 2>/dev/null || echo '{}')

# Save state
STATE_FILE="$HOME/.claude/effect-session-state.json"
cat > "$STATE_FILE" <<EOF
{
  "session_id": "$SESSION_ID",
  "layers": $LAYERS,
  "services": $SERVICES,
  "dependencies": $DEPS,
  "last_scan": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Build context message
LAYERS_LIST=$(echo "$LAYERS" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')
SERVICES_LIST=$(echo "$SERVICES" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')

CONTEXT="## Effect Development Session Started

**Current Effect Topology:**
- **Layers**: ${LAYERS_LIST:-none found}
- **Services**: ${SERVICES_LIST:-none found}

**Pattern Reminders:**
- Use \`Layer.scoped\` (not \`Layer.effect\`) for resources with cleanup
- Use \`Layer.provideMerge\` (not \`provide\`) for merged layers to preserve shared dependencies
- Leave error channels clear - let the compiler guide error handling, don't collapse with catchAll
- Use \`Effect.tryPromise\` with typed errors, never \`Effect.promise\`
- Wrap \`Effect.forkScoped\` in \`Effect.scoped\` for cleanup
- Add \`{ concurrency: N }\` to all \`Effect.all\` calls

**Effect API Exploration:**
Before implementing common patterns, search Effect source for existing utilities:
- Batching/deduplication → \`Effect.cached\`, \`Request\`/\`RequestResolver\`
- Retries with backoff → \`Schedule.exponential\`, \`Schedule.spaced\`
- Resource pooling → \`Pool.make\`
- Streaming data → \`Stream.*\`, \`Sink.*\`

Search commands:
\`\`\`bash
grep -r 'export.*function.*pattern' docs/effect-source/effect/src/
grep -r 'Schedule\\.' docs/effect-source/effect/src/Schedule.ts
\`\`\`

**Local Effect Source**: docs/effect-source/ (always reference before writing Effect code)

**Session State**: ~/.claude/effect-session-state.json"

# Output JSON response
cat <<EOF
{
  "continue": true,
  "additionalContext": $(echo "$CONTEXT" | jq -Rs .)
}
EOF
