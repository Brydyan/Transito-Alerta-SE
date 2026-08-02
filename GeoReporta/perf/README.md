# Load/perf testing (k6 + InfluxDB + Grafana)

Opt-in overlay on top of the main dev stack — never started by a bare
`docker compose up`.

## Why this exists

Laravel ships no load-testing tool of its own — Pest/PHPUnit (already
used in `backend/tests/`) check correctness, Pulse/Telescope monitor a
running app, but neither generates concurrent load or answers "how
many req/s can `GET /api/incidents` handle before latency degrades."
This stack hits the running API from the outside, the same way
production traffic would, and catches regressions that only show up
under concurrency (N+1 queries, lock contention, slow endpoints) that
the functional test suite can't.

k6 was chosen over JMeter: scriptable in JS (matches this project's
frontend stack, no separate GUI/XML test-plan format to learn), has an
official Docker image (fits the existing docker-compose-based dev
workflow), and writes metrics straight to InfluxDB for Grafana with no
extra glue.

## 1. Bring up the metrics stack

The main stack (`docker-compose.yml`) must already be running (backend,
db, redis, grafana). Then bring up InfluxDB from this overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.perf.yml up -d influxdb
```

Grafana is not part of this overlay — it's the same instance the main
stack already provides at http://localhost:3001 (anonymous Admin
access, no login needed). The `k6-influxdb` datasource and the `k6`
dashboard folder are provisioned via `ops/grafana/provisioning` —
no manual setup needed.

## 2. Run a script

k6 itself is not a long-running service (`profiles: ["perf"]` keeps it
out of `up`) — invoke it directly per run:

```bash
docker compose -f docker-compose.yml -f docker-compose.perf.yml run --rm k6 run /scripts/smoke.js
docker compose -f docker-compose.yml -f docker-compose.perf.yml run --rm k6 run /scripts/incidents-read.js
docker compose -f docker-compose.yml -f docker-compose.perf.yml run --rm k6 run /scripts/incidents-write.js
```

Each run streams metrics to InfluxDB in real time (`K6_OUT` is already
set in the compose file) — watch the dashboard update live while a
script is running.

| Script | What it does |
|---|---|
| `smoke.js` | 1 VU, 5 iterations — sanity check that auth + basic requests work before running a real load profile. |
| `incidents-read.js` | Ramps to 10 VUs against `GET /api/incidents` (list) + `GET /api/incidents/{id}` (detail). Thresholds: p95 < 300ms, error rate < 1%. |
| `incidents-write.js` | Ramps to 5 VUs `POST`-ing new incidents. **Local dev only** — creates real rows (see cleanup below). |

All three authenticate as the seeded `admin@sistema.com` / `Admin123!`
account (`backend/database/seeders/UserSeeder.php`) via `_auth.js` —
this account must exist in whatever database the target backend is
using (`php artisan db:seed` on a fresh DB is enough). Using
`admin_sistema` specifically also means these scripts see the
unscoped/full dataset rather than one org's slice.

The Grafana dashboard (`k6` folder, `k6-load-test-results`) has 4
panels sourced from k6's default InfluxDB v1 schema: requests/sec,
p95/p99 latency, error rate %, and VUs over time — watch it live while
a script runs, or review after the fact (data persists in the
`perf_influxdb_data` volume until you `down -v`).

## 3. Cleanup after `incidents-write.js`

Every row it creates is titled `[k6-loadtest] carga ...` — identifiable
and safe to bulk-delete:

```bash
docker compose exec -T db psql -U user -d incidencias_db -c "DELETE FROM incidents WHERE title LIKE '[k6-loadtest]%';"
```

## 4. Tearing down

```bash
docker compose -f docker-compose.yml -f docker-compose.perf.yml down
```

(This only removes the perf overlay's container — `influxdb` — and its
volume if you also pass `-v`. Grafana belongs to the main stack, not
this overlay, so it's untouched either way.)

## Notes

- `/api/incidents/feed` isn't covered here — it has its own rate limiter
  (120/min authenticated, see `RateLimiter::for('feed', ...)` in
  `AppServiceProvider.php`) that would just produce 429 noise unless the
  script authenticates as `admin_sistema` (exempt). Worth a follow-up
  script once these two are proven out.
- Scripts default to `http://localhost:8000` unless `API_BASE_URL` is
  set — the compose file sets it to `http://backend:8000` for the `k6`
  service so it resolves the backend by Docker service name.
