FROM nginx:1.25-alpine
# só os estáticos; a config vem de ConfigMap no cluster (permite escalar shards sem rebuild)
COPY index.html game.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
