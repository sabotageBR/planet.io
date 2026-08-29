#!/usr/bin/env bash
# Builda e publica as imagens do warspace.io no Docker Hub.
# uso: docker login && ./scripts/build-push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${DOCKER_REPO:-evandromoura/warspace-io}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"
DOCKER="${DOCKER_CMD:-docker}"   # ex.: DOCKER_CMD="sudo -n docker"

echo "==> build  ${REPO}-server:${TAG}"
$DOCKER build -f server/Dockerfile -t "${REPO}-server:${TAG}" -t "${REPO}-server:latest" .
echo "==> build  ${REPO}-client:${TAG}"
$DOCKER build -f client/Dockerfile -t "${REPO}-client:${TAG}" -t "${REPO}-client:latest" .

echo "==> push"
$DOCKER push "${REPO}-server:${TAG}"; $DOCKER push "${REPO}-server:latest"
$DOCKER push "${REPO}-client:${TAG}"; $DOCKER push "${REPO}-client:latest"

echo "${TAG}" > .last-tag
echo "==> pronto — tag ${TAG} (gravada em .last-tag, usada pelo deploy.sh)"
