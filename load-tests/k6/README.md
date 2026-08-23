# k6 Load Testing — Transito Alerta SE

Scripts de load testing con [k6](https://k6.io) para validar el rendimiento del backend
bajo carga esperada de producción: **25k usuarios concurrentes**, **p95 < 200ms**,
**error rate < 0.1%**, **5k WebSockets simultáneos**.

## Requisitos

- **k6 ≥ v0.52** (soporte ES modules para `import`).
  - macOS: `brew install k6`
  - Windows: `winget install k6`
  - Linux: descarga desde [k6.io/docs/get-started/installation](https://k6.io/docs/get-started/installation/)
  - Docker: `grafana/k6:latest` (ya incluido en `docker-compose.k6.yml`)

## Estructura

```
load-tests/
  k6/
    scenarios/
      auth-login.js        # POST /api/auth/login, 25k VUs ramping
      incidents-read.js    # GET /api/incidents (anónimo), 25k VUs
      ws-connections.js    # WebSocket forced transport, 5k sockets
    thresholds.js          # Thresholds compartidos
    README.md              # Este archivo
  docker-compose.k6.yml    # k6 + InfluxDB + Grafana (visualización local)
```

## Correr escenarios

### Backend local

```bash
# 1. Levantar infra (Postgres + Redis)
docker compose up -d postgres redis

# 2. Backend en modo dev
cd backend && pnpm run start:dev

# 3. Correr un escenario (smoke test rápido, baja carga)
k6 run --vus 10 --duration 10s load-tests/k6/scenarios/auth-login.js
k6 run --vus 10 --duration 10s load-tests/k6/scenarios/incidents-read.js
k6 run --vus 5  --duration 15s load-tests/k6/scenarios/ws-connections.js

# 4. Run de carga real (25k VUs, 6 min total)
k6 run load-tests/k6/scenarios/auth-login.js
k6 run load-tests/k6/scenarios/incidents-read.js
k6 run load-tests/k6/scenarios/ws-connections.js
```

### Apuntar a staging

```bash
k6 run -e BASE_URL=http://SERVER_IP:3004 load-tests/k6/scenarios/auth-login.js
```

## Thresholds

Definidos en `thresholds.js`, compartidos por los 3 escenarios HTTP:

| Métrica | Threshold |
|---------|-----------|
| `http_req_duration` | p(95) < 200ms |
| `http_req_failed`   | rate < 0.1% (0.001) |
| `ws_connecting`     | p(95) < 500ms |

Si un threshold se viola, k6 retorna exit code 99 y el run se considera **fallido**.

## Visualización con Grafana (opcional)

```bash
# Levantar stack de monitoreo
docker compose -f load-tests/docker-compose.k6.yml up -d influxdb grafana

# Correr k6 exportando a InfluxDB
docker compose -f load-tests/docker-compose.k6.yml run --rm k6 \
  run /scripts/scenarios/auth-login.js

# Grafana → http://localhost:3100
# Datasource preconfigurado: InfluxDB (http://influxdb:8086, db: k6)
# Importar dashboard oficial de k6: https://grafana.com/grafana/dashboards/2587
```

## Notas de hardware

Para el escenario de 25k VUs se recomienda mínimo:
- 4 CPU cores
- 8 GB RAM

k6 es single-binary y eficiente — corre nativamente sin necesidad de runtime JS.
