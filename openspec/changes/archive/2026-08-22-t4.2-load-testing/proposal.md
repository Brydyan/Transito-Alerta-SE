# Proposal: T4.2 Load Testing — k6

**Change**: t4.2-load-testing  
**Author**: Claude (Architect role)  
**Date**: 2026-08-22  
**Priority**: Media — validación de rendimiento pre-producción, independiente del resto de Fase 4  

---

## Intent

Crear scripts de load testing con k6 para verificar que el backend aguanta la carga
esperada en producción: **25k usuarios concurrentes** con p95 < 200ms y error rate < 0.1%.

Los tres vectores de carga a probar son:
1. **Auth (login)** — el endpoint más crítico, gating de todos los demás
2. **Incidents read** — el endpoint más frecuente en producción (feed ciudadano)
3. **WebSocket connections** — 5k sockets simultáneos conectados a salas geo

k6 fue elegido sobre Artillery porque su soporte nativo de WebSocket maneja el handshake
de socket.io v4; el plugin WebSocket de Artillery no lo soporta.

---

## Scope

| Ruta | Tipo | Qué se crea |
|------|------|-------------|
| `load-tests/k6/scenarios/auth-login.js` | nuevo | Escenario auth: 25k VUs ramping en 2m |
| `load-tests/k6/scenarios/incidents-read.js` | nuevo | Escenario read: 25k VUs con token anónimo |
| `load-tests/k6/scenarios/ws-connections.js` | nuevo | Escenario WebSocket: 5k sockets simultáneos |
| `load-tests/k6/thresholds.js` | nuevo | Thresholds compartidos exportados |
| `load-tests/k6/README.md` | nuevo | Instrucciones de instalación y ejecución |
| `load-tests/docker-compose.k6.yml` | nuevo | k6 + InfluxDB + Grafana (visualización local) |

**Fuera de scope**:
- No se integran los scripts al CI (requieren hardware dedicado — decisión T4.2b, diferida)
- No se modifican archivos bajo `backend/src/`
- No hay migraciones de DB
- No hay nuevos módulos NestJS

---

## Approach

- Scripts autocontenidos en JS (sin build step) — `k6 run scenarios/auth-login.js` listo
- Thresholds centralizados en `thresholds.js` para que los 3 escenarios compartan la misma barra
- WebSocket vía forced transport: `?EIO=4&transport=websocket` bypasea el polling inicial
- Datos parametrizados via `__ENV.BASE_URL` (default `http://localhost:3001`)
- docker-compose.k6.yml para visualización opcional con InfluxDB + Grafana; no es requisito de CI

---

## Criterios de aceptación (resumen)

- `k6 run scenarios/auth-login.js` pasa todos los thresholds contra entorno local
- `k6 run scenarios/incidents-read.js` pasa p95 < 200ms
- `k6 run scenarios/ws-connections.js` conecta 5k sockets sin ws_connecting > 500ms
- README documenta instalación, ejecución, y cómo apuntar a staging con `BASE_URL`
