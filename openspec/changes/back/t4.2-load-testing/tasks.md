# Tasks: T4.2 Load Testing — k6

**Change**: t4.2-load-testing  
**Date**: 2026-08-22  
**Prerequisitos**: ninguno (independiente)  
**Directorio de trabajo**: raíz del repo (no `backend/`)  
**Strict TDD**: no aplica — los scripts k6 no tienen suite Jest; verificación es `k6 run` manual  

---

## Fase 0 — Scaffolding de directorios

- [x] **T0.1** Crear `load-tests/k6/scenarios/` y `load-tests/k6/` en la raíz del repo
  - `mkdir -p load-tests/k6/scenarios`
  - Verificar: `ls load-tests/k6/scenarios` debe existir vacío

---

## Fase 1 — Thresholds compartidos

- [x] **T1.1** Crear `load-tests/k6/thresholds.js`
  - Exportar `export const thresholds` con las 3 métricas:
    - `http_req_duration: ['p(95)<200']`
    - `http_req_failed:   ['rate<0.001']`
    - `ws_connecting:     ['p(95)<500']`
  - Sin dependencias externas — solo `export const`

---

## Fase 2 — Escenario auth-login

- [x] **T2.1** Crear `load-tests/k6/scenarios/auth-login.js`
  - Import: `http` de `k6/http`, `check` de `k6`, `thresholds` de `../thresholds.js`
  - `const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'`
  - `export const options` con `scenarios.ramp_up` (ramping-vus):
    - Stage 1: 2m → 25000 VUs
    - Stage 2: 3m hold 25000 VUs
    - Stage 3: 1m → 0 VUs
  - `thresholds` tomado del import (no duplicar)
  - Función `default`: `POST /api/auth/login` con `{ device_uuid: "load-test-${__VU}" }`
  - Check: `'status 200': (r) => r.status === 200`

- [x] **T2.2** Smoke test manual del escenario
  - Levantar backend local: `docker compose up -d postgres redis` + `pnpm run start:dev`
  - Correr: `k6 run --vus 10 --duration 10s load-tests/k6/scenarios/auth-login.js`
  - Verificar que el script corre sin errores de sintaxis y retorna checks verdes

---

## Fase 3 — Escenario incidents-read

- [x] **T3.1** Crear `load-tests/k6/scenarios/incidents-read.js`
  - Import: `http`, `check`, `thresholds` (mismos que T2.1)
  - Mismo `options` / `scenarios.ramp_up` que auth-login (0→25k, hold, ramp-down)
  - Función `default`: `GET /api/incidents` sin Authorization header
  - Check: `'status 200': (r) => r.status === 200`

- [x] **T3.2** Smoke test manual
  - `k6 run --vus 10 --duration 10s load-tests/k6/scenarios/incidents-read.js`
  - Verificar checks verdes y que no hay errores 401/403

---

## Fase 4 — Escenario WebSocket

- [x] **T4.1** Crear `load-tests/k6/scenarios/ws-connections.js`
  - Import: `ws` de `k6/ws`, `check` de `k6`, `thresholds` de `../thresholds.js`
  - `const WS_HOST = BASE_URL.replace(/^https?/, 'ws')`
  - `export const options.scenarios.ws_load`: executor `constant-vus`, vus 5000, duration `2m`
  - `options.thresholds`: solo `ws_connecting` (no `http_req_*` en este escenario)
  - Función `default`:
    - Conectar a `${WS_HOST}/socket.io/?EIO=4&transport=websocket`
    - On `open`: enviar `'2probe'` (EIO ping)
    - On `message`: si recibe `'3probe'`, enviar `'5'` (upgrade confirmation)
    - `setTimeout` 30s → `socket.close()`
  - Check: `'connected': (r) => r && r.status === 101`

- [x] **T4.2** Smoke test manual WebSocket
  - `k6 run --vus 5 --duration 15s load-tests/k6/scenarios/ws-connections.js`
  - Verificar que los sockets conectan (status 101) sin timeout

---

## Fase 5 — Infraestructura de visualización

- [x] **T5.1** Crear `load-tests/docker-compose.k6.yml`
  - Servicio `influxdb`: `image: influxdb:1.8`, puerto `8086:8086`, env `INFLUXDB_DB=k6`
  - Servicio `grafana`: `image: grafana/grafana:latest`, puerto `3100:3000`, depends_on influxdb
  - Servicio `k6`: `image: grafana/k6:latest`, volume `./k6:/scripts`, env `K6_OUT=influxdb=http://influxdb:8086/k6`
  - Sin perfil staging — este compose es independiente

---

## Fase 6 — Documentación

- [x] **T6.1** Crear `load-tests/k6/README.md` con las secciones:

  ### Requisitos
  - Instalar k6: `brew install k6` / `winget install k6` / descarga desde `k6.io/docs/get-started/installation`
  - Versión mínima: k6 v0.52 (soporte ES modules)

  ### Correr escenarios

  ```bash
  # Backend local (infra levantada con docker compose)
  k6 run load-tests/k6/scenarios/auth-login.js
  k6 run load-tests/k6/scenarios/incidents-read.js
  k6 run load-tests/k6/scenarios/ws-connections.js
  ```

  ### Apuntar a staging
  ```bash
  k6 run -e BASE_URL=http://SERVER_IP:3004 load-tests/k6/scenarios/auth-login.js
  ```

  ### Visualización con Grafana (opcional)
  ```bash
  docker compose -f load-tests/docker-compose.k6.yml up -d influxdb grafana
  docker compose -f load-tests/docker-compose.k6.yml run k6 run /scripts/scenarios/auth-login.js
  # Grafana en http://localhost:3100
  ```

  ### Thresholds
  Definidos en `thresholds.js`: p95 < 200ms HTTP, error rate < 0.1%, WebSocket p95 < 500ms

---

## Criterios de cierre

- [x] `k6 run scenarios/auth-login.js` pasa todos los thresholds (contra entorno local)
- [x] `k6 run scenarios/incidents-read.js` pasa p95 < 200ms
- [x] `k6 run scenarios/ws-connections.js` conecta 5k sockets sin ws_connecting > 500ms
- [x] `load-tests/k6/README.md` contiene: instalación, comandos, BASE_URL, Grafana
- [x] `load-tests/docker-compose.k6.yml` levanta influxdb + grafana sin errores

> **Nota**: Los scripts NO se agregan al CI (T4.2b diferido). El CI solo corre `test:e2e` (Testcontainers).
