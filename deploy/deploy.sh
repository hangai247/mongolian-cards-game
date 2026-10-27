#!/usr/bin/env bash
# Day-2 deploy from the Mac: push, build on the host, roll out with health gating, auto-rollback.
#   deploy/deploy.sh [branch]      (default: main)
set -euo pipefail
HOST=${HOST:-textbook-crawle}
BRANCH=${1:-main}
PUBLIC_URL=${PUBLIC_URL:-https://8gar.textbook.mn}
# "prod" is the bare repo on the host (git remote add prod textbook-crawle:/home/ubuntu/eight-gar/repo.git).
PUSH_REMOTE=${PUSH_REMOTE:-prod}

git push "$PUSH_REMOTE" "$BRANCH"
SHA=$(git rev-parse --short HEAD)
echo "==> deploying $SHA ($BRANCH) to $HOST"

ssh "$HOST" bash -s -- "$SHA" "$BRANCH" <<'REMOTE'
set -euo pipefail
SHA=$1; BRANCH=$2; APP=/home/ubuntu/eight-gar
cd "$APP/src"
git fetch --prune origin
git checkout -q "$BRANCH"
git reset -q --hard "origin/$BRANCH"
ACTUAL=$(git rev-parse --short HEAD)
[ "$ACTUAL" = "$SHA" ] || echo "!! host checked out $ACTUAL, expected $SHA (continuing with $ACTUAL)"
SHA=$ACTUAL

cp "$APP/src/deploy/docker-compose.yml" "$APP/docker-compose.yml"
cp "$APP/src/deploy/livekit.yaml"       "$APP/livekit/config.yaml"
cp "$APP/src/deploy/scripts/backup.sh"  "$APP/scripts/backup.sh"
cd "$APP"

# Keep the running image addressable for rollback before building over :latest.
docker tag eight-gar-game:latest eight-gar-game:previous 2>/dev/null || true
GIT_SHA="$SHA" docker compose build --pull game
docker tag eight-gar-game:latest "eight-gar-game:$SHA"

# --wait blocks on the compose healthchecks, so a failing /healthz triggers the rollback branch.
if ! GIT_SHA="$SHA" docker compose up -d --wait --wait-timeout 90; then
  echo "!! health check failed for $SHA; rolling back to previous image"
  docker compose logs --tail 50 game || true
  docker tag eight-gar-game:previous eight-gar-game:latest
  docker compose up -d --no-deps game
  exit 1
fi
docker image prune -f --filter "until=168h" >/dev/null
docker compose ps
REMOTE

echo "==> public health"
curl -fsS "$PUBLIC_URL/healthz"; echo
echo "deployed $SHA"
