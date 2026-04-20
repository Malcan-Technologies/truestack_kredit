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

# Resolve compose file (provisioned as docker-compose.yml per docs)
COMPOSE=(docker compose)
if [ -f docker-compose.yml ]; then
  COMPOSE=(docker compose -f docker-compose.yml)
elif [ -f compose.yml ]; then
  COMPOSE=(docker compose -f compose.yml)
fi

echo "Pulling signing-gateway and mtsa images via compose (picks up MTSA_IMAGE and ECR_REGISTRY from .env)..."
"${COMPOSE[@]}" pull signing-gateway mtsa

echo "Recreating signing-gateway and mtsa (so :latest / mtsa-latest digest changes always apply)..."
"${COMPOSE[@]}" up -d --force-recreate signing-gateway mtsa

docker image prune -f

echo "Deploy complete: $FULL_IMAGE"
echo "MTSA_IMAGE from .env: ${MTSA_IMAGE_VALUE:-<unset>}"
