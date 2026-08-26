# Tasks: T4 Security Hardening

**Change**: t4-security-hardening  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  
**Artifact store**: openspec  
**Strict TDD**: activo (`openspec/config.yaml: testing.strict_tdd: true`)  
**Working dir**: `backend/`  
**Test commands**: `pnpm test` (unit) | `pnpm run test:e2e` (e2e)  

Baseline a preservar antes de empezar:
- `pnpm test` → 77 unit specs passing
- `pnpm run test:e2e` → 15 e2e specs passing (134 tests)

Leer `openspec/changes/t4-security-hardening/design.md` ANTES de tocar código.

---

## Fase 0 — Verificación del baseline

- [x] **T0.1** Correr `pnpm test` desde `backend/` → confirmar 77 specs passing, 0 failing
- [x] **T0.2** Correr `pnpm run test:e2e` desde `backend/` → confirmar 15 suites, 134 tests passing
- [x] **T0.3** Leer `src/modules/incidents/dto/create-incident.dto.ts` → anotar si `title` tiene `@MaxLength()` o no (afecta assertion en T3.2)

---

## Fase 1 — T4.3c: Fix MoreThan en NotificationsService

### 1.1 — Test en rojo (TDD)

- [x] **T1.1** En `test/e2e/notifications.e2e-spec.ts`, al final del describe existente, agregar test que verifique que dos notificaciones idénticas en menos de 60s resultan en sólo 1 notificación creada:

```typescript
it('deduplicates identical notifications within 60 seconds (T4.3c fix)', async () => {
  const operator = await env.provisionUser(['CREATE incidents']);
  const auth = { Authorization: `Bearer ${operator.accessToken}` };

  // Crear incidente para tener un incidentId real
  const incident = await request(env.httpServer)
    .post('/api/incidents')
    .set(auth)
    .send({ title: 'Test dedup', lat: -2.2, lng: -80.5 })
    .expect(201);

  const incidentId = incident.body.id;

  // Disparar el mismo evento dos veces en secuencia rápida
  // Acceder al notificationsService vía el módulo de la app
  const notificationsService = env.app.get(NotificationsService);

  // Llamar notify() dos veces con mismos parámetros
  const result1 = await notificationsService.notify(
    { id: operator.userId } as any,
    'incident_created' as any,
    'Test message',
    incidentId,
  );
  const result2 = await notificationsService.notify(
    { id: operator.userId } as any,
    'incident_created' as any,
    'Test message',
    incidentId,
  );

  expect(result1).not.toBeNull();  // Primera: se crea
  expect(result2).toBeNull();       // Segunda: dedup → null
});
```

> Importar `NotificationsService` en el import del spec si no está ya.
> `env.app` expone la instancia NestJS de TestEnvironment — verificar si existe
> o si hay que usar `env.app.get(NotificationsService)` directamente.
> Si `env` no expone `.app`, leer `test/support/test-environment.ts` para saber
> cómo acceder al contexto del módulo.

- [x] **T1.2** Correr `pnpm run test:e2e` → confirmar que el test T1.1 falla (rojo)
  Expected: `result2` es `null`, Actual: `result2` es una `Notification` (dedup no funciona)

### 1.2 — Fix

- [x] **T1.3** En `src/modules/notifications/notifications.service.ts`:
  - Línea 3: cambiar `import { Repository } from 'typeorm'` → `import { MoreThan, Repository } from 'typeorm'`
  - Línea 40: reemplazar `created_at: (() => sixtySecondsAgo)() as any,` con `created_at: MoreThan(sixtySecondsAgo),`
  - Eliminar el comentario `// eslint-disable-next-line @typescript-eslint/no-explicit-any` de la línea anterior al fix

  Resultado esperado en el archivo:
  ```typescript
  import { MoreThan, Repository } from 'typeorm';
  // ...
  const existing = await this.notificationRepo.findOne({
    where: {
      user_id: user.id,
      type,
      ...(incidentId ? { incident_id: incidentId } : {}),
      created_at: MoreThan(sixtySecondsAgo),
    },
  });
  ```

- [x] **T1.4** Correr `pnpm run typecheck` → 0 errores
- [x] **T1.5** Correr `pnpm run test:e2e` → test T1.1 pasa (verde), resto sin regresiones

---

## Fase 2 — T4.3a: Helmet en main.ts

- [x] **T2.1** Instalar dependencia: `pnpm add helmet`
- [x] **T2.2** Verificar que `package.json` ahora incluye `"helmet"` en `dependencies`

- [x] **T2.3** En `src/main.ts`:
  - Agregar import al principio del archivo (después de los imports de NestJS):
    ```typescript
    import helmet from 'helmet';
    ```
  - Agregar `app.use(helmet())` como PRIMERA línea después de `app.useWebSocketAdapter(...)`:
    ```typescript
    app.useWebSocketAdapter(new RedisIoAdapter(app));

    app.use(helmet());   // ← headers de seguridad HTTP

    app.setGlobalPrefix('api');
    ```

- [x] **T2.4** Correr `pnpm run typecheck` → 0 errores
- [x] **T2.5** Correr `pnpm run lint` → 0 errores (lint puede quejarse de import order)
- [x] **T2.6** Correr `pnpm run build` → compilación limpia

---

## Fase 3 — T4.3b: Tests E2E de seguridad de inputs

Agregar nuevo `describe` de nivel superior al final de `test/e2e/regressions.e2e-spec.ts`,
ANTES de las funciones helper `joinWithRetry` y `getFreePort`.

El nuevo describe usa su propio `TestEnvironment` (mismo patrón que el describe existente).

- [x] **T3.1** Agregar nuevo `describe` con su propio `beforeAll/afterAll/beforeEach`:

```typescript
describe('E2E security — input validation and HTTP headers (T4.3a/T4.3b)', () => {
  let env: TestEnvironment;

  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  // TEST 1: SQL injection
  // TEST 2: XSS
  // TEST 3: helmet headers
});
```

- [x] **T3.2** Agregar test SQL injection (ver design.md D3 Test 1):

```typescript
it('SQL injection attempt in incident title does not cause 500 or execute SQL (CC1)', async () => {
  const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
  const maliciousTitle = "'; DROP TABLE incidents; --";

  const response = await request(env.httpServer)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .send({ title: maliciousTitle, lat: -2.2, lng: -80.5 });

  // Acepta 201 (stored as literal, parameterized queries protect DB)
  // o 400 (ValidationPipe rejects by maxLength/pattern)
  // NUNCA 500 (que indicaría ejecución SQL o crash)
  expect(response.status).not.toBe(500);
  expect([200, 201, 400]).toContain(response.status);

  // La tabla incidents debe seguir existiendo (DROP no se ejecutó)
  const check = await request(env.httpServer)
    .get('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .expect(200);

  expect(Array.isArray(check.body)).toBe(true);
});
```

> Si el DTO tiene `@MaxLength(255)` o similar (T0.3), el status será 400.
> Si no tiene, será 201. El test pasa en ambos casos — lo que importa es que NO sea 500.

- [x] **T3.3** Agregar test XSS (ver design.md D3 Test 2):

```typescript
it('XSS payload in title returns 201 or 400, never causes script execution in API response (T4.3b)', async () => {
  const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
  const xssTitle = '<script>alert("xss")</script>';

  const created = await request(env.httpServer)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .send({ title: xssTitle, lat: -2.2, lng: -80.5 });

  expect([201, 400]).toContain(created.status);

  if (created.status === 201) {
    // API devuelve JSON — verificar que el título se devuelve como string literal
    const incidents = await request(env.httpServer)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    const found = (incidents.body as Array<{ id: string; title: string }>)
      .find((i) => i.id === created.body.id);
    // El string debe ser literal, no parseado/ejecutado
    expect(found?.title).toBe(xssTitle);
  }
});
```

- [x] **T3.4** Agregar test de helmet headers (ver design.md D3 Test 3):

```typescript
it('HTTP security headers (helmet) present on API responses (T4.3a)', async () => {
  const operator = await env.provisionUser(['READ incidents']);

  const response = await request(env.httpServer)
    .get('/api/incidents')
    .set('Authorization', `Bearer ${operator.accessToken}`)
    .expect(200);

  expect(response.headers['x-frame-options']).toBeDefined();
  expect(response.headers['x-content-type-options']).toBe('nosniff');
});
```

---

## Fase 4 — Verificación final

- [x] **T4.1** `pnpm run lint` → 0 errores y 0 warnings
- [x] **T4.2** `pnpm run typecheck` → 0 errores
- [x] **T4.3** `pnpm test` → ≥77 unit specs passing (número puede aumentar si se agregaron unit tests)
- [x] **T4.4** `pnpm run test:e2e` → ≥15 suites, ≥137 tests passing (134 previos + 3 nuevos de seguridad + 1 dedup)
- [x] **T4.5** Confirmar que todos los nuevos tests aparecen bajo sus describe correctos en la salida de Jest

---

## Al terminar

Dejar `openspec/changes/t4-security-hardening/apply-progress.md` con:
- Lista de tareas completadas
- Cualquier desviación del diseño (ej: si `@MaxLength` existía o no en el DTO)
- Conteo final de tests
- Status: `READY FOR VERIFY`

Avisar al humano para que dispare `sdd-verify`.
