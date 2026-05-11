# Contributing to InsightFlow

Thanks for taking the time to contribute. InsightFlow is a small project; the goal of this document is to keep the bar consistent without slowing anyone down.

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). By participating, you agree to abide by its terms.

## Getting set up

```bash
git clone https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml.git
cd InsightFlow-Real-Time-Business-Analytics-with-Ml
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
```

Wait ~30 seconds for the stack to come up, then:

- Dashboard: http://localhost:3000
- API: http://localhost:4000
- Forecast service: http://localhost:8000
- ClickHouse: http://localhost:8123

For day-to-day work outside containers:

- Node 20+ and npm 10+
- Python 3.11+
- `npm install` at the repo root to install workspaces (`api`, `frontend`, `sdk`)
- `pip install -r ingestion/requirements.txt` and `pip install -r forecast/requirements.txt` for the Python services (in a virtualenv)

## Branching and commits

- Default branch: `main`. Branch from `main`, name as `feat/<short>`, `fix/<short>`, or `docs/<short>`.
- Commit style: [Conventional Commits](https://www.conventionalcommits.org/). Examples: `feat(api): add workspace invite endpoint`, `fix(ingestion): batch flush deadlock on shutdown`.
- One logical change per commit. Squash noise locally before opening a PR.

## Pull requests

1. Open a PR against `main`.
2. The PR description should explain *why*, not just *what* — link the relevant section of `todo.md` or `plan.md`.
3. CI must be green: `lint`, `typecheck`, `test`, and the smoke job that spins up `docker compose` and hits `/health` on every service.
4. Anything that touches the data contract between the SDK, ingestion, and ClickHouse needs to update `docs/data-model.md` in the same PR.
5. Architecture-shaping decisions (new service, new external dependency, schema-of-record change) need an ADR in `docs/`.

## Style

- **Python**: ruff + black, mypy strict. Run `ruff check . && black . && mypy .` before pushing.
- **TypeScript**: eslint + prettier, `strict: true` in `tsconfig.json`. Run `npm run lint && npm run typecheck` before pushing.
- **SQL**: lowercase keywords, snake_case identifiers, one column per line in `CREATE TABLE`. Materialized views go in `infra/clickhouse/init.sql`.

## Tests

- Unit + integration tests live alongside the service. End-to-end (Playwright) and load (k6) live in `tests/`.
- Tests that touch ClickHouse or Kafka use the docker-compose stack — no mocks for storage layers. (See the "no mocked DB" rule discussed in [plan.md](./plan.md).)
- New endpoints need a happy-path test + at least one failure-mode test (bad auth, malformed payload, rate limit).

## Releasing

InsightFlow is pre-1.0 — no formal release cadence yet. Tag `v0.x.y` on `main` once each milestone in `todo.md` is done.

## Reporting bugs

Open a GitHub issue with:

- What you ran (`docker compose up`, a specific endpoint, etc.)
- What you expected
- What happened (logs, screenshots)
- Your environment (OS, Docker version, Node/Python versions if running outside containers)

Security issues: see [SECURITY.md](./SECURITY.md). Don't file public issues for vulnerabilities.
