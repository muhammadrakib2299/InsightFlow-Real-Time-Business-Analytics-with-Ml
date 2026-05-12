# Load tests

Two k6 scenarios in this folder. Run them locally against the compose
stack or against a deployed environment.

## ingest.js — sustained 1k events/sec for 10 minutes

```bash
# Bring up the stack
docker compose -f infra/docker-compose.yml up -d --wait

# Sign up and grab an API key once
curl -s http://localhost:4000/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"load@example.com","password":"load-test-password"}' | jq

# (login → POST /api/workspaces/:id/api-keys → save the .secret)

k6 run \
  -e INGEST_URL=http://localhost:5000 \
  -e API_KEY=ifk_live_xxxxxxxxxx \
  tests/load/ingest.js
```

**Pass criteria** (from `plan.md` M6):
- `http_req_failed` rate < 1%
- `http_req_duration` p95 < 200ms
- p99 < 500ms

## dashboard.js — ramping read load

```bash
k6 run \
  -e API_URL=http://localhost:4000 \
  -e EMAIL=load@example.com \
  -e PASSWORD=load-test-password \
  tests/load/dashboard.js
```

**Pass criteria**:
- `GET /events/kpi` p95 < 500ms
- `http_req_failed` rate < 2%

Both tests are designed to be runnable on a developer laptop. For a
realistic prod run, scale `maxVUs` and use a remote k6 agent
(`k6 cloud`) so the load generator isn't sharing CPU with the stack.
