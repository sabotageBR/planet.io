#!/usr/bin/env bash
# Dump do Postgres SOB DEMANDA (o diário é o CronJob k8s/40-backup.yaml).
# Use antes de qualquer coisa que mexa no schema: migration nova, restauração, teste contra banco remoto.
# uso: ./scripts/db-backup.sh                  # lê DATABASE_URL do .env da raiz
#      DATABASE_URL=... ./scripts/db-backup.sh # ou do ambiente
#      OUT_DIR=/outro/lugar ./scripts/db-backup.sh
#
# A máquina do Evandro NÃO tem pg_dump nem psql instalados, e produção é PostgreSQL 9.6: por isso o dump sai
# de dentro do container `planet-pg` (postgres 16 — pg_dump 16 lê servidor 9.6; o contrário não funciona).
# Restaurar: gunzip -c ARQUIVO.sql.gz | psql "$DATABASE_URL"
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="${OUT_DIR:-$HOME/planet-backups}"
DOCKER="${DOCKER_CMD:-sudo -n docker}"
PGC="${PG_CONTAINER:-planet-pg}"

if [ -z "${DATABASE_URL:-}" ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?defina DATABASE_URL (no .env da raiz ou no ambiente)}"

$DOCKER inspect "$PGC" >/dev/null 2>&1 || { echo "!! container $PGC não está no ar (sudo -n docker start $PGC)"; exit 1; }

mkdir -p "$OUT_DIR"
HOST=$(printf '%s' "$DATABASE_URL" | sed -E 's#.*@([^:/]+).*#\1#')
OUT="$OUT_DIR/planet-$(printf '%s' "$HOST" | tr '.' '-')-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "==> dump de $HOST"
# o pg_dump escreve em arquivo temporário no host antes do gzip: num pipe o status que sobrevive é o do gzip,
# e um dump truncado passaria por bom. Só vira definitivo depois do gzip -t.
$DOCKER exec -e PGURL="$DATABASE_URL" "$PGC" sh -c 'pg_dump "$PGURL" --no-owner --no-privileges' > "$OUT.raw"
gzip -9 -c "$OUT.raw" > "$OUT.tmp"
gzip -t "$OUT.tmp"
mv "$OUT.tmp" "$OUT"; rm -f "$OUT.raw"

echo "==> $OUT ($(du -h "$OUT" | cut -f1))"
zcat "$OUT" | awk '/^COPY /{t=$2;c=0;next} t&&/^\\\.$/{print "    "t" -> "c" linhas";t="";next} t{c++}'
