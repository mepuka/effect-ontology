#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="effect-ontology-core"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
TAG="latest"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run ($REGION)..."

# Build Container
echo "🏗️  Building container..."
docker build -t $IMAGE_NAME:$TAG -f packages/@core-v2/Dockerfile .

# Push to GCR
echo "⬆️  Pushing to GCR..."
docker push $IMAGE_NAME:$TAG

# Deploy
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:$TAG \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production

echo "✅ Deployment complete!"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
