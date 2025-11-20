#!/bin/bash
# Cleanup script for orphaned vitest/bun/node processes
# Run this if you experience memory pressure from leaked test processes

echo "🔍 Searching for orphaned test processes..."

# Find vitest processes
VITEST_PIDS=$(pgrep -f "vitest" || true)

if [ -z "$VITEST_PIDS" ]; then
  echo "✅ No vitest processes found"
else
  echo "Found vitest processes: $VITEST_PIDS"
  echo "🧹 Killing vitest processes..."
  pkill -TERM -f "vitest"
  sleep 2
  
  # Force kill if still running
  REMAINING=$(pgrep -f "vitest" || true)
  if [ ! -z "$REMAINING" ]; then
    echo "⚠️  Some processes didn't exit gracefully, force killing..."
    pkill -KILL -f "vitest"
  fi
  echo "✅ Vitest processes cleaned up"
fi

# Find bun test processes
echo ""
echo "🔍 Checking for orphaned bun test processes..."
BUN_TEST_COUNT=$(pgrep -f "bun.*test" | wc -l | tr -d ' ' || echo "0")

if [ "$BUN_TEST_COUNT" -gt 0 ]; then
  echo "⚠️  Found $BUN_TEST_COUNT bun test processes"
  pkill -TERM -f "bun.*test"
  sleep 1
  echo "✅ Bun test processes cleaned up"
else
  echo "✅ No orphaned bun test processes found"
fi

# Find node/bun worker processes
echo ""
echo "🔍 Checking for orphaned worker processes..."
WORKER_COUNT=$(pgrep -f "(node|bun).*worker" | wc -l | tr -d ' ' || echo "0")

if [ "$WORKER_COUNT" -gt 0 ]; then
  echo "⚠️  Found $WORKER_COUNT worker processes"
  echo "   These might be orphaned test workers."
  echo "   Cleaning up..."
  pkill -TERM -f "(node|bun).*worker"
  sleep 1
  pkill -KILL -f "(node|bun).*worker" 2>/dev/null || true
  echo "✅ Worker processes cleaned up"
else
  echo "✅ No orphaned workers found"
fi

# Show memory usage
echo ""
echo "📊 Current memory usage:"
ps aux | grep -E "(vitest|bun.*test|worker)" | grep -v grep | awk '{print $2, $3, $4, $11}' | head -10 || echo "   No test processes running"

echo ""
echo "✨ Cleanup complete!"

