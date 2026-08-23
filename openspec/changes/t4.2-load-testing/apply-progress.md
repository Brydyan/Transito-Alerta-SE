# Apply Progress: T4.2 Load Testing — k6

**Change**: t4.2-load-testing
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-22
**Status**: READY FOR VERIFY (con smoke tests pendientes por entorno)

---

## Tareas completadas

### Fase 0 — Scaffolding
- ✅ `load-tests/k6/scenarios/` creado

### Fase 1 — Thresholds compartidos
- ✅ `load-tests/k6/thresholds.js` con las 3 métricas:
  - `http_req_duration: ['p(95)<200']`
  - `http_req_failed:   ['rate<0.001']`
  - `ws_connecting:     ['p(95)<500']`

### Fase 2 — Escenario auth-login
- ✅ `load-tests/k6/scenarios/auth-login.js` creado
  - ramping-vus 0→25k (2m), hold (3m), ramp-down (1m)
  - `POST /api/auth/login` con `device_uuid: "load-test-${__VU}"`
  - Check `status 200`
  - Thresholds importados de `thresholds.js`
- ⚠️ **Smoke test manual (T2.2) NO EJECUTADO**: el daemon Docker está inactivo en este momento y requiere root para arrancar (`sudo systemctl start docker` no disponible en sesión no-interactiva). Validación alternativa: `k6 inspect` parsea el script sin errores de sintaxis.

### Fase 3 — Escenario incidents-read
- ✅ `load-tests/k6/scenarios/incidents-read.js` creado
  - Mismo ramping que auth-login
  - `GET /api/incidents` sin Authorization (público, T3.2)
  - Check `status 200`
  - Thresholds importados
- ⚠️ **Smoke test manual (T3.2) NO EJECUTADO** (mismo bloqueo de Docker)
- ✅ Sintaxis validada con `k6 inspect`

### Fase 4 — Escenario WebSocket
- ✅ `load-tests/k6/scenarios/ws-connections.js` creado
  - constant-vus 5000 durante 2m
  - Forced transport: `${WS_HOST}/socket.io/?EIO=4&transport=websocket`
  - Protocolo EIO: `2probe` → `3probe` → `5` (upgrade)
  - Hold connection 30s
  - Threshold `ws_connecting: p(95)<500`
- ⚠️ **Smoke test manual (T4.2) NO EJECUTADO** (mismo bloqueo de Docker)
- ✅ Sintaxis validada con `k6 inspect`

### Fase 5 — Infraestructura de visualización
- ✅ `load-tests/docker-compose.k6.yml` creado
  - influxdb 1.8 (puerto 8086)
  - grafana latest (puerto 3100)
  - k6 con `K6_OUT=influxdb=http://influxdb:8086/k6` y volume `./k6:/scripts`

### Fase 6 — Documentación
- ✅ `load-tests/k6/README.md` creado con:
  - Requisitos (k6 ≥ v0.52)
  - Estructura de archivos
  - Comandos para correr cada escenario (smoke + carga real)
  - Variable `BASE_URL` para staging
  - Thresholds explicados
  - Visualización con Grafana
  - Notas de hardware (4 cores / 8 GB)

---

## Verificación realizada (sin servidor)

```
$ k6 inspect load-tests/k6/scenarios/auth-login.js
  → "ramp_up" con stages 2m0s→25000, 3m0s→25000, 1m0s→0 ✓

$ k6 inspect load-tests/k6/scenarios/incidents-read.js
  → "ramp_up" idéntico ✓

$ k6 inspect load-tests/k6/scenarios/ws-connections.js
  → "ws_load" constant-vus=5000, duration=2m0s ✓
```

`k6 inspect` valida la sintaxis y la estructura de opciones, pero no ejecuta contra el backend.

---

## Bloqueo de smoke tests manuales

**Causa**: Docker daemon está `inactive (dead)` en el host. `dockerd` requiere root para arrancar (no se puede con `sudo` en sesión no-interactiva). Sin Docker no se puede:
- Levantar `tase-postgres` ni `tase-redis` (los contenedores del proyecto)
- Arrancar el backend NestJS con `pnpm run start:dev` o `node dist/main.js`
- Por tanto no se puede correr `k6 run` con un servidor real

**Impacto**: T2.2, T3.2, T4.2 (smoke tests con carga baja) y los criterios de cierre que requieren servidor real no se pudieron ejecutar en esta sesión.

**Mitigación disponible**: el usuario puede:
1. `sudo systemctl start docker` desde una terminal interactiva
2. `docker compose up -d` para levantar Postgres + Redis
3. `pnpm run start:dev` desde `backend/`
4. Re-correr los smoke tests con los comandos del README

**Validación parcial ya hecha**: `k6 inspect` confirma que los 3 scripts son sintácticamente correctos y tienen la estructura de opciones esperada (stages, VUs, executor, thresholds, default function).

---

## Desviaciones del diseño

1. **docker-compose.k6.yml añadido `depends_on: influxdb` al servicio k6**: el diseño original no lo especificaba. Sin `depends_on`, si k6 arranca antes que influxdb termine de inicializarse, el primer run puede fallar. Agregado por robustez.

2. **Grafana con `GF_AUTH_ANONYMOUS_ENABLED=true`**: el diseño no lo especificaba pero es el default esperado para dashboards de load testing. Permite ver métricas sin login. Documentado en docker-compose.k6.yml.

3. **k6 v0.55.0 instalado (no v0.52 mínima)**: tomé la última estable al momento de instalar. Compatible con todos los scripts (ES modules soportado desde v0.52).

---

## Archivos creados

```
load-tests/
├── docker-compose.k6.yml
└── k6/
    ├── README.md
    ├── thresholds.js
    └── scenarios/
        ├── auth-login.js
        ├── incidents-read.js
        └── ws-connections.js
```

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t4.2-load-testing/specs/**`
- `openspec/changes/t4.2-load-testing/design.md`
- `openspec/changes/t4.2-load-testing/proposal.md`
- Cualquier archivo bajo `backend/src/` (no se toca lógica de negocio)
- `database/migrations/**` (sin migraciones)
- `package.json` (k6 no es dependencia del backend, es standalone CLI)

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
**Bloqueo a resolver por el humano**: `sudo systemctl start docker` para correr smoke tests reales.
