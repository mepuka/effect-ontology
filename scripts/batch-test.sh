#!/bin/bash
#
# Batch Testing Script for Effect Ontology CLI
#
# This script runs comprehensive extraction tests across multiple dimensions:
# - Text files (minimal, standard, dense, long, ambiguous, edge cases)
# - Ontologies (FOAF minimal, Dublin Core)
# - Concurrency settings (1, 3, 5)
# - Window sizes (1, 3, 5)
#
# Usage:
#   ./scripts/batch-test.sh                    # Run all tests
#   ./scripts/batch-test.sh --quick            # Run quick subset
#   ./scripts/batch-test.sh --provider openai  # Use different provider
#
# Requirements:
#   - effect-ontology CLI must be built: bun run build
#   - API key must be set: ANTHROPIC_API_KEY or equivalent
#
# Output:
#   - test-results/<timestamp>/
#     - <test-name>.ttl   - Extracted Turtle output
#     - <test-name>.log   - Execution log with timing
#     - summary.json      - Aggregate results
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_DATA_DIR="$PROJECT_ROOT/test-data"
ONTOLOGY_DIR="$PROJECT_ROOT/packages/core/test/fixtures/ontologies"
RESULTS_DIR="$PROJECT_ROOT/test-results/$(date +%Y%m%d-%H%M%S)"

# Default settings
PROVIDER="${PROVIDER:-anthropic}"
QUICK_MODE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --provider)
            PROVIDER="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--quick] [--provider NAME] [--verbose]"
            echo ""
            echo "Options:"
            echo "  --quick       Run quick subset of tests"
            echo "  --provider    LLM provider (anthropic, openai, gemini, openrouter)"
            echo "  --verbose     Enable verbose output"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test execution function
run_test() {
    local text_file="$1"
    local ontology_file="$2"
    local concurrency="${3:-3}"
    local window_size="${4:-3}"
    local overlap="${5:-1}"

    # Generate test name from parameters
    local text_name=$(basename "$text_file" .txt)
    local ontology_name=$(basename "$ontology_file" .ttl)
    local test_name="${text_name}_${ontology_name}_c${concurrency}_w${window_size}_o${overlap}"

    local output_file="$RESULTS_DIR/${test_name}.ttl"
    local log_file="$RESULTS_DIR/${test_name}.log"

    log_info "Running: $test_name"

    # Record start time
    local start_time=$(date +%s.%N)

    # Convert paths to absolute (required because working directory may change)
    # Construct absolute paths manually (works on both macOS and Linux)
    local abs_text_file
    local abs_ontology_file
    local abs_output_file
    
    # For existing files, use cd + pwd to get absolute path
    abs_text_file=$(cd "$(dirname "$text_file")" && pwd)/$(basename "$text_file")
    abs_ontology_file=$(cd "$(dirname "$ontology_file")" && pwd)/$(basename "$ontology_file")
    # For output file (may not exist yet), construct from RESULTS_DIR
    abs_output_file="$RESULTS_DIR/$(basename "$output_file")"

    # Build CLI args
    # NOTE: Effect CLI requires options to come BEFORE arguments
    # See: https://effect.website/docs/guides/cli/options#important-note-on-argument-order
    local cli_args=(
        "--ontology" "$abs_ontology_file"
        "-O" "$abs_output_file"
        "-c" "$concurrency"
        "-w" "$window_size"
        "--overlap" "$overlap"
        "--provider" "$PROVIDER"
        "$abs_text_file"
    )

    if [[ "$VERBOSE" == "true" ]]; then
        cli_args+=("-v")
    fi

    # Run extraction
    # Load .env file from project root (Bun doesn't auto-load .env files)
    # Run directly without --cwd to avoid argument parsing issues
    local exit_code=0
    (
        cd "$PROJECT_ROOT"
        bun --env-file=.env packages/cli/src/main.ts extract "${cli_args[@]}"
    ) > "$log_file" 2>&1 || exit_code=$?

    # Record end time
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)

    # Append metadata to log
    echo "" >> "$log_file"
    echo "=== Test Metadata ===" >> "$log_file"
    echo "exit_code=$exit_code" >> "$log_file"
    echo "duration_seconds=$duration" >> "$log_file"
    echo "provider=$PROVIDER" >> "$log_file"
    echo "text_file=$text_file" >> "$log_file"
    echo "ontology_file=$ontology_file" >> "$log_file"
    echo "concurrency=$concurrency" >> "$log_file"
    echo "window_size=$window_size" >> "$log_file"
    echo "overlap=$overlap" >> "$log_file"

    # Check output file
    if [[ -f "$output_file" ]]; then
        local triple_count=$(grep -c "^[^@#]" "$output_file" 2>/dev/null || echo "0")
        local file_size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo "0")
        echo "triple_count=$triple_count" >> "$log_file"
        echo "output_size_bytes=$file_size" >> "$log_file"
    else
        echo "triple_count=0" >> "$log_file"
        echo "output_size_bytes=0" >> "$log_file"
    fi

    # Report result
    if [[ $exit_code -eq 0 ]]; then
        log_success "$test_name (${duration}s)"
        return 0
    else
        log_error "$test_name (exit code: $exit_code)"
        return 1
    fi
}

# Define test configurations
declare -a QUICK_TEXTS=(
    "minimal/single-sentence.txt"
    "foaf/standard-001.txt"
    "foaf/standard-003.txt"
)

declare -a ALL_TEXTS=(
    "minimal/empty.txt"
    "minimal/single-word.txt"
    "minimal/single-sentence.txt"
    "foaf/standard-001.txt"
    "foaf/standard-002.txt"
    "foaf/standard-003.txt"
    "dense/network-001.txt"
    "dense/network-002.txt"
    "long/chapter-001.txt"
    "long/multi-chapter.txt"
    "ambiguous/coreference.txt"
    "ambiguous/same-names.txt"
    "ambiguous/temporal.txt"
    "edge-cases/unicode.txt"
    "edge-cases/special-chars.txt"
    "edge-cases/urls-emails.txt"
)

declare -a ONTOLOGIES=(
    "foaf-minimal.ttl"
)

declare -a CONCURRENCY_SETTINGS=(1 3)
declare -a WINDOW_SETTINGS=(3)

# Quick mode uses fewer configurations
if [[ "$QUICK_MODE" == "true" ]]; then
    TEXTS=("${QUICK_TEXTS[@]}")
    CONCURRENCY_SETTINGS=(3)
    log_info "Running in quick mode (subset of tests)"
else
    TEXTS=("${ALL_TEXTS[@]}")
fi

# Main execution
main() {
    log_info "Effect Ontology Batch Testing"
    log_info "=============================="
    log_info "Provider: $PROVIDER"
    log_info "Results: $RESULTS_DIR"
    log_info ""

    # Create results directory
    mkdir -p "$RESULTS_DIR"

    # Track results
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    local skipped_tests=0

    # Calculate total tests
    local num_texts=${#TEXTS[@]}
    local num_ontologies=${#ONTOLOGIES[@]}
    local num_concurrency=${#CONCURRENCY_SETTINGS[@]}
    local num_windows=${#WINDOW_SETTINGS[@]}
    local expected_total=$((num_texts * num_ontologies * num_concurrency * num_windows))

    log_info "Expected tests: $expected_total"
    log_info ""

    # Run tests
    for text in "${TEXTS[@]}"; do
        local text_path="$TEST_DATA_DIR/$text"

        # Check if text file exists
        if [[ ! -f "$text_path" ]]; then
            log_warn "Text file not found: $text_path"
            ((skipped_tests++))
            continue
        fi

        for ontology in "${ONTOLOGIES[@]}"; do
            local ontology_path="$ONTOLOGY_DIR/$ontology"

            # Check if ontology file exists
            if [[ ! -f "$ontology_path" ]]; then
                log_warn "Ontology file not found: $ontology_path"
                ((skipped_tests++))
                continue
            fi

            for concurrency in "${CONCURRENCY_SETTINGS[@]}"; do
                for window in "${WINDOW_SETTINGS[@]}"; do
                    ((total_tests++))

                    if run_test "$text_path" "$ontology_path" "$concurrency" "$window" 1; then
                        ((passed_tests++))
                    else
                        ((failed_tests++))
                    fi

                    # Small delay between tests to avoid rate limiting
                    sleep 1
                done
            done
        done
    done

    # Generate summary
    log_info ""
    log_info "=============================="
    log_info "Test Summary"
    log_info "=============================="
    log_info "Total:   $total_tests"
    log_success "Passed:  $passed_tests"
    if [[ $failed_tests -gt 0 ]]; then
        log_error "Failed:  $failed_tests"
    else
        log_info "Failed:  $failed_tests"
    fi
    if [[ $skipped_tests -gt 0 ]]; then
        log_warn "Skipped: $skipped_tests"
    fi

    # Write summary JSON
    cat > "$RESULTS_DIR/summary.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "provider": "$PROVIDER",
  "quick_mode": $QUICK_MODE,
  "total_tests": $total_tests,
  "passed": $passed_tests,
  "failed": $failed_tests,
  "skipped": $skipped_tests,
  "pass_rate": $(echo "scale=2; $passed_tests * 100 / $total_tests" | bc 2>/dev/null || echo "0")
}
EOF

    log_info ""
    log_info "Results written to: $RESULTS_DIR"
    log_info "Summary: $RESULTS_DIR/summary.json"

    # Exit with appropriate code
    if [[ $failed_tests -gt 0 ]]; then
        exit 1
    fi
}

# Run main
main
