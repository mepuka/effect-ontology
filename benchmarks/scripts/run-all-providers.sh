#!/bin/bash
# Run Benchmarks with All Providers
#
# Runs benchmark suite with Anthropic and Gemini providers using all samples.
# Results are saved with provider names in the filename.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Benchmark Suite - All Providers${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}Warning: .env file not found in project root${NC}"
  echo "  Create .env file with your API keys:"
  echo "    VITE_LLM_ANTHROPIC_API_KEY=sk-ant-..."
  echo "    VITE_LLM_GEMINI_API_KEY=..."
fi

# Default values
DATASET="${DATASET:-webnlg}"
SPLIT="${SPLIT:-dev}"
MODE="${MODE:-strict}"
TRACE="${TRACE:-true}"

echo "Configuration:"
echo "  Dataset: $DATASET"
echo "  Split: $SPLIT"
echo "  Mode: $MODE"
echo "  Samples: all"
echo "  Trace: $TRACE"
echo ""

# Create results directory if it doesn't exist
mkdir -p benchmarks/results

# Function to run benchmark for a provider
run_benchmark() {
  local provider=$1
  local provider_upper=$(echo $provider | tr '[:lower:]' '[:upper:]')
  local timestamp=$(date +"%Y-%m-%dT%H-%M-%S-%3N")
  local output_file="benchmarks/results/${DATASET}-${SPLIT}-${provider}-${timestamp}.json"
  
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Running benchmark with ${provider_upper}${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  
  # Run benchmark with .env file and provider override
  VITE_LLM_PROVIDER=${provider} bun --env-file=.env \
    run benchmarks/src/cli.ts \
    --dataset "$DATASET" \
    --split "$SPLIT" \
    --samples all \
    --mode "$MODE" \
    --output "$output_file" \
    --trace "$TRACE"
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ${provider_upper} benchmark completed${NC}"
    echo "  Results saved to: $output_file"
  else
    echo -e "${YELLOW}✗ ${provider_upper} benchmark failed${NC}"
    return 1
  fi
  
  echo ""
}

# Run benchmarks
echo -e "${BLUE}Starting benchmark runs...${NC}"
echo ""

# Run Anthropic
run_benchmark "anthropic"

# Run Gemini
run_benchmark "gemini"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All benchmarks completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Results saved in: benchmarks/results/"

