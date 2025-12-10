#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="effect-ontology-core"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
TAG="latest"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run ($REGION)..."
echo "   Project: $PROJECT_ID"

# Build Container (multi-platform for Cloud Run)
echo "🏗️  Building container for linux/amd64..."
docker build --platform linux/amd64 -t $IMAGE_NAME:$TAG -f packages/@core-v2/Dockerfile .

# Configure Docker for GCR
echo "🔐 Configuring Docker for GCR..."
gcloud auth configure-docker --quiet

# Push to GCR
echo "⬆️  Pushing to GCR..."
docker push $IMAGE_NAME:$TAG

# Deploy with required environment variables
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:$TAG \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 2 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,\
LLM_PROVIDER=anthropic,\
LLM_MODEL=claude-3-5-sonnet-latest,\
LLM_TIMEOUT_MS=60000,\
LLM_MAX_TOKENS=4096,\
LLM_TEMPERATURE=0.1,\
EXTRACTION_CONCURRENCY=4,\
LLM_CONCURRENCY_LIMIT=2,\
ONTOLOGY_PATH=ontologies/football/ontology_skos.ttl,\
STORAGE_BUCKET=effect-ontology-data" \
  --set-secrets "ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"

echo ""
echo "✅ Deployment complete!"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "Test endpoints:"
echo "   $SERVICE_URL/health/live"
echo "   $SERVICE_URL/health/ready"
echo "   $SERVICE_URL/api/v1/extract (POST)"
