#!/usr/bin/env bash
# First-time (and idempotent re-run) setup of the eight-gar stack ON the host.
#   ssh textbook-crawle 'bash -s' < deploy/bootstrap.sh
# Prerequisites: `git push prod main` from the Mac (see below), DNS + security group (deploy/aws.sh).
# Caddy site blocks come after (deploy/caddy-install.sh).
set -euo pipefail

APP=/home/ubuntu/eight-gar
BRANCH=${BRANCH:-main}

log() { printf '\n==> %s\n' "$*"; }

log "Directory tree under $APP"
mkdir -p "$APP"/{livekit,backups,scripts}
chmod 700 "$APP/backups"

# --- secrets -------------------------------------------------------------------------------------
# Generated once; later runs keep the existing file so rotating a key is an explicit manual edit.
if [ ! -f "$APP/.env" ]; then
  log "Generating $APP/.env (first run only)"
  umask 077
  # tr -dc keeps alphanumerics only so compose interpolation and YAML never misparse a value.
  rand() { openssl rand -base64 "$1" | tr -dc 'A-Za-z0-9' | head -c "$2"; echo; }
  LIVEKIT_API_KEY="API$(rand 12 12)"
  cat > "$APP/.env" <<ENV
POSTGRES_PASSWORD=$(rand 36 32)
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$(rand 48 44)
SESSION_SECRET=$(openssl rand -hex 32)
PUBLIC_ORIGIN=https://8gar.textbook.mn
LIVEKIT_URL=wss://livekit.textbook.mn
ENV
  chmod 600 "$APP/.env"
  umask 022
  echo "    Keep a second copy of $APP/.env in the team password manager."
else
  log "$APP/.env already exists; leaving secrets untouched"
fi

# --- source checkout -----------------------------------------------------------------------------
# The Mac pushes over the existing ssh alias into a bare repo on this host; src/ is a checkout of it.
# No GitHub access or deploy key is needed on the host. (Set GIT_REMOTE to a GitHub URL to use one instead.)
BARE=$APP/repo.git
REMOTE=${GIT_REMOTE:-$BARE}
if [ "$REMOTE" = "$BARE" ] && [ ! -d "$BARE" ]; then
  log "Creating bare repo $BARE (push to it from the Mac: git push prod main)"
  git init -q --bare "$BARE"
fi
if [ "$REMOTE" = "$BARE" ] && ! git -C "$BARE" rev-parse --verify -q "refs/heads/$BRANCH" >/dev/null; then
  echo "!! $BARE has no branch $BRANCH yet. From the Mac run:"
  echo "   git remote add prod textbook-crawle:$BARE   (once)"
  echo "   git push prod $BRANCH"
  echo "   then re-run this bootstrap."
  exit 1
fi
if [ -d "$APP/src/.git" ]; then
  log "Updating $APP/src to $BRANCH"
  git -C "$APP/src" remote set-url origin "$REMOTE"
  git -C "$APP/src" fetch --prune origin
  git -C "$APP/src" checkout -q "$BRANCH"
  git -C "$APP/src" reset -q --hard "origin/$BRANCH"
else
  log "Cloning $REMOTE into $APP/src"
  git clone -q --branch "$BRANCH" "$REMOTE" "$APP/src"
fi
SHA=$(git -C "$APP/src" rev-parse --short HEAD)

log "Installing deploy files for $SHA"
cp "$APP/src/deploy/docker-compose.yml" "$APP/docker-compose.yml"
cp "$APP/src/deploy/livekit.yaml"       "$APP/livekit/config.yaml"
cp "$APP/src/deploy/scripts/backup.sh"  "$APP/scripts/backup.sh"
chmod +x "$APP/scripts/backup.sh"

# --- containers ----------------------------------------------------------------------------------
cd "$APP"
log "Pulling livekit + postgres images"
docker compose pull livekit postgres
log "Building the game image"
GIT_SHA="$SHA" docker compose build --pull game
docker tag eight-gar-game:latest "eight-gar-game:$SHA"
log "Starting the stack (waits for healthchecks)"
GIT_SHA="$SHA" docker compose up -d --wait --wait-timeout 120
docker compose ps

# --- backup cron ---------------------------------------------------------------------------------
# 19:15 UTC = 03:15 Ulaanbaatar. Re-running replaces the previous line instead of duplicating it.
log "Installing the daily backup cron"
CRON_LINE="15 19 * * * $APP/scripts/backup.sh >> $APP/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'eight-gar/scripts/backup.sh' || true; echo "$CRON_LINE" ) | crontab -
crontab -l | grep backup.sh

log "Local health check"
curl -fsS http://127.0.0.1:4000/healthz; echo
curl -fsS http://127.0.0.1:7880/ ; echo
echo "Bootstrap complete ($SHA). Next: deploy/caddy-install.sh on the host, then deploy/smoke.sh from the Mac."
