#!/bin/bash
# Test codebase scanner

set -e

source "$(dirname "$0")/../lib/codebase-scanner.sh"

# Create test directory structure
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/src"

# Create test service file
cat > "$TEST_DIR/src/TestService.ts" <<'EOF'
export class TestService extends Effect.Service<TestService>()("TestService", {
  scoped: Effect.gen(function* () {
    return {
      query: (id: string) => Effect.succeed(id),
      update: (id: string, data: any) => Effect.succeed(data)
    }
  })
}) {}

export const TestServiceLive = Layer.scoped(
  TestService,
  Effect.gen(function* () {
    const config = yield* Config
    return new TestService()
  })
)
EOF

# Create test layer file
cat > "$TEST_DIR/src/Layers.ts" <<'EOF'
const DatabaseLive = Layer.scoped(Database, makeDatabase)
const ConfigLive = Layer.effect(Config, loadConfig)

const AppLive = Layer.mergeAll(DatabaseLive, LoggerLive).pipe(
  Layer.provideMerge(ConfigLive)
)
EOF

# Test scanning
cd "$TEST_DIR"
RESULT=$(scan_services "src")

if echo "$RESULT" | grep -q "TestService"; then
  echo "✓ Service scanning works"
else
  echo "✗ Service scanning failed"
  rm -rf "$TEST_DIR"
  exit 1
fi

LAYERS=$(scan_layers "src")
if echo "$LAYERS" | grep -q "DatabaseLive"; then
  echo "✓ Layer scanning works"
else
  echo "✗ Layer scanning failed"
  rm -rf "$TEST_DIR"
  exit 1
fi

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "All scanner tests passed!"
