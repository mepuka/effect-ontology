#!/bin/bash
# Download WebNLG Dataset
#
# Downloads WebNLG 3.0 dataset from GitLab and extracts to benchmarks/datasets/webnlg/

set -e

echo "Downloading WebNLG dataset..."

# Create datasets directory if it doesn't exist
mkdir -p benchmarks/datasets

# Download WebNLG dataset
cd benchmarks/datasets

if [ -d "webnlg" ]; then
  echo "WebNLG dataset already exists at benchmarks/datasets/webnlg"
  echo "Skipping download. Remove the directory to re-download."
  exit 0
fi

echo "Downloading from GitLab..."
curl -L -o webnlg-dataset-master.zip \
  https://gitlab.com/shimorina/webnlg-dataset/-/archive/master/webnlg-dataset-master.zip

echo "Extracting..."
unzip -q webnlg-dataset-master.zip

# Rename to webnlg
mv webnlg-dataset-master webnlg

# Clean up zip file
rm webnlg-dataset-master.zip

# Verify structure
if [ -d "webnlg/release_v3.0/en/train" ] && \
   [ -d "webnlg/release_v3.0/en/dev" ] && \
   [ -d "webnlg/release_v3.0/en/test" ]; then
  echo "✓ WebNLG dataset downloaded successfully"
  echo "  Location: benchmarks/datasets/webnlg/release_v3.0/en/"
  echo "  Splits: train/, dev/, test/"
else
  echo "✗ Error: Dataset structure is incorrect"
  exit 1
fi

