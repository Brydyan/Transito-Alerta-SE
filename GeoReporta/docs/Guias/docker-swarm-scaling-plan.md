# Docker Swarm Scaling Plan — Frontend & Backend Replicas

## Goal

Scale `frontend` and `backend` horizontally under Docker Swarm while keeping
`db`, `redis`, and `rustfs` single-instance, without breaking metrics
collection or the reverse proxy.

## Key finding: `deploy.yml` already scales, but it's stale

`deploy.yml` is the actual Swarm stack file (`docker stack deploy -c deploy.yml
incidencias-stack`) and **already sets `replicas: 2`** for both `frontend`
(line 24) and `backend` (line 48). So the scaling mechanism isn't the gap —
the gap is that `deploy.yml` has drifted from `docker-compose.yml` (the dev
file) and is missing pieces that matter once you actually run 2+ backend
replicas:

| Present in `docker-compose.yml` | Present in `deploy.yml` |
|---|---|
| `rustfs` (S3 storage) | ❌ missing |
| `prometheus`, `grafana`, `loki`, `promtail` | ❌ missing |
| `postgres_exporter`, `redis_exporter` | ❌ missing |
| `sonarqube` stack | ❌ missing (correctly — standalone tool, fine to leave out) |
| healthcheck on `backend`/`frontend` | ❌ missing in `deploy.yml` |
| `deploy.update_config` (rolling update) | ❌ missing |

## 1. Reverse proxy — no action needed

`nginx.conf:5-45` (baked into the `frontend` image) proxies `/api/`,
`/.well-known/mercure`, and `/storage/` to `http://backend:8000` using
Docker's embedded resolver (`127.0.0.11`, `valid=10s`) — it re-resolves per
request instead of caching at startup. In Swarm, `backend` resolves to the
service VIP, which load-balances across all `backend` replicas automatically.
This already works correctly with `replicas: 2+`. **Nothing to change here.**

One thing to verify once replicas are live: the Mercure SSE endpoint
(`nginx.conf:22-34`, `proxy_buffering off`, `proxy_read_timeout 1d`) is a
long-lived connection pinned to whichever backend replica it first hits —
that's fine functionally, just means SSE clients aren't evenly distributed
over time the way short requests are.

## 2. Metrics scraping — needs a fix

`ops/prometheus/prometheus.yml:6-9`:

```yaml
- job_name: 'backend'
  static_configs:
    - targets: ['backend:8000']
```

This targets the **VIP**, not individual tasks. With 2+ backend replicas,
each scrape lands on a random replica behind the VIP — Prometheus ends up
with one inconsistent time series per scrape interval instead of one series
per replica, which corrupts `rate()`/`increase()` on any counter.

**Fix:** switch to DNS service discovery against `tasks.backend`, the DNS
name Swarm exposes that returns one A record per running task:

```yaml
- job_name: 'backend'
  dns_sd_configs:
    - names: ['tasks.backend']
      type: A
      port: 8000
  metrics_path: '/metrics'
  relabel_configs:
    - source_labels: [__address__]
      target_label: instance
```

Same reasoning applies to the `nginx` job (`prometheus.yml:11-14`, target
`frontend:80`) once `frontend` also has multiple replicas — switch it to
`tasks.frontend` too.

`postgres_exporter` and `redis_exporter` jobs are untouched — `db`/`redis`
stay single-instance, so `static_configs` is still correct there.

## 3. Add missing services to `deploy.yml`

Port `rustfs`, `prometheus`, `grafana`, `loki`, `promtail`,
`postgres_exporter`, and `redis_exporter` into `deploy.yml` with explicit
`deploy.replicas: 1` (they're not meant to scale). Two Swarm-specific details:

- **`promtail`** mounts `/var/run/docker.sock` (`docker-compose.yml:198`) to
  read container logs — that's per-node. In Swarm it must run as
  `deploy.mode: global` (one task per node), not a fixed replica count,
  or it will only ever see logs from whatever single node it lands on.
- **`rustfs`** uses a named volume (`rustfs_data`) for object storage. Named
  volumes in Swarm are local to whichever node the task lands on. **N/A
  here** — confirmed single-node Swarm (one VPS), so there's no other node
  a rescheduled task could land on; `placement.constraints` isn't needed.
  Revisit only if a second node is ever added to the cluster.

## 4. Add health checks + rolling update config for `frontend`/`backend`

`deploy.yml` currently has healthchecks only on `db`/`redis`. Without one on
`backend`/`frontend`, Swarm can't tell a task is unhealthy and keeps routing
to it. Add:

```yaml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 5
  deploy:
    replicas: 2
    update_config:
      parallelism: 1
      delay: 10s
      order: start-first
      failure_action: rollback
    restart_policy:
      condition: any
```

`order: start-first` + `parallelism: 1` gives zero-downtime rolling deploys:
Swarm starts the new task, waits for it to be healthy, then kills the old one
— one replica at a time. Do the same for `frontend` (healthcheck against
`/` or `/nginx_status`).

## 5. `depends_on` is a no-op in Swarm — informational only

`deploy.yml:19-20,42-44` use `depends_on`, which `docker stack deploy`
ignores entirely (no health-based wait, unlike Compose's
`condition: service_healthy`). Not a blocker if the app already retries DB/
Redis connections on boot — just don't rely on `depends_on` for startup
ordering once this is a stack instead of `docker-compose up`.

## Rollout order

1. Fix `ops/prometheus/prometheus.yml` (`dns_sd_configs` for `backend`/`frontend`) — safe, no deploy risk.
2. Add `rustfs` + observability services to `deploy.yml` with `replicas: 1`.
3. Add healthchecks + `update_config` to `backend`/`frontend` in `deploy.yml`.
4. `docker stack deploy -c deploy.yml incidencias-stack` and confirm in Grafana that `backend` now shows multiple `instance` label values under load.

## Resolved: single-node Swarm

Confirmed one physical machine. `placement.constraints` not needed —
`db`/`redis`/`rustfs` volumes always stay on the only node that exists.
