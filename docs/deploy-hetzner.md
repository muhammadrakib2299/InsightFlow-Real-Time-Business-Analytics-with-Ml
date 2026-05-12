# Deploying InsightFlow on a Hetzner CX22

End-to-end runbook for getting a public instance up on a single 4 GB / 2 vCPU
Hetzner Cloud VPS. The same playbook applies to any small VPS — only the
provisioning step is Hetzner-specific.

## 1. Provision the box

1. Create a CX22 (or CPX21 for slightly more headroom) in a region close to
   you. Image: Ubuntu 22.04 LTS.
2. SSH in as root, then create a non-root user:

   ```bash
   adduser insightflow
   usermod -aG sudo insightflow
   rsync -a /root/.ssh /home/insightflow/
   chown -R insightflow:insightflow /home/insightflow/.ssh
   ```

3. From here on use the `insightflow` user with `sudo` where needed.

## 2. Install Docker + Compose v2

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker insightflow
# Log out + back in to pick up the docker group
```

Verify: `docker version` and `docker compose version`.

## 3. Firewall

UFW is in the Ubuntu image — open only what we need:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
```

`19092` (Redpanda external), `5432` (Postgres), `6379` (Redis), and `8123`
(ClickHouse HTTP) are NOT exposed to the internet — they live on the
internal docker network and the dev override file (`docker-compose.dev.yml`)
is the only place that publishes them. **Do not run the dev override in
production.**

## 4. Clone and configure

```bash
git clone https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml.git
cd InsightFlow-Real-Time-Business-Analytics-with-Ml
cp .env.example .env
nano .env
```

At minimum set:

- `POSTGRES_PASSWORD` — strong, generated value
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — `openssl rand -hex 32`
- `SHARE_LINK_SECRET` — `openssl rand -hex 32`
- `RETRAIN_SHARED_SECRET` — `openssl rand -hex 32`
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` — for MinIO
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — alerts
- `CADDY_DOMAIN` — your DNS-ready domain (e.g. `insightflow.dev`)
- `CADDY_EMAIL` — Let's Encrypt contact
- `CORS_ORIGIN` — `https://<your domain>` (not `*`)

DNS: point an A record for `CADDY_DOMAIN` and `ingest.CADDY_DOMAIN` at the
VPS public IP before you start the stack — Caddy provisions TLS at boot
via Let's Encrypt and will fail until the records resolve.

## 5. Bring up the stack

```bash
docker compose -f infra/docker-compose.yml up -d --wait
```

`--wait` blocks until every service's healthcheck passes. First boot is
slow (~3-5 min) because Prophet's cmdstan compiles inside the forecast
image build.

## 6. First-time setup

```bash
# Create your initial workspace via the API
curl -s https://${CADDY_DOMAIN}/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"<long password>"}' | jq

# Issue an API key for the seed script
# (login → POST /api/workspaces/:id/api-keys → keep the .secret)

# Seed the demo dataset
python3 scripts/seed_demo.py \
  --endpoint https://ingest.${CADDY_DOMAIN} \
  --api-key ifk_live_xxx \
  --days 90

# Trigger the first model fit
curl -X POST https://${CADDY_DOMAIN}/internal/retrain \
  -H "X-Retrain-Secret: ${RETRAIN_SHARED_SECRET}"
# (or wait for the GitHub Actions cron at 02:00 UTC)
```

## 7. Backups

The included `infra/backup.sh` runs nightly via cron:

```bash
sudo cp infra/backup.sh /usr/local/bin/insightflow-backup
sudo chmod +x /usr/local/bin/insightflow-backup
sudo crontab -e
# add:
0 3 * * * /usr/local/bin/insightflow-backup >> /var/log/insightflow-backup.log 2>&1
```

Backups land in `/var/backups/insightflow/` — copy them off-box (rsync,
B2, S3) at least weekly. ClickHouse uses `clickhouse-backup`; Postgres
uses `pg_dump`.

## 8. Updates

```bash
cd ~/InsightFlow-Real-Time-Business-Analytics-with-Ml
git pull
docker compose -f infra/docker-compose.yml up -d --build --wait
docker image prune -f
```

A rolling restart per service is fine — depends_on healthchecks gate
the order.

## 9. Operational signals to watch

- `docker compose -f infra/docker-compose.yml logs -f api`
- `docker compose -f infra/docker-compose.yml logs -f ingestion-consumer`
- ClickHouse `SELECT count() FROM events WHERE occurred_at >= now() - INTERVAL 1 HOUR`
  should match the event rate you expect.
- `/api/workspaces/:id/forecast/models` should show fresh `fitted_at`
  timestamps within 24 hours of the cron run.
