#!/usr/bin/env bash
# Cria/atualiza o Secret warspace-db (DATABASE_URL) no namespace warspace a partir do .env da raiz.
# uso: ./scripts/db-secret.sh            (lê DATABASE_URL de .env ou do ambiente)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${DATABASE_URL:?defina DATABASE_URL no .env (ex.: postgres://planet:senha@192.168.10.10:5432/planet)}"
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4}"
mkdir -p k8s/.rendered
B64=$(printf '%s' "$DATABASE_URL" | base64 -w0)
cat > k8s/.rendered/05-secret.yaml <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: warspace-db
  namespace: warspace
type: Opaque
data:
  DATABASE_URL: ${B64}
YAML
if command -v kubectl >/dev/null 2>&1; then kubectl --kubeconfig="$KUBECONFIG_FILE" apply -f k8s/.rendered/05-secret.yaml
else KUBECONFIG="$KUBECONFIG_FILE" python3 scripts/k8s_apply.py k8s/.rendered/05-secret.yaml; fi
rm -f k8s/.rendered/05-secret.yaml
echo "==> Secret warspace-db aplicado"
