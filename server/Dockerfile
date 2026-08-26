# contexto de build = raiz do repo (precisa de shared/):  docker build -f server/Dockerfile .
FROM node:22-alpine
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
