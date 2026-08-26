#!/usr/bin/env bash
# Builda e publica as imagens do planet.io no Docker Hub.
# uso: docker login && ./scripts/build-push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${DOCKER_REPO:-evandromoura/planet-io}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"

echo "==> build  ${REPO}-server:${TAG}"
docker build -t "${REPO}-server:${TAG}" -t "${REPO}-server:latest" server
echo "==> build  ${REPO}-client:${TAG}"
docker build -t "${REPO}-client:${TAG}" -t "${REPO}-client:latest" client

echo "==> push"
docker push "${REPO}-server:${TAG}"; docker push "${REPO}-server:latest"
docker push "${REPO}-client:${TAG}"; docker push "${REPO}-client:latest"

echo "${TAG}" > .last-tag
echo "==> pronto — tag ${TAG} (gravada em .last-tag, usada pelo deploy.sh)"
