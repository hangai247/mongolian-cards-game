#!/usr/bin/env bash
# Append the eight-gar site blocks to the system Caddy ON the host. Needs sudo; safe to re-run.
#   ssh -t textbook-crawle 'sudo bash -s' < deploy/caddy-install.sh
# DNS for 8gar.textbook.mn and livekit.textbook.mn must already resolve to this host, or ACME fails.
set -euo pipefail

CADDYFILE=/etc/caddy/Caddyfile
SNIPPET=/home/ubuntu/eight-gar/src/deploy/caddy/eight-gar.Caddyfile
[ -r "$SNIPPET" ] || { echo "missing $SNIPPET (run bootstrap.sh first)"; exit 1; }

if grep -q '^8gar\.textbook\.mn' "$CADDYFILE"; then
  echo "8gar.textbook.mn already present in $CADDYFILE; validating and reloading only."
else
  BACKUP="$CADDYFILE.bak-$(date -u +%Y%m%d-%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  echo "Backed up to $BACKUP"
  cat "$SNIPPET" >> "$CADDYFILE"
fi

# validate never touches the running config; reload is graceful via the admin API.
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl reload caddy
sleep 2
systemctl is-active caddy

echo "Existing sites still answer:"
for host in studio.textbook.mn embed.textbook.mn; do
  printf '  %-22s ' "$host"; curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 "https://$host/" || true
done
echo "Certificate issuance for the new hosts (watch for 'certificate obtained'):"
journalctl -u caddy -n 40 --no-pager | grep -Ei '8gar|livekit|certificate|error' || true
