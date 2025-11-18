#!/bin/bash
# Codebase scanning library for Effect patterns

# Scan for Effect.Service definitions
scan_services() {
  local search_path="${1:-.}"

  # Find all service class definitions
  grep -r "class.*extends Effect\.Service" \
    --include="*.ts" \
    --include="*.tsx" \
    "$search_path" 2>/dev/null | \
    grep -o "class \w*" | \
    cut -d' ' -f2 | \
    sort -u | \
    jq -R . | jq -s .
}

# Scan for Layer definitions
scan_layers() {
  local search_path="${1:-.}"

  # Find all Layer.* assignments
  grep -r "const \w*Live.*=.*Layer\." \
    --include="*.ts" \
    --include="*.tsx" \
    "$search_path" 2>/dev/null | \
    grep -o "const \w*Live" | \
    cut -d' ' -f2 | \
    sort -u | \
    jq -R . | jq -s .
}

# Extract service methods from a service file
extract_service_methods() {
  local file_path="$1"

  # Simple extraction: look for method names in return object
  # This is approximate - full AST parsing would be better
  grep -A 20 "return {" "$file_path" | \
    grep -o "^\s*\w*:" | \
    sed 's/://g' | \
    sed 's/^\s*//g' | \
    jq -R . | jq -s .
}

# Build dependency graph from Layer.provide calls
build_dependency_graph() {
  local search_path="${1:-.}"

  # Find all Layer.provide and Layer.provideMerge calls
  # Extract what's being provided to what
  local deps="{}"

  while IFS= read -r line; do
    # Extract layer name and dependencies
    # This is simplified - real implementation would need better parsing
    if echo "$line" | grep -q "Layer.provide"; then
      local layer=$(echo "$line" | grep -o "const \w*" | cut -d' ' -f2)
      deps=$(echo "$deps" | jq --arg layer "$layer" '. + {($layer): []}')
    fi
  done < <(grep -r "Layer\.provide" --include="*.ts" "$search_path" 2>/dev/null)

  echo "$deps"
}

# Update session state after file write
update_session_state() {
  local file_path="$1"
  local state_file="${EFFECT_STATE_FILE:-$HOME/.claude/effect-session-state.json}"

  # If file is a service/layer file, rescan
  if echo "$file_path" | grep -qE "(Service|Layer|Live)\.ts"; then
    # Rescan entire codebase (per-write refresh)
    local layers=$(scan_layers ".")
    local services=$(scan_services ".")
    local deps=$(build_dependency_graph ".")

    # Update state file
    local state="{}"
    if [[ -f "$state_file" ]]; then
      state=$(cat "$state_file")
    fi

    state=$(echo "$state" | jq \
      --argjson layers "$layers" \
      --argjson services "$services" \
      --argjson deps "$deps" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '.layers = $layers | .services = $services | .dependencies = $deps | .last_scan = $timestamp')

    echo "$state" > "$state_file"
  fi
}

# Find orphaned layer dependencies
find_orphaned_dependencies() {
  local state_file="${EFFECT_STATE_FILE:-$HOME/.claude/effect-session-state.json}"

  if [[ ! -f "$state_file" ]]; then
    return
  fi

  # Check for Layer.provide on merged layers
  local orphans=$(grep -r "Layer\.merge.*\.pipe.*Layer\.provide[^M]" \
    --include="*.ts" . 2>/dev/null)

  if [[ -n "$orphans" ]]; then
    echo "$orphans" | while read -r line; do
      echo "⚠️  Possible orphaned dependency: $line"
      echo "   Consider using Layer.provideMerge instead"
    done
  fi
}
