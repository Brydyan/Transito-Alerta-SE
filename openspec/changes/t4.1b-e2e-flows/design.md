# Design: T4.1b — E2E Flows

**Change**: t4.1b-e2e-flows  
**Date**: 2026-08-23  

---

## Decisiones técnicas

### D1 — TestEnvironment compartido por describe (no por test)

Un solo `TestEnvironment` por describe block, levantado en `beforeAll` y bajado en `afterAll`.
Levantar Testcontainers cuesta ~5-10s; si cada test lo hace, la suite tarda varios minutos.
`beforeEach(() => env.reset())` garantiza aislamiento entre tests con TRUNCATE + seed.

### D2 — provisionUser() para setup de auth

`env.provisionUser(permissions[])` crea un usuario + token en la base throwaway.
No depende de credenciales fijas ni de migraciones seed — cada test provisiona exactamente
lo que necesita. Esto hace que los tests sean legibles: la lista de permisos documenta
el actor.

### D3 — Verificación directa en Postgres para XSS (FL-4)

El response HTTP podría ser sanitizado por el serializer sin que la DB se haya limpiado.
`env.pg.query('SELECT content FROM comments WHERE id = $1', [id])` prueba que la
sanitización ocurre en la capa de persistencia, no solo en el response.
Esta distinción encontró el bug original.

### D4 — Verificación directa en Redis para Streams y caché (FL-3, FL-5)

`env.redisStreams.xrevrange(INCIDENTS_STREAM_KEY, '+', '-', 'COUNT', 10)` inspecciona
el stream real. Prueba que la integración Service → Redis Streams funcionó sin
intermediarios (el listener asíncrono). Sin esto, un mock del RedisClient silenciaría
el defecto real.

Para caché: `env.redisCache.get(key)` verifica que el key de caché con scope
discriminator (`:p`) fue efectivamente eliminado al transicionar el estado.
El patrón de key `incidents:list:{zone_id}:{status}:{scope}` queda documentado
implícitamente en los tests.

### D5 — `device_uuid: 'anonymous'` como actor del techo ciudadano

La fila anónima es el seed de 0001 (`users.device_uuid = 'anonymous'`). `reset()`
la recrea después de cada TRUNCATE (la migración 0001 usa ON CONFLICT DO NOTHING
pero TRUNCATE la elimina). Usar este device_uuid garantiza que el test de CC2
ejercita el mismo path de auth que usa un ciudadano real.

### D6 — 5 tests en un único describe block

La alternativa (un archivo por flujo) requiere 5 `TestEnvironment` arrancados en
paralelo → mucho más lento y más difícil de razonar sobre orden. Los 5 flujos
son ortogonales entre sí (no comparten estado entre tests por el reset()) y pertenecen
conceptualmente al mismo subject: flujos de ciudadano/operador sobre incidentes.

### D7 — `SANTA_ELENA_ZONE_ID` hardcoded como constante de test

El UUID `8f14e45f-ceea-4c1f-8f2c-000000000024` viene de la migración 0003 (seed
determinista de Santa Elena). Es una fixture inmutable que `reset()` preserva
(no está en las tablas que TRUNCATE toca). No es un magic number — es una invariante
del esquema.

---

## Estructura de archivos

```
backend/test/e2e/flows.e2e-spec.ts    # 5 tests, ~250 líneas, describe único
```

Sin nuevas dependencias. Usa el mismo harness que las 14 suites existentes.

---

## Matriz de cobertura por flujo

| Flujo | Módulos ejercitados | Verificación extra |
|-------|--------------------|--------------------|
| FL-1 reporte anónimo | Auth, Incidents, Geofencing | — |
| FL-2 ceiling CC2 | Auth, RBAC, Incidents, Comments, Assignments | — |
| FL-3 asignación | Auth, Incidents, Assignments, Redis Streams | `XREVRANGE` directo |
| FL-4 comentario XSS | Auth, Incidents, Comments | `pg.query` directo |
| FL-5 estado + caché | Auth, Incidents, StatusHistory, Redis Cache + Streams | `redisCache.get`, `XREVRANGE` |
