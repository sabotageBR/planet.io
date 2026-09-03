#!/usr/bin/env bash
# Aplica os manifestos no cluster (namespace warspace).
# uso:  ./scripts/deploy.sh                 # com ingress + TLS em warspace.io
#       NO_INGRESS=1 ./scripts/deploy.sh    # sem ingress (só o NodePort 30800)
#       WARSPACE_HOST=outro.dominio ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${DOCKER_REPO:-evandromoura/warspace-io}"
TAG="${TAG:-$(cat .last-tag 2>/dev/null || git rev-parse --short HEAD)}"
# O Ingress é a porta de entrada do jogo, não um extra: por padrão ele VAI junto. NO_INGRESS=1 pula,
# para testar só pelo NodePort enquanto o DNS não aponta para o cluster.
if [ -n "${NO_INGRESS:-}" ]; then HOST=""; else HOST="${WARSPACE_HOST:-warspace.io}"; fi
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4}"
DOCKER="${DOCKER_CMD:-docker}"   # ex.: DOCKER_CMD="sudo -n docker" se o socket exigir root

# aplica via API do k8s (server-side apply) — não exige kubectl nem imagem extra.
# Se você tiver kubectl no PATH, ele é usado.
# ⚠️ DUAS FASES, e a ordem é o ponto: o cliente vai para um subdiretório e só é aplicado DEPOIS que os
# shards terminaram de subir. O Deployment do cliente fica pronto em segundos e o StatefulSet é
# sequencial (12–24 pods, minutos): publicando junto, o cliente NOVO passa o rollout inteiro sorteando
# shards ANTIGOS pelo /api/config. Isso não é fatal desde que o cliente sabe reconectar noutro shard
# (client/src/game/index.js:onStale), mas evitar é melhor que remediar — e é de graça.
OUT=k8s/.rendered; rm -rf "$OUT"; mkdir -p "$OUT/cliente"
for f in k8s/*.yaml; do
  base=$(basename "$f")
  if [ "$base" = "30-ingress.yaml" ] && [ -z "$HOST" ]; then continue; fi
  dir="$OUT"; [ "$base" = "20-client.yaml" ] && dir="$OUT/cliente"
  sed -e "s|__IMAGE_SERVER__|${REPO}-server:${TAG}|g" \
      -e "s|__IMAGE_CLIENT__|${REPO}-client:${TAG}|g" \
      -e "s|__HOST__|${HOST}|g" "$f" > "$dir/$base"
done

# o Secret warspace-db (DATABASE_URL) não fica no repo: precisa existir antes do deploy
if ! KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --exists Secret warspace-db; then
  echo "!! Secret warspace-db não existe: o jogo sobe SEM persistência (scores/ranking não gravam). Crie com: ./scripts/db-secret.sh"; fi

# ⚠️ A TAG É O SHA DO COMMIT (build-push.sh) e os manifestos usam `imagePullPolicy: IfNotPresent`:
# rebuildar SEM commitar deixa o pod template idêntico, o Kubernetes não faz rollout NENHUM e ninguém
# avisa — o jogador continua na build antiga achando que você publicou.
echo "==> aplicando servidor e infra (tag ${TAG}${HOST:+, host ${HOST}})"
aplica(){ if command -v kubectl >/dev/null 2>&1; then kubectl --kubeconfig="$KUBECONFIG_FILE" apply -f "$1";
  else KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py "$1"/*.yaml; fi; }
aplica "$OUT"

echo "==> aguardando os shards antes de publicar o cliente"
KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --status server || echo "(atenção: os shards não ficaram prontos no prazo; publicando o cliente assim mesmo)"

echo "==> aplicando o cliente"
aplica "$OUT/cliente"

echo "==> aguardando os pods"
KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --status || echo "(atenção: nem tudo ficou pronto no prazo)"
KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py --get pods

echo "==> teste: http://192.168.12.50:30800${HOST:+  |  https://$HOST}"
