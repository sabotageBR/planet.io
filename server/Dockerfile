# contexto de build = raiz do repo (precisa de shared/):  docker build -f server/Dockerfile .
# ⚠️ VERSÃO CRAVADA (era `22-alpine`, que FLUTUA): o servidor passou a depender de `process.threadCpuUsage`
# (Node ≥ 22.19 — é ele que separa "processo parado" de "thread ocupada" no /healthz) e o dimensionamento do
# heap em `k8s/10-server.yaml` foi medido NESTA versão do V8. Subir é uma decisão, não um efeito de rebuild.
FROM node:22.23.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace=shared --workspace=server --include-workspace-root=false && npm cache clean --force
COPY shared/src shared/src
COPY server/src server/src
EXPOSE 3000
USER node
CMD ["node","server/src/index.js"]
