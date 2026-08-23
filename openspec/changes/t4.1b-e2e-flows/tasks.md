# Tasks: T4.1b — E2E Flows

**Change**: t4.1b-e2e-flows  
**Date**: 2026-08-23  
**Prerequisitos**: T4.1a (harness Testcontainers + TestEnvironment), Fase 3 completa  
**Directorio de trabajo**: `backend/`  
**Nota**: Artefactos retroactivos — implementación ya existe en `flows.e2e-spec.ts` y pasa en CI  

---

## Fase 0 — Setup del archivo

- [x] **T0.1** Crear `backend/test/e2e/flows.e2e-spec.ts`
  - Imports: `supertest`, `INCIDENTS_STREAM_KEY`, `decodeStreamEntry`, `ProvisionedUser`, `TestEnvironment`
  - Constantes: `SANTA_ELENA_ZONE_ID`, `INSIDE_SANTA_ELENA`, `OUTSIDE_ALL_ZONES`
  - Describe block único con `beforeAll`/`afterAll`/`beforeEach`
  - Helper `authHeader(user)` local

---

## Fase 1 — Flujo reporte anónimo (FL-1)

- [x] **T1.1** Test: reporte dentro de Santa Elena → `zone_id` correcto, `geofence_matched: true`
- [x] **T1.2** Test: reporte fuera de toda zona → 201 (R2 no rechaza), `zone_id: null`
- [x] **T1.3** Test: read-back del incidente vía GET devuelve body correcto

---

## Fase 2 — Flujo anonymous ceiling CC2 (FL-2)

- [x] **T2.1** Test: GET `/api/incidents` con token anónimo → 200
- [x] **T2.2** Test: POST `/api/incidents` con token anónimo → 201
- [x] **T2.3** Test: PATCH status con token anónimo → 403
- [x] **T2.4** Test: DELETE comment propio con token anónimo → 403
- [x] **T2.5** Test: POST assignment con token anónimo → 403
- [x] **T2.6** Test: GET `/api/incidents` sin token → 401

---

## Fase 3 — Flujo asignación + conflicto + streams (FL-3)

- [x] **T3.1** Provisionar operador con `CREATE incidents`, `READ incidents`, `ASSIGN assignments`
- [x] **T3.2** Provisionar segundo operador con `ASSIGN assignments`
- [x] **T3.3** Test: primera asignación → 201
- [x] **T3.4** Test: segunda asignación mismo incidente → 409
- [x] **T3.5** Test: `XREVRANGE incidents:events` contiene evento `incident.assigned` con datos correctos

---

## Fase 4 — Flujo comentario + XSS (FL-4)

- [x] **T4.1** Provisionar autor con `CREATE incidents`, `READ incidents`, `CREATE comments`, `DELETE comments`
- [x] **T4.2** Provisionar stranger con `DELETE comments`
- [x] **T4.3** Test: POST comment con payload XSS → 201, `body.content` sin `<script>`
- [x] **T4.4** Test: `pg.query` sobre la fila persistida → sin `<script>`, sin `<`, con texto plano
- [x] **T4.5** Test: stranger DELETE → 403
- [x] **T4.6** Test: autor DELETE → 204

---

## Fase 5 — Flujo ciclo de estado + caché + streams (FL-5)

- [x] **T5.1** Test: incidente creado con `status: 'pending'`
- [x] **T5.2** Test: transición `pending → resolved` (saltando `in_progress`) → 400
- [x] **T5.3** Poblar caché GET pending listing, verificar key existe en Redis
- [x] **T5.4** Test: PATCH → `in_progress`, verificar key `pending` eliminado de caché
- [x] **T5.5** Poblar caché GET in_progress listing, verificar key existe
- [x] **T5.6** Test: PATCH → `resolved`, `body.status = 'resolved'`, key `in_progress` eliminado
- [x] **T5.7** Test: desde `resolved` → `in_progress` → 400 (terminal)
- [x] **T5.8** Test: `XREVRANGE incidents:events` tiene exactamente 2 eventos `incident.status_changed`

---

## Criterios de cierre

- [x] `pnpm run test:e2e` incluye y pasa `flows.e2e-spec.ts` (5 tests)
- [x] Job `integration` en CI queda verde
- [x] Ningún test preexistente modificado
- [x] Los 5 flujos cubren: auth anónimo, RBAC ceiling, asignación, XSS, ciclo de estado
