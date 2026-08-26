# Proposal: T4.1b — E2E Flows (Harness Step 2 Part B)

**Change**: t4.1b-e2e-flows  
**Author**: Claude (Architect role)  
**Date**: 2026-08-23  
**Priority**: Alta — cierra la deuda de T4.1a (el harness existía pero con solo un spec de humo)

---

## Intent

T4.1a entregó el harness Testcontainers (Postgres real + Redis real) y un spec de
humo (`health.e2e-spec.ts`). Los cuatro flujos completos que motivaron T4.1 —
donde siete defectos de Fases 1-2 vivían en costuras que los unit tests mockeaban —
quedaron diferidos como T4.1b para después de Fase 3.

Con Fase 3 completa (Sessions, Invitations, Organizations con scoping, Notifications,
StatusHistory), los flujos se pueden ejercitar con fidelidad total: auth real,
RBAC real, Redis Streams real, caché real, WebSocket real.

---

## Scope

| Archivo | Tipo | Contenido |
|---------|------|-----------|
| `backend/test/e2e/flows.e2e-spec.ts` | nuevo | 5 tests de flujo completo |

**5 flujos implementados** (el "ceiling" se separó del "reporte anónimo" para claridad):

1. **Reporte anónimo**: dentro y fuera de Santa Elena, read-back (R2)
2. **Anonymous ceiling (CC2)**: READ/CREATE OK; UPDATE/DELETE/ASSIGN → 403; sin token → 401
3. **Asignación con conflicto**: operador reclama, segundo conflicto 409, evento en Redis Streams
4. **Ciclo de comentario**: payload XSS sanitizado en DB (no solo response), owner delete, non-owner 403
5. **Ciclo de estado**: pending→in_progress→resolved, transición fuera-de-orden rechazada, caché purgado, stream emitido

**Fuera de scope**:
- Sin modificaciones a `backend/src/` — solo tests
- Sin migraciones de DB
- Sin nuevos módulos NestJS
- El flujo de notificación asíncrona (`notifications.e2e-spec.ts`) ya existe; no se duplica aquí

---

## Approach

- Mismo harness `TestEnvironment` de T4.1a (un env por describe, `beforeAll`/`afterAll`)
- `beforeEach(() => env.reset())` para aislamiento entre tests
- `provisionUser()` para auth sin acoplamiento a credenciales fijas
- Verificaciones directas en Postgres (`env.pg.query`) y Redis (`env.redisStreams.xrevrange`) donde el response HTTP no es suficiente para probar la costura real

---

## Criterios de aceptación

- `pnpm run test:e2e` incluye `flows.e2e-spec.ts` y todos los tests pasan
- No se modifica ningún test preexistente
- El job `integration` en CI queda verde
