#!/bin/bash
set -euo pipefail

TAG="${1:-latest}"

if [ -z "${ECR_REGISTRY:-}" ] || [ -z "${ECR_REPOSITORY:-}" ] || [ -z "${ECR_PASSWORD:-}" ]; then
  echo "Error: ECR_REGISTRY, ECR_REPOSITORY, and ECR_PASSWORD must be set"
  exit 1
fi

echo "Deploying $ECR_REPOSITORY:$TAG"

echo "$ECR_PASSWORD" | docker login "$ECR_REGISTRY" --username AWS --password-stdin

FULL_IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$TAG"
docker pull "$FULL_IMAGE"

cd /opt/signing-stack

MTSA_IMAGE_VALUE=""
if [ -f .env ]; then
  MTSA_IMAGE_VALUE=$(grep -E '^MTSA_IMAGE=' .env | head -1 | cut -d= -f2- | tr -d '\r' || true)
fi

if [ -n "$MTSA_IMAGE_VALUE" ]; then
  docker pull "$MTSA_IMAGE_VALUE" || {
    echo "Warning: could not pull MTSA_IMAGE=$MTSA_IMAGE_VALUE (using local image if present)"
  }
fi

export GATEWAY_TAG="$TAG"
docker compose up -d signing-gateway mtsa

docker image prune -f

echo "Deploy complete: $FULL_IMAGE"
