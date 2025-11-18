#!/bin/bash
# Stop/SubagentStop hook - final coherence check

set -e

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"

# Check for error eating patterns
COLLAPSED_ERRORS=$(grep -r "catchAll.*new.*Error" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.worktrees \
  . 2>/dev/null | wc -l)

if [[ $COLLAPSED_ERRORS -gt 0 ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Found $COLLAPSED_ERRORS instance(s) of error collapsing with catchAll. Review error channels - don't catch all errors just to fix type errors. This usually indicates a layer composition issue. Let the compiler guide proper error handling."
}
EOF
  exit 0
fi

# Check for layer composition issues
ORPHANED=$(find_orphaned_dependencies)

if [[ -n "$ORPHANED" ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Layer composition issues detected:\n\n$ORPHANED\n\nUse Layer.provideMerge (not Layer.provide) when providing dependencies to merged layers to preserve shared service instances."
}
EOF
  exit 0
fi

# Check for untyped promises
UNTYPED_PROMISES=$(grep -r "Effect\.promise\s*(" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.worktrees \
  . 2>/dev/null | wc -l)

if [[ $UNTYPED_PROMISES -gt 0 ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Found $UNTYPED_PROMISES instance(s) of Effect.promise. Use Effect.tryPromise with typed errors to maintain type safety in the error channel."
}
EOF
  exit 0
fi

# All checks passed
echo '{"continue": true}'
