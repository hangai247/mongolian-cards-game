# 8 гар production runbook (textbook-crawle)

Stack: game server (Node 24, express + socket.io) + self-hosted LiveKit (audio) + Postgres 17, all in one
Docker Compose project at `/home/ubuntu/eight-gar/` on the EC2 host `textbook-crawle`, behind the
host's existing Caddy. Public hosts: `https://8gar.textbook.mn` (game) and `wss://livekit.textbook.mn` (voice).

```
browser ──443──> Caddy ──┬─ 8gar.textbook.mn    ─> 127.0.0.1:4000  game
                         └─ livekit.textbook.mn ─> 127.0.0.1:7880  livekit (host network)
browser ──UDP 7882 / TCP 7881 / UDP 3478──> livekit media
game ─> postgres:5432 (compose network, 127.0.0.1:5433 for ops)
```

## Files

| File | Runs where | Purpose |
| --- | --- | --- |
| `aws.sh verify\|dns\|sg` | Mac (profile `aplus`) | Route 53 A records and security-group ingress |
| `bootstrap.sh` | host | first-time setup: tree, `.env`, checkout, build, start, backup cron |
| `caddy-install.sh` | host (sudo) | append the two site blocks, validate, graceful reload |
| `deploy.sh [branch]` | Mac | push → host pull → build → `up --wait` → auto-rollback on failed health |
| `rollback.sh [tag]` | Mac | switch the game container back to `previous` or a sha tag |
| `smoke.sh` | Mac | post-deploy checks + manual test list |
| `scripts/backup.sh` | host (cron 19:15 UTC) | `pg_dump -Fc`, 14-day retention, local disk |
| `docker-compose.yml`, `livekit.yaml`, `caddy/eight-gar.Caddyfile`, `.env.example` | copied by the scripts | configuration (no secrets) |

## Go-live, in order

1. `deploy/aws.sh verify` — profile `aplus` must see instance `i-0395a6d6d18ecd1b4` and the `textbook.mn` zone. Stop if it does not.
2. `deploy/aws.sh dns` — A records `8gar` and `livekit` → `52.76.113.170`; waits for INSYNC.
3. `deploy/aws.sh sg` — opens TCP 7881, UDP 7882, UDP 3478. Never open 7880/4000/5433.
4. On the host, create a read-only deploy key once:
   `ssh-keygen -t ed25519 -N '' -f ~/.ssh/eight-gar-deploy` and add the `.pub` as a GitHub deploy key.
5. `ssh textbook-crawle 'bash -s' < deploy/bootstrap.sh` — generates `.env`, builds, starts, installs cron.
6. `ssh -t textbook-crawle 'sudo bash -s' < deploy/caddy-install.sh` — certificates are issued on reload.
7. `deploy/smoke.sh` — then the manual UDP, LiveKit and 8-tab checks it prints.
8. Copy `/home/ubuntu/eight-gar/.env` into the team password manager.

## Day 2

- Deploy: `deploy/deploy.sh` (main). Health-gated; on failure it restores the previous image and exits 1.
- Roll back: `deploy/rollback.sh` or `deploy/rollback.sh <sha>` (`docker images eight-gar-game` on the host).
- Logs: `ssh textbook-crawle 'cd eight-gar && docker compose logs -f --tail 200 game'` (pino JSON; pipe through `npx pino-pretty`), `docker compose logs livekit`, `/var/log/caddy/8gar.textbook.mn.log`.
- Status: `docker compose ps`, `docker stats`, `curl https://8gar.textbook.mn/healthz` (reports git sha and DB state).
- DB: `docker compose exec postgres psql -U eightgar eightgar`.
- Restore a backup: `docker compose exec -T postgres pg_restore -U eightgar -d eightgar --clean --if-exists < backups/<file>.dump`. Test this once before go-live.
- Rotate secrets: edit `.env`, then `docker compose up -d livekit game`. LiveKit keys drop every voice session; `SESSION_SECRET` logs every player out.
- Config change: edit `deploy/livekit.yaml` or `deploy/docker-compose.yml` in git and run `deploy.sh`; both are copied on every deploy.

## Monitoring (set up once)

- External HTTPS checks (UptimeRobot free): `https://8gar.textbook.mn/healthz` (keyword `ok`) and `https://livekit.textbook.mn/`.
- CloudWatch alarm on `CPUCreditBalance < 150` for the instance (needs an SNS topic + email subscription).
- Watch `backups/backup.log`; a backup older than 36 h means the cron or Postgres is broken.

## Capacity (estimates)

Per table of 8 with audio-only Opus: ~2.5 Mbps egress peak, <5 % of one vCPU, ~450 MB RAM for the whole stack.
Comfortable up to ~5–10 concurrent tables on this t2.xlarge (its sustained baseline is only ~0.9 vCPU
for the whole box and textbook.mn already uses ~0.4). Egress costs ~$0.12/GB in ap-southeast-1.

## Known gray areas

1. Shared host: CPU/memory caps and `oom_score_adj` protect textbook.mn, but not from a disk-filling bug or a kernel issue; the host has no swap.
2. t2 CPU credits drain under sustained load above baseline; check the credit mode (`aws.sh verify`).
3. No TURN/TLS on 443 (Caddy owns it): "443-only" corporate networks get no voice; the game still works.
4. Caddy 2.6.2 (2022) stays untouched; upgrade in its own maintenance window.
5. No IPv6 on the host.
6. LiveKit uses host networking, so the security group is the only firewall; keep it minimal.
7. Backups live on the same disk (no S3 in v1).
8. Secrets exist only in `/home/ubuntu/eight-gar/.env`.
9. The game server must run as exactly one replica (timers and room queues are in-process).
