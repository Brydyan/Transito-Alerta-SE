# SonarQube — Static Code Analysis

Self-hosted SonarQube Community Build for static analysis of `backend/` (PHP)
and `frontend/` (JS). This is **not** part of the Prometheus/Grafana/Loki
observability stack — SonarQube has its own UI and its own dedicated Postgres
database (`sonarqube_db` service), kept fully separate from the app's `db`
service and from Grafana dashboards.

## Deployment

Two deployment targets:

| Environment | File | Command |
|-------------|------|---------|
| Development | `docker-compose.yml` | `docker compose up -d sonarqube_db sonarqube` |
| Production (Swarm) | `deploy.yml` | `docker stack deploy -c deploy.yml incidencias-stack` |

Both use the same `sonarqube` + `sonarqube_db` service pair. The Docker Swarm
stack does **not** mount `sonarqube_logs` as a volume — logs go to the
container's stdout and are picked up by `promtail` / Loki.

> **Host kernel requirement:** SonarQube's embedded Elasticsearch requires
> `vm.max_map_count >= 262144`. Set it once on the host:
> ```bash
> echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
> ```
> Without this the `sonarqube` container fails to start (Elasticsearch bootstrap
> check error).

## Services (docker-compose)

| Service | Port | Purpose |
|---------|------|---------|
| sonarqube | `${SONARQUBE_PORT:-9002}` | SonarQube UI + analysis API |
| sonarqube_db | — (internal only) | Dedicated Postgres for SonarQube's own metadata |

## Starting the service (dev)

```bash
docker compose up -d sonarqube_db sonarqube
```

First boot takes a minute or two while SonarQube initializes its database
schema — watch `docker compose logs -f sonarqube` until it reports it is
operational, or wait for the healthcheck to turn healthy.

## First login

1. Open `http://localhost:${SONARQUBE_PORT:-9002}` (default: `http://localhost:9002`).
2. Log in with the default credentials `admin` / `admin`.
3. SonarQube forces a password change on first login — set a new admin
   password when prompted.
4. Generate a project analysis token: **My Account → Security → Generate
   Tokens**. Save it as `SONAR_TOKEN` (see below).

## Running the scanner

The scanner reads `sonar-project.properties` at the repo root, which
declares this as a two-module monorepo (`backend/app` + `frontend/app`) with
coverage report paths for both languages.

### Generate coverage first

```bash
# Backend (PHP, pcov driver — see backend/Dockerfile)
cd backend && composer run test:coverage   # writes backend/coverage/clover.xml

# Frontend (JS, @vitest/coverage-v8)
cd frontend && npm run test:coverage       # writes frontend/coverage/lcov.info
```

### Run the scanner (Docker, no local install needed)

```bash
docker run --rm \
  --network dev-network \
  -e SONAR_HOST_URL="http://sonarqube:9000" \
  -e SONAR_TOKEN="<your-token-from-first-login>" \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli
```

Run this from the repo root (so `/usr/src` maps to the whole monorepo and
`sonar-project.properties` is picked up). `--network dev-network` lets the
scanner resolve the `sonarqube` service name; alternatively, from the host,
use `SONAR_HOST_URL="http://localhost:${SONARQUBE_PORT:-9002}"` without
`--network`.

### Run the scanner (local CLI, if installed)

```bash
sonar-scanner \
  -Dsonar.host.url=http://localhost:${SONARQUBE_PORT:-9002} \
  -Dsonar.token=<your-token>
```

## Viewing results

Results, issues, and quality gate status are in the SonarQube UI at
`http://localhost:${SONARQUBE_PORT:-9002}` — **not** in Grafana. This stack
is intentionally kept separate from the Prometheus/Grafana/Loki metrics and
logs setup.

## CI

`.github/workflows/ci.yml` has a `sonar-scan` job that runs the scan
automatically on push/PR, gated on the `SONAR_TOKEN` repository secret being
set (it no-ops otherwise, so CI doesn't fail for forks/contributors without
one). If you want CI to reach a self-hosted SonarQube instance, also set the
`SONAR_HOST_URL` secret to a publicly reachable URL for that instance —
`http://localhost:9002` only resolves on the dev machine, not on GitHub's
runners.

## Exposing SonarQube for CI

GitHub Actions runners cannot reach `localhost:9002` on the dev/production
machine. The `sonar-scan` CI job is wired but inert until this is done:

1. **Expose SonarQube publicly via Cloudflare Tunnel.** Both `docker-compose.yml`
   (dev) and `deploy.yml` (production/Swarm) include the `cloudflared` service
   and the `sonarqube` service on the same network. To route traffic:
   - Log into [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
   - Go to **Networks → Tunnels** → select your tunnel.
   - Add a **Public Hostname** ingress rule:
     ```
     Subdomain:  sonar
     Domain:     tu-dominio.com
     Type:       HTTP
     URL:        sonarqube:9000
     ```
     (The `sonarqube` hostname resolves inside the Docker network — no
     `localhost` here.)
   - Save. Cloudflare Tunnel handles HTTPS automatically.
2. **Set GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `SONAR_TOKEN` — generate from **My Account → Security → Generate
     Tokens** in the SonarQube UI (see "First login" above).
   - `SONAR_HOST_URL` — the public URL from step 1, e.g.
     `https://sonar.tu-dominio.com` (no trailing slash).
3. Once both secrets exist, the `sonar-scan` job in `.github/workflows/ci.yml`
   starts running on every push/PR automatically — no workflow change needed.

Until this is done, scans stay manual (see "Running the scanner" above).
