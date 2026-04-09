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

export GATEWAY_TAG="$TAG"
docker compose up -d --no-deps signing-gateway
docker image prune -f

echo "Deploy complete: $FULL_IMAGE"
