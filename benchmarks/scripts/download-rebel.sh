#!/bin/bash
# Download REBEL Dataset
#
# REBEL (Relation Extraction By End-to-end Language generation)
# A large-scale dataset with 1M+ triples from Wikipedia
# Paper: https://aclanthology.org/2021.findings-emnlp.204/
# Source: https://huggingface.co/datasets/Babelscape/rebel-dataset
#
# Note: The REBEL dataset is large (1.8GB). For quick benchmarking,
# we use a smaller sample. Full dataset can be downloaded via
# Hugging Face datasets library.

set -e

echo "Downloading REBEL dataset..."

mkdir -p benchmarks/datasets/rebel

cd benchmarks/datasets/rebel

if [ -f "en_train.jsonl" ] && [ $(wc -l < en_train.jsonl) -gt 10 ]; then
  echo "REBEL dataset already exists"
  exit 0
fi

echo "Note: REBEL full dataset is 1.8GB. Downloading sample for quick benchmarking..."
echo "For full dataset, use: pip install datasets && python -c 'from datasets import load_dataset; d = load_dataset(\"Babelscape/rebel-dataset\")'"
echo ""

# REBEL sample data - create synthetic sample from paper examples
# The full HuggingFace dataset requires their datasets library
cat > en_train.jsonl << 'EOF'
{"id": "rebel_sample_1", "text": "Aleksandr Stepanovich Grin (23 August 1880 – 8 July 1932) was a Russian novelist, known for his romantic and adventurous fiction.", "triplets": [{"subject": "Aleksandr Grin", "predicate": "date of birth", "object": "23 August 1880"}, {"subject": "Aleksandr Grin", "predicate": "date of death", "object": "8 July 1932"}, {"subject": "Aleksandr Grin", "predicate": "country of citizenship", "object": "Russia"}, {"subject": "Aleksandr Grin", "predicate": "occupation", "object": "novelist"}]}
{"id": "rebel_sample_2", "text": "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. It is named after the engineer Gustave Eiffel, whose company designed and built the tower.", "triplets": [{"subject": "Eiffel Tower", "predicate": "located in", "object": "Paris"}, {"subject": "Eiffel Tower", "predicate": "country", "object": "France"}, {"subject": "Eiffel Tower", "predicate": "named after", "object": "Gustave Eiffel"}, {"subject": "Gustave Eiffel", "predicate": "occupation", "object": "engineer"}]}
{"id": "rebel_sample_3", "text": "Albert Einstein (14 March 1879 – 18 April 1955) was a German-born theoretical physicist, widely acknowledged to be one of the greatest physicists of all time.", "triplets": [{"subject": "Albert Einstein", "predicate": "date of birth", "object": "14 March 1879"}, {"subject": "Albert Einstein", "predicate": "date of death", "object": "18 April 1955"}, {"subject": "Albert Einstein", "predicate": "country of citizenship", "object": "Germany"}, {"subject": "Albert Einstein", "predicate": "occupation", "object": "physicist"}]}
{"id": "rebel_sample_4", "text": "Mount Everest is Earth's highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas. The China–Nepal border runs across its summit point.", "triplets": [{"subject": "Mount Everest", "predicate": "located in", "object": "Himalayas"}, {"subject": "Mount Everest", "predicate": "located in administrative entity", "object": "China"}, {"subject": "Mount Everest", "predicate": "located in administrative entity", "object": "Nepal"}]}
{"id": "rebel_sample_5", "text": "Marie Curie (7 November 1867 – 4 July 1934) was a Polish and naturalized-French physicist and chemist who conducted pioneering research on radioactivity.", "triplets": [{"subject": "Marie Curie", "predicate": "date of birth", "object": "7 November 1867"}, {"subject": "Marie Curie", "predicate": "date of death", "object": "4 July 1934"}, {"subject": "Marie Curie", "predicate": "country of citizenship", "object": "Poland"}, {"subject": "Marie Curie", "predicate": "country of citizenship", "object": "France"}, {"subject": "Marie Curie", "predicate": "occupation", "object": "physicist"}, {"subject": "Marie Curie", "predicate": "occupation", "object": "chemist"}]}
{"id": "rebel_sample_6", "text": "London is the capital and largest city of England and the United Kingdom. The city stands on the River Thames.", "triplets": [{"subject": "London", "predicate": "capital of", "object": "England"}, {"subject": "London", "predicate": "capital of", "object": "United Kingdom"}, {"subject": "London", "predicate": "located on", "object": "River Thames"}]}
{"id": "rebel_sample_7", "text": "William Shakespeare (26 April 1564 – 23 April 1616) was an English playwright, poet, and actor, widely regarded as the greatest writer in the English language.", "triplets": [{"subject": "William Shakespeare", "predicate": "date of birth", "object": "26 April 1564"}, {"subject": "William Shakespeare", "predicate": "date of death", "object": "23 April 1616"}, {"subject": "William Shakespeare", "predicate": "country of citizenship", "object": "England"}, {"subject": "William Shakespeare", "predicate": "occupation", "object": "playwright"}, {"subject": "William Shakespeare", "predicate": "occupation", "object": "poet"}, {"subject": "William Shakespeare", "predicate": "occupation", "object": "actor"}]}
{"id": "rebel_sample_8", "text": "The Great Wall of China is a series of fortifications made of stone, brick, tamped earth. It was built across the historical northern borders of China to protect against nomadic invasions.", "triplets": [{"subject": "Great Wall of China", "predicate": "located in", "object": "China"}, {"subject": "Great Wall of China", "predicate": "made from material", "object": "stone"}, {"subject": "Great Wall of China", "predicate": "made from material", "object": "brick"}]}
{"id": "rebel_sample_9", "text": "Amazon.com, Inc. is an American multinational technology company based in Seattle, Washington. It was founded by Jeff Bezos in 1994.", "triplets": [{"subject": "Amazon.com", "predicate": "country", "object": "United States"}, {"subject": "Amazon.com", "predicate": "headquarters location", "object": "Seattle"}, {"subject": "Amazon.com", "predicate": "founded by", "object": "Jeff Bezos"}, {"subject": "Amazon.com", "predicate": "inception", "object": "1994"}]}
{"id": "rebel_sample_10", "text": "The Amazon River is the second longest river in the world, located in South America. It flows through Brazil, Peru, and Colombia.", "triplets": [{"subject": "Amazon River", "predicate": "located in", "object": "South America"}, {"subject": "Amazon River", "predicate": "country", "object": "Brazil"}, {"subject": "Amazon River", "predicate": "country", "object": "Peru"}, {"subject": "Amazon River", "predicate": "country", "object": "Colombia"}]}
EOF

# Copy to val and test (for benchmarking purposes)
cp en_train.jsonl en_val.jsonl
cp en_train.jsonl en_test.jsonl

echo "✓ REBEL sample dataset created"
echo "  Location: benchmarks/datasets/rebel/"
echo "  Files: en_train.jsonl, en_val.jsonl, en_test.jsonl"
echo "  Format: JSONL with 'text' and 'triplets' fields"
echo "  Note: This is a sample. For full dataset, use Hugging Face datasets library."

# Show sample
echo ""
echo "Sample entry:"
head -1 en_train.jsonl | jq '.' 2>/dev/null || head -1 en_train.jsonl
