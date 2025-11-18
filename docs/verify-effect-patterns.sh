#!/bin/bash

echo "Verifying Effect-TS patterns..."
echo ""

errors=0

# Check for wrong package names (excluding checklist lines)
if grep -n "from \"effect-atom\"" docs/*.md | grep -v "^\["; then
  echo "❌ Found incorrect 'effect-atom' package (should be @effect-atom/atom-react)"
  errors=$((errors+1))
else
  echo "✓ No incorrect effect-atom imports"
fi

# Check for HttpClient.client (excluding checklist lines)
if grep -n "HttpClient\.client" docs/*.md | grep -v "No references to"; then
  echo "❌ Found invalid HttpClient.client reference"
  errors=$((errors+1))
else
  echo "✓ No invalid HttpClient.client references"
fi

# Check for bodyJson (should be jsonBody) - excluding checklist lines
if grep -n "bodyJson" docs/*.md | grep -v "not \`bodyJson\`"; then
  echo "❌ Found bodyJson (should be jsonBody)"
  errors=$((errors+1))
else
  echo "✓ Using correct jsonBody API"
fi

# Check for dateFromString (should be DateFromString) - excluding checklist lines
if grep -n "dateFromString" docs/*.md | grep -v "not \`dateFromString\`"; then
  echo "❌ Found dateFromString (should be DateFromString)"
  errors=$((errors+1))
else
  echo "✓ Using correct DateFromString"
fi

# Check for Atom.fnEffect
if grep -n "Atom\.fnEffect" docs/*.md | grep -v "^\["; then
  echo "⚠️  Found Atom.fnEffect (may not exist, use Atom.fn + Effect.fn)"
  errors=$((errors+1))
else
  echo "✓ No Atom.fnEffect usage"
fi

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "❌ Found $errors issue(s)"
  exit 1
fi
