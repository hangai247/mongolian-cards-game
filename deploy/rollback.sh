#!/usr/bin/env bash
# Roll the game container back to the previous image (or a specific tag) from the Mac.
#   deploy/rollback.sh            # -> eight-gar-game:previous
#   deploy/rollback.sh <sha>      # -> eight-gar-game:<sha>  (see `docker images eight-gar-game` on the host)
set -euo pipefail
HOST=${HOST:-textbook-crawle}
TAG=${1:-previous}
ssh "$HOST" bash -s -- "$TAG" <<'REMOTE'
set -euo pipefail
TAG=$1; cd /home/ubuntu/eight-gar
docker image inspect "eight-gar-game:$TAG" >/dev/null
docker tag eight-gar-game:latest eight-gar-game:rolled-back-from 2>/dev/null || true
docker tag "eight-gar-game:$TAG" eight-gar-game:latest
docker compose up -d --no-deps --wait --wait-timeout 90 game
docker compose ps game
curl -fsS http://127.0.0.1:4000/healthz; echo
REMOTE
