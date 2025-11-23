#!/bin/bash
# Download SciERC Dataset
#
# SciERC (Scientific Information Extraction)
# Entity and relation extraction from scientific abstracts
# Paper: https://aclanthology.org/D18-1360/
# Source: https://nlp.cs.washington.edu/sciIE/

set -e

echo "Downloading SciERC dataset..."

mkdir -p benchmarks/datasets/scierc

cd benchmarks/datasets/scierc

if [ -f "train.json" ]; then
  echo "SciERC dataset already exists"
  exit 0
fi

echo "Downloading from AI2..."

# Download the processed dataset
curl -L -o scierc_data.tar.gz "http://nlp.cs.washington.edu/sciIE/data/sciERC_processed.tar.gz"

echo "Extracting..."
tar -xzf scierc_data.tar.gz
mv processed_data/json/* .
rmdir processed_data/json processed_data

rm scierc_data.tar.gz

echo "✓ SciERC dataset downloaded"
echo "  Location: benchmarks/datasets/scierc/"
echo "  Files: train.json, dev.json, test.json"
echo "  Domain: Scientific abstracts (AI/ML papers)"
echo "  Entity types: Task, Method, Metric, Material, Other-Scientific-Term, Generic"
echo "  Relation types: Used-for, Feature-of, Part-of, Compare, Hyponym-of, Evaluate-for, Conjunction"

# Show sample
echo ""
echo "Sample document:"
head -1 train.json | jq '.doc_key, .sentences[0]' 2>/dev/null || head -1 train.json
