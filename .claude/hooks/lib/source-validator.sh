#!/bin/bash
# Effect source validation library

EFFECT_SOURCE_PATH="${EFFECT_SOURCE_PATH:-docs/effect-source}"

# Validate Layer.scoped usage for resources
validate_layer_scoped() {
  local file_path="$1"

  # Check if file has acquireRelease with Layer.effect
  if grep -q "Layer\.effect" "$file_path" && \
     grep -q "acquireRelease" "$file_path"; then
    echo "❌ File uses Layer.effect with acquireRelease - should use Layer.scoped"
    echo "   Reference: grep -r 'Layer.scoped' $EFFECT_SOURCE_PATH/effect/src/Layer.ts"
    return 1
  fi

  return 0
}

# Validate Effect.tryPromise usage
validate_promise_wrapping() {
  local file_path="$1"

  # Find Effect.promise usage
  if grep -q "Effect\.promise\s*(" "$file_path"; then
    echo "❌ File uses Effect.promise - should use Effect.tryPromise with typed error"
    echo "   Reference: grep -r 'tryPromise' $EFFECT_SOURCE_PATH/effect/src/Effect.ts"
    return 1
  fi

  return 0
}

# Validate Config.option for optional config
validate_config_optional() {
  local file_path="$1"
  local issues=""

  # Check for Config.string without Config.option for optional values
  # This is heuristic - looks for config with "optional" in name
  while IFS= read -r line; do
    if echo "$line" | grep -q "Config\.\(string\|number\)" && \
       echo "$line" | grep -qi "optional" && \
       ! echo "$line" | grep -q "Config\.option"; then
      issues="${issues}Possible missing Config.option: $line\n"
    fi
  done < "$file_path"

  if [[ -n "$issues" ]]; then
    echo -e "⚠️  Possible missing Config.option for optional config:"
    echo -e "$issues"
    echo "   Reference: grep -r 'Config.option' $EFFECT_SOURCE_PATH/effect/src/Config.ts"
  fi
}

# Suggest better APIs for common patterns
analyze_for_better_apis() {
  local file_path="$1"
  local suggestions=""

  # Check for manual retry
  if grep -q "for.*retry.*<" "$file_path"; then
    suggestions="${suggestions}📖 Manual retry detected. Consider Schedule APIs:\n"
    suggestions="${suggestions}   grep -r 'Schedule.exponential' $EFFECT_SOURCE_PATH/effect/src/Schedule.ts\n\n"
  fi

  # Check for manual batching
  if grep -q "batch.*=.*\[\].*push" "$file_path"; then
    suggestions="${suggestions}📖 Manual batching detected. Consider Request/RequestResolver:\n"
    suggestions="${suggestions}   grep -r 'RequestResolver' $EFFECT_SOURCE_PATH/\n\n"
  fi

  # Check for manual caching
  if grep -q "cache.*=.*new Map" "$file_path" && \
     ! grep -q "Effect\.cached" "$file_path"; then
    suggestions="${suggestions}📖 Manual caching detected. Consider Effect.cached:\n"
    suggestions="${suggestions}   grep -r 'Effect.cached' $EFFECT_SOURCE_PATH/effect/src/Effect.ts\n\n"
  fi

  echo -e "$suggestions"
}

# Validate file against all Effect source patterns
validate_against_effect_source() {
  local file_path="$1"

  # Skip non-TypeScript files
  if [[ ! "$file_path" =~ \.tsx?$ ]]; then
    return 0
  fi

  local issues=""

  # Run all validators
  if ! validate_layer_scoped "$file_path"; then
    issues="${issues}Layer.scoped validation failed\n"
  fi

  if ! validate_promise_wrapping "$file_path"; then
    issues="${issues}Promise wrapping validation failed\n"
  fi

  validate_config_optional "$file_path"

  if [[ -n "$issues" ]]; then
    echo -e "$issues"
    return 1
  fi

  return 0
}
