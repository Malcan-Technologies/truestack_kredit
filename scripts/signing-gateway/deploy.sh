#!/bin/bash
set -euo pipefail

TAG="${1:-latest}"
echo "Deploying signing-gateway:$TAG"

echo "$GHCR_TOKEN" | docker login ghcr.io -u deploy --password-stdin
docker pull "ghcr.io/truestack/signing-gateway:$TAG"

cd /opt/signing-stack
docker compose up -d --no-deps signing-gateway
docker image prune -f

echo "Deploy complete."
