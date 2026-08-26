# Spec: Load Testing — k6 Scripts

**Capability**: load-testing  
**Change**: t4.2-load-testing  
**Date**: 2026-08-22  

---

## Thresholds globales (LT-TH)

| Métrica | Threshold | Aplica a |
|---------|-----------|----------|
| `http_req_duration` p95 | < 200ms | auth-login, incidents-read |
| `http_req_failed` rate | < 0.1% | auth-login, incidents-read |
| `ws_connecting` p95 | < 500ms | ws-connections |

---

## Escenario 1 — Auth Login (LT-S1)

**Archivo**: `load-tests/k6/scenarios/auth-login.js`

### Given / When / Then

**LT-S1-01 — Ramping exitoso**
- **Given** el backend está corriendo en `BASE_URL` con postgres y redis healthy
- **When** k6 ejecuta el escenario `ramp_up` (0 → 25k VUs en 2m, hold 3m, ramp-down 1m)
- **Then** `http_req_duration` p95 < 200ms AND `http_req_failed` rate < 0.1%
- **Then** el summary final muestra `✓ checks` en todos los thresholds definidos

**LT-S1-02 — Request válido**
- **Given** un VU ejecuta la función default
- **When** hace `POST /api/auth/login` con body `{ device_uuid: "load-test-{__VU}" }`
- **Then** la respuesta tiene status 200
- **Then** el check `'status 200'` se registra como passed

**LT-S1-03 — Variable BASE_URL**
- **Given** el script se lanza con `k6 run -e BASE_URL=http://staging:3004 scenarios/auth-login.js`
- **When** k6 construye la URL del request
- **Then** usa `http://staging:3004/api/auth/login` (no el default localhost:3001)

---

## Escenario 2 — Incidents Read (LT-S2)

**Archivo**: `load-tests/k6/scenarios/incidents-read.js`

### Given / When / Then

**LT-S2-01 — Lectura anónima bajo carga**
- **Given** el backend está corriendo
- **When** k6 ejecuta 25k VUs haciendo `GET /api/incidents`
- **Then** `http_req_duration` p95 < 200ms AND `http_req_failed` rate < 0.1%

**LT-S2-02 — Sin autenticación requerida**
- **Given** un VU ejecuta la función default
- **When** hace `GET /api/incidents` sin header `Authorization`
- **Then** la respuesta tiene status 200 (feed público, scope `public` por T3.2)

**LT-S2-03 — Ramp profile igual a S1**
- **Given** el escenario incidents-read
- **When** se inspecciona su `options.scenarios`
- **Then** tiene el mismo perfil de ramping: 0→25k en 2m, hold 3m, ramp-down 1m

---

## Escenario 3 — WebSocket Connections (LT-S3)

**Archivo**: `load-tests/k6/scenarios/ws-connections.js`

### Given / When / Then

**LT-S3-01 — 5k sockets simultáneos**
- **Given** el backend está corriendo con socket.io habilitado
- **When** k6 ejecuta 5k VUs, cada uno estableciendo una conexión WebSocket
- **Then** `ws_connecting` p95 < 500ms

**LT-S3-02 — Handshake socket.io v4 forzado**
- **Given** k6 no soporta el polling upgrade de socket.io nativo
- **When** el script construye la URL de conexión
- **Then** usa `ws://BASE_HOST/socket.io/?EIO=4&transport=websocket` (bypass polling)

**LT-S3-03 — Join room y hold**
- **Given** una conexión WS establecida
- **When** el socket recibe el evento `connect` de socket.io
- **Then** envía un mensaje de join para `geo:{zone_id}` y mantiene la conexión 30s
- **Then** la conexión se cierra limpiamente al finalizar el VU

**LT-S3-04 — VUs distintos**
- **Given** múltiples VUs corriendo simultáneamente
- **When** cada VU se conecta
- **Then** no comparten estado de conexión (cada VU tiene su propio socket)

---

## Infraestructura de visualización (LT-V1)

**Archivo**: `load-tests/docker-compose.k6.yml`

**LT-V1-01 — Servicios presentes**
- **Given** el archivo `docker-compose.k6.yml`
- **When** se hace `docker compose -f docker-compose.k6.yml up -d`
- **Then** levantan 3 servicios: k6, influxdb, grafana
- **Then** grafana queda accesible en `http://localhost:3100`

**LT-V1-02 — Solo para visualización local**
- **Given** la decisión de no correr load tests en CI (T4.2b diferido)
- **Then** este compose NO se referencia desde `.github/workflows/`

---

## Documentación (LT-D1)

**Archivo**: `load-tests/k6/README.md`

**LT-D1-01 — Secciones requeridas**
- **Given** el README
- **Then** contiene: Requisitos (instalar k6), Cómo correr cada escenario, Variable `BASE_URL`, Visualización con Grafana

**LT-D1-02 — Comandos copy-paste**
- **Given** un dev que nunca corrió k6
- **When** lee el README
- **Then** puede ejecutar `k6 run scenarios/auth-login.js` sin consultar otra documentación
