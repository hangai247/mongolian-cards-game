#!/usr/bin/env bash
# Daily logical backup of the eight-gar Postgres database, kept 14 days on local disk (v1 decision: no S3).
# Installed in the ubuntu crontab by bootstrap.sh. Restore:
#   docker compose exec -T postgres pg_restore -U eightgar -d eightgar --clean --if-exists < backups/<file>.dump
set -euo pipefail
APP=/home/ubuntu/eight-gar
STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="$APP/backups/eightgar-$STAMP.dump"
cd "$APP"
docker compose exec -T postgres pg_dump -U eightgar -Fc eightgar > "$OUT"
chmod 600 "$OUT"
find "$APP/backups" -name 'eightgar-*.dump' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok $(basename "$OUT") $(stat -c %s "$OUT") bytes"
