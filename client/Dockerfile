# contexto de build = raiz do repo (precisa de shared/):  docker build -f client/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
RUN npm ci --workspace=shared --workspace=client --include-workspace-root=false
COPY shared/src shared/src
COPY client client
RUN npm -w client run build

FROM nginx:1.25-alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
