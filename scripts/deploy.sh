#!/usr/bin/env bash
# Aplica os manifestos no cluster (namespace planet).
# uso:  ./scripts/deploy.sh                 # sem ingress (usa o NodePort 30800)
#       PLANET_HOST=planet.seudominio.com ./scripts/deploy.sh   # com ingress + TLS
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${DOCKER_REPO:-evandromoura/planet-io}"
TAG="${TAG:-$(cat .last-tag 2>/dev/null || git rev-parse --short HEAD)}"
HOST="${PLANET_HOST:-}"
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4}"
DOCKER="${DOCKER_CMD:-docker}"   # ex.: DOCKER_CMD="sudo -n docker" se o socket exigir root

# aplica via API do k8s (server-side apply) — não exige kubectl nem imagem extra.
# Se você tiver kubectl no PATH, ele é usado.
OUT=k8s/.rendered; rm -rf "$OUT"; mkdir -p "$OUT"
for f in k8s/*.yaml; do
  base=$(basename "$f")
  if [ "$base" = "30-ingress.yaml" ] && [ -z "$HOST" ]; then continue; fi
  sed -e "s|__IMAGE_SERVER__|${REPO}-server:${TAG}|g" \
      -e "s|__IMAGE_CLIENT__|${REPO}-client:${TAG}|g" \
      -e "s|__HOST__|${HOST}|g" "$f" > "$OUT/$base"
done

# o Secret planet-db (DATABASE_URL) não fica no repo: precisa existir antes do deploy
if ! KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --exists Secret planet-db; then
  echo "!! Secret planet-db não existe: o jogo sobe SEM persistência (scores/ranking não gravam). Crie com: ./scripts/db-secret.sh"; fi

echo "==> aplicando (tag ${TAG}${HOST:+, host ${HOST}})"
if command -v kubectl >/dev/null 2>&1; then
  kubectl --kubeconfig="$KUBECONFIG_FILE" apply -f "$OUT"
else
  KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py "$OUT"/*.yaml
fi

echo "==> aguardando os pods"
KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --status || echo "(atenção: nem tudo ficou pronto no prazo)"
KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --get pods

echo "==> teste: http://192.168.12.50:30800${HOST:+  |  https://$HOST}"
