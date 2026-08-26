# Design: T4 Security Hardening

**Change**: t4-security-hardening  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  

---

## D1 — T4.3c: MoreThan reemplaza el IIFE `as any`

**Problema exacto** (`notifications.service.ts:34-42`):

```typescript
// ROTO — pasa Date como equality, no como range
const existing = await this.notificationRepo.findOne({
  where: {
    user_id: user.id,
    type,
    ...(incidentId ? { incident_id: incidentId } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    created_at: (() => sixtySecondsAgo)() as any,  // ← BUG
  },
});
```

`findOne({ where: { created_at: <Date> } })` genera `WHERE created_at = '2026-08-21T...'`.
Nunca matchea porque ninguna notificación tiene ese timestamp exacto. Dedup muerto.

**Fix**:

```typescript
import { MoreThan, Repository } from 'typeorm';   // añadir MoreThan al import

const existing = await this.notificationRepo.findOne({
  where: {
    user_id: user.id,
    type,
    ...(incidentId ? { incident_id: incidentId } : {}),
    created_at: MoreThan(sixtySecondsAgo),         // ← correcto: WHERE created_at > '...'
  },
});
```

`MoreThan()` es un `FindOperator<Date>` de TypeORM — el tipo correcto para la clave `created_at`
del entity. No requiere eslint-disable, no rompe `typecheck`.

**Blast radius**: sólo `notify()`. Tests afectados: `test/e2e/notifications.e2e-spec.ts`.

---

## D2 — T4.3a: Helmet como primer middleware en bootstrap()

**Dependencia**: `helmet` no está en `package.json`. Instalar con `pnpm add helmet`.

`helmet` es un wrapper de ~14 middlewares de Express que setean headers seguros. Compatible
con NestJS sin configuración adicional — se aplica vía `app.use()` antes de CORS para que
los headers de seguridad lleguen a toda respuesta, incluyendo las de CORS.

**Posición en `main.ts`** (ANTES de `app.setGlobalPrefix` y ANTES de `app.enableCors`):

```typescript
import helmet from 'helmet';     // default import (ESM compatible)

async function bootstrap(): Promise<void> {
  // ... Sentry init ...

  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new RedisIoAdapter(app));

  app.use(helmet());              // ← PRIMERO: headers de seguridad HTTP

  app.setGlobalPrefix('api');
  app.enableCors({ ... });
  // ... resto sin cambios
}
```

**Headers que agrega** (defaults de `helmet()`):
- `X-Frame-Options: SAMEORIGIN` — anti-clickjacking
- `X-Content-Type-Options: nosniff` — anti-MIME sniffing
- `Strict-Transport-Security: max-age=15552000` — fuerza HTTPS en browsers
- `X-DNS-Prefetch-Control: off`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 0` (deshabilita el XSS auditor roto de IE)

**ContentSecurityPolicy** queda deshabilitado en defaults porque rompería la API REST.
No se necesita para una API pura (sólo para apps que sirven HTML).

**Verificación en test**: en `regressions.e2e-spec.ts` verificar que `GET /api/health`
o `GET /api/incidents` incluye `x-frame-options: SAMEORIGIN` en el response header.

---

## D3 — T4.3b: Tests E2E de seguridad de inputs

**Ubicación**: nuevo `describe` en `backend/test/e2e/regressions.e2e-spec.ts` al final
del archivo, antes de las funciones helper `joinWithRetry` y `getFreePort`.

Los tests comparten el mismo `TestEnvironment` del describe existente si se anidan,
o arrancan su propio `env` si se crean en un `describe` de nivel superior. Usar
**describe de nivel superior** (mismo patrón que el existente) para mayor claridad.

### Test 1 — SQL injection en `title`

```typescript
it('SQL injection attempt in incident title returns 400, not 500 (CC1 parameterized queries)', async () => {
  const operator = await env.provisionUser(['CREATE incidents']);
  const maliciousTitle = "'; DROP TABLE incidents; --";

  const response = await request(env.httpServer)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .send({ title: maliciousTitle, lat: -2.2, lng: -80.5 })
    .expect(400);  // ValidationPipe: title maxLength=255 o whitelist rechaza

  // La tabla incidents debe seguir existiendo
  const check = await request(env.httpServer)
    .get('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .expect(200);

  expect(Array.isArray(check.body)).toBe(true);
});
```

> **Nota de implementación**: Si `ValidationPipe` no tiene `maxLength` en el DTO de
> CreateIncidentDto, el título malicioso puede ser almacenado como string literal (201),
> lo cual es CORRECTO — las queries parametrizadas lo tratan como dato, no como SQL.
> En ese caso cambiar `expect(400)` a `expect(response.status).toBeLessThan(500)`.
> Confirmar revisando `src/modules/incidents/dto/create-incident.dto.ts`.

### Test 2 — XSS en `title` almacenado y recuperado

```typescript
it('XSS script tag stored in title survives round-trip as literal string, not executed (T4.3b)', async () => {
  const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
  const xssTitle = '<script>alert("xss")</script>';

  const created = await request(env.httpServer)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .send({ title: xssTitle, lat: -2.2, lng: -80.5 })
    .expect((res) => {
      // Acepta 201 (stored as literal) o 400 (sanitized/rejected)
      if (res.status !== 201 && res.status !== 400) {
        throw new Error(`Expected 201 or 400, got ${res.status}`);
      }
    });

  if (created.status === 201) {
    // Si se almacenó: verificar que el API lo devuelve como string literal,
    // nunca como HTML renderizado (la API es JSON, no HTML, pero validamos igualmente)
    const incidents = await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    const found = incidents.body.find((i: { id: string }) => i.id === created.body.id);
    expect(found?.title).toBe(xssTitle);  // string literal, no sanitizado/alterado
  }
});
```

### Test 3 — Helmet headers presentes

```typescript
it('security headers (helmet) present on every API response (T4.3a)', async () => {
  const response = await request(env.httpServer)
    .get('/api/incidents')
    // No auth — sólo verificamos que los headers llegan antes de auth middleware
    .expect((res) => { /* cualquier status */ });

  expect(response.headers['x-frame-options']).toBeDefined();
  expect(response.headers['x-content-type-options']).toBe('nosniff');
});
```

---

## D4 — TDD: orden de trabajo

| Paso | Acción | Estado esperado del suite |
|------|--------|--------------------------|
| 1 | Escribir test de dedup en `notifications.e2e-spec.ts` que falla | 🔴 rojo |
| 2 | Aplicar fix `MoreThan()` en `notifications.service.ts` | 🟢 verde |
| 3 | `pnpm add helmet` | — |
| 4 | Aplicar cambio en `main.ts` | — |
| 5 | Escribir test de helmet headers (D3 Test 3) | 🟢 verde (con helmet) |
| 6 | Escribir tests SQL injection y XSS (D3 Test 1 y 2) | 🟢 verde (params ya correctos) |
| 7 | `pnpm test && pnpm run test:e2e` full suite | 🟢 sin regresiones |

---

## D5 — Archivos NO modificar

- `openspec/changes/t4-security-hardening/specs/**` — contrato de Gemini/Architect
- `openspec/changes/t4-security-hardening/design.md` — este archivo
- `database/migrations/**` — sin migraciones en este change
- `openspec/config.yaml` — sin cambios de configuración

---

## D6 — Revisión del DTO de incidents (pre-condición de T4.3b)

Antes de escribir el test de SQL injection, leer
`src/modules/incidents/dto/create-incident.dto.ts` para verificar si `title` tiene
`@MaxLength()`. Si no tiene: el título malicioso retorna 201 (correcto, datos como datos).
Si tiene: retorna 400. Ajustar el assertion del test según lo observado.
