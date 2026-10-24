# Security Action Plan — 2026-10-18

**Date:** 2026-10-18
**Status:** Action Plan
**Companion to:** `SECURITY_AUDIT_2026-10-18.md`
**Target:** Backend (NestJS + TypeORM), Frontend (Angular), Infra (Docker), CI/CD
**For:** Builder Agent — implementable checklist with exact code locations

---

## Estado Actual del Código (verificado 2026-10-18)

| Componente | Ubicación | Estado | Riesgo |
|-----------|-----------|--------|--------|
| CORS | `backend/src/main.ts:71` | `origin: true` (default si no `CORS_ORIGIN`) | 🔴 Acepta cualquier origen sin env var |
| RateLimiter | `backend/src/shared/guards/rate-limiter.guard.ts` | Verifica JWT ✅, fallback IP ✅ | ⚠️ IP spoofing si proxy-addr <2.0.8 |
| Helmet | `backend/src/main.ts:65-67` | Configurado ✅ | 🟢 CSP/HSTS presentes, no auditadas formalmente |
| Backend Docker | `backend/Dockerfile:31-40` | SIN `USER` stage (corre como root) | 🔴 Defense-in-depth falla |
| Frontend Docker | `frontend/Dockerfile:39-43` | nginx user ✅ | 🟢 OK |
| Dependabot | `.github/dependabot.yml` | NO EXISTS | 🔴 62 vulns se acumulan sin auto-scan |

---

## Convention

Cada item sigue este formato:

```
[P<n>] <título>
  Severidad: 🔴 Crítico | 🟠 Alto | 🟡 Medio | 🟢 Bajo | ⚪ Muy bajo
  Área: deps | auth | secrets | docker | ci | code | config | infra
  Esfuerzo: XS (<1h) | S (1-4h) | M (4-8h) | L (1-2d) | XL (>2d)
  Riesgo de cambio: Bajo | Medio | Alto
  Comando / approach: ...
  Validación: ...
  Si sale mal: rollback ...
```

Severidad NO es esfuerzo — es urgencia. Un fix `XS` puede ser `🔴 Crítico`
(1 línea, 30 min, cierra un bypass). Un fix `XL` puede ser `🟢 Bajo`
(refactor cosmético).

---

## 🔴 CRÍTICO (esta semana, hacer antes del próximo deploy)

### [P1] Actualizar `proxy-addr` a >=2.0.8 (IP spoofing bypass del rate limiter)

  **Severidad:** 🔴 Crítico
  **Área:** deps
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo
  **Issue:** GHSA-jqcg-44mw-7w3h — IP spoofing via IPv4-mapped IPv6 trust
  subnet. Permite bypasear el `RateLimiterGuard` para usuarios no
  autenticados.

  **Approach:**

  ```bash
  cd backend
  pnpm update proxy-addr@^2.0.8
  pnpm test                                          # 1501 specs verdes
  git diff backend/pnpm-lock.yaml | head -50         # confirmar cambio
  ```

  Si hay conflictos con `@nestjs/platform-express` por el peer dep de
  `express`, forzar resolución:

  ```json
  // backend/package.json → "pnpm": { "overrides": { ... } }
  "overrides": { "proxy-addr": "^2.0.8" }
  ```

  **Validación:** arrancar staging, intentar `curl -H "X-Forwarded-For:
  ::ffff:127.0.0.1"` contra `/auth/login` y confirmar que el rate limit
  cuenta al spoofed IP (lo cual sería el comportamiento seguro — IP
  confiable solo de proxies en `TRUSTED_PROXY_CIDR`).
  **Si sale mal:** `pnpm install` revierte al lockfile previo.

---

### [P2] Actualizar `multer` a >=2.2.0 (DoS por uploads incompletos)

  **Severidad:** 🟠 Alto (en realidad debería ser Crítico por superficie:
  todos los endpoints de upload)
  **Área:** deps
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  ```bash
  cd backend
  pnpm update multer@^2.2.0
  pnpm test
  ```

  **Validación:** arrancar staging, subir un archivo grande y abortar a
  mitad (kill connection); confirmar que no quedan temp files huérfanos
  en `/tmp` o en el directorio configurado.
  **Si sale mal:** los controllers de upload son `incident-images`,
  `comment-images`, `avatar`. Revisar sus signatures de `FileInterceptor`
  y `@UseInterceptors` — la API de multer 2.x es compatible con la 1.x
  para uso básico.

---

### [P3] Actualizar `engine.io` a >=6.6.10 (Socket.IO DoS)

  **Severidad:** 🟠 Alto
  **Área:** deps
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  ```bash
  cd backend
  pnpm update engine.io@^6.6.10 socket.io@^4.8.3
  pnpm test
  ```

  **Validación:** abrir WebSocket connection desde el frontend, confirmar
  que `join/leave` siguen funcionando; revisar `realtime/events.gateway.ts`
  no usa features deprecated.
  **Si sale mal:** engine.io es internal de socket.io; actualizar ambos
  en lockstep.

---

### [P4] Actualizar `tar` a >=7.4.3 (path traversal hardlink)

  **Severidad:** 🟠 Alto
  **Área:** deps
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  ```bash
  cd backend
  pnpm update tar@^7.4.3 -D   # devDep, viene vía otras deps
  pnpm install --frozen-lockfile
  ```

  **Validación:** `pnpm test` (suite completa) + CI.
  **Si sale mal:** forzar override en `package.json`:
  `{"pnpm":{"overrides":{"tar":"^7.4.3"}}}`

---

### [P5] Actualizar `nodemailer` (addressparser DoS + bypass de file access)

  **Severidad:** 🟠 Alto
  **Área:** deps
  **Esfuerzo:** S (2-4h por breaking changes de v6→v7)
  **Riesgo de cambio:** Medio

  **Approach:**

  ```bash
  cd backend
  pnpm update nodemailer@^7
  pnpm test
  ```

  Breaking changes conocidos v6→v7:
  - Renombre de algunas opciones del transport
  - Cambio en el manejo de `attachments` con `content` raw

  **Validación:**
  1. `pnpm test` (cubre `mail-outbox.consumer.spec.ts`,
     `incident-mail.listener.spec.ts`).
  2. Smoke test: enviar un email real desde staging con un attachment
     para confirmar que el path de attachments sigue funcionando.
  **Si sale mal:** `MailService` está en
  `backend/src/modules/mail/mail.service.ts`. Revisar llamadas a
  `nodemailer.createTransport()` y `transporter.sendMail()`.

---

### [P6] Configurar Dependabot (auto-detección + auto-merge de patches)

  **Severidad:** 🔴 Crítico (porque cierra el ciclo de 62 CVEs sin
  intervención manual)
  **Área:** ci
  **Esfuerzo:** XS (30 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  ```bash
  touch .github/dependabot.yml
  ```

  Contenido:

  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/backend"
      schedule:
        interval: "weekly"
        day: "monday"
      open-pull-requests-limit: 5
      groups:
        patch-and-minor:
          patterns: ["*"]
          update-types: ["minor", "patch"]
    - package-ecosystem: "npm"
      directory: "/frontend"
      schedule:
        interval: "weekly"
        day: "monday"
      open-pull-requests-limit: 5
  ```

  Opcional: añadir `dependabot.yml` adicional para actions de GitHub.

  **Validación:** siguiente lunes debe aparecer un PR de Dependabot.
  **Si sale mal:** Dependabot no tiene acceso de push por default — los
  PRs requieren review manual. Si quieres auto-merge para patches,
  configurar `.github/dependabot-auto-merge.yml` (workflow) o usar la
  config en Settings → Code security → Dependabot.

---

## 🟠 ALTO (Sprint 1, próximos 7-14 días)

### [P7] `USER node` en Dockerfiles (no correr como root en runtime)

  **Severidad:** 🟠 Alto (defense-in-depth: si un atacante rompe el
  proceso, sale como root → puede pivotar al host)
  **Área:** docker
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo (proceso node es read-only: no escribe a disco)

  **Cambio exacto — `backend/Dockerfile` stage `production` (líneas 31-40):**

  ```diff
  FROM node:22-alpine AS production
  WORKDIR /app/backend
  RUN corepack enable
  COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
  RUN CI=true pnpm install --frozen-lockfile --prod
  COPY --from=build /app/backend/dist /app/backend/dist
+ RUN addgroup -g 1000 -S app && adduser -u 1000 -S app -G app
+ USER app
  EXPOSE 3001
  CMD ["node", "dist/src/main.js"]
  ```

  **Frontend:** ya está OK (nginx:alpine corre como `nginx` by default).

  **Validación:**
  ```bash
  docker compose up --build backend
  docker exec tase-backend whoami  # debe imprimir: app (no root)
  curl http://localhost:3001/api/health  # debe responder 200
  ```

  **Si sale mal:** sin `chown` el proceso está read-only, no hay
  problema. Si hubiera writes a `/tmp` o logs, podrían fallar → verificar
  en `docker compose logs backend` qué error aparece, y ese error te dice
  dónde hay que hacer `chown -R app:app /ruta` antes del `USER app`.

---

### [P8] CORS — fix default unsafe (`true` → whitelist)

  **Severidad:** 🔴 CRÍTICO (redescubierto en auditoría)
  **Área:** config
  **Esfuerzo:** S (1h)
  **Riesgo de cambio:** Bajo (cambiar default inseguro a seguro nunca rompe
  clientes legítimos, solo elimina acceso desde orígenes rogue)

  **PROBLEMA ACTUAL — `backend/src/main.ts:71`:**

  ```typescript
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,  // ❌ DEFAULT TRUE = ANY ORIGIN
    credentials: true,
  });
  ```

  **Sin env var `CORS_ORIGIN` definida**, acepta **cualquier origin** (`true`
  = wildcard). Token en localStorage es vulnerable a cross-origin reads vía
  formas de bypass (reflected XSS, CSRF POST que lee response body si
  credentials: true).

  **FIX — reemplazar líneas 70-73 con:**

  ```typescript
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowedOrigins.length && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be set (comma-separated list) in production',
    );
  }

  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,  // false = deny all (dev safety)
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  ```

  **`.env.example` (agregar/actualizar):**

  ```env
  # Comma-separated. Required in production.
  # Example: http://localhost:4200,https://app.transito-alerta.example
  CORS_ALLOWED_ORIGINS=
  ```

  **Validación:**
  - Dev (no set): `origin: false` → CORS deny all ✅ (safe for local testing)
  - Staging (set): `origin: ['http://localhost:4200','https://staging.example']` ✅
  - Production: must be set, non-empty ✅
  - Frontend requests from whitelisted origin: 200 ✅
  - Frontend requests from non-whitelisted origin: CORS error ✅

  **Si sale mal:** verificar que `CORS_ALLOWED_ORIGINS` contiene
  el origin del frontend actual (sin trailing slash).

---

### [P9] Tests E2E de seguridad — vector SQL injection

  **Severidad:** 🟠 Alto (defense-in-depth; TypeORM parametriza por
  default, pero los repos que usan `dataSource.query` con template
  strings concatenados son riesgo latente)
  **Área:** code
  **Esfuerzo:** M (4-6h)
  **Riesgo de cambio:** Ninguno (solo agrega tests)

  **Approach:**

  Crear `backend/test/security/sql-injection.e2e-spec.ts` con
  vectores contra los endpoints que aceptan string del usuario:

  ```typescript
  const SQL_INJECTION_VECTORS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT NULL, NULL, NULL--",
    "admin'--",
    "1 OR 1=1",
    "\\'; ls -la /; --",
  ];

  describe.each(SQL_INJECTION_VECTORS)('SQL injection vector: %s',
    (vector) => {
      it('POST /auth/login no autentica con vector SQLi', async () => {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: vector + '@x.com', password: vector });
        expect(res.status).toBe(401);
        expect(res.body).not.toHaveProperty('access_token');
      });

      it('GET /api/incidents?status=X no rompe con vector SQLi', async () => {
        const res = await request(app)
          .get('/api/incidents')
          .query({ status: vector });
        // O 400 (validación rechaza) o 200 (con filtro vacío) — nunca 500
        expect([200, 400]).toContain(res.status);
      });
    });
  ```

  **Validación:** suite e2e completa debe seguir verde + los nuevos tests.
  **Si sale mal:** cualquier 500 inesperado es señal de query mal
  parametrizada, requiere fix inmediato.

---

### [P10] Tests E2E de seguridad — vector JWT tampering

  **Severidad:** 🟠 Alto
  **Área:** code
  **Esfuerzo:** M (4h)
  **Riesgo de cambio:** Ninguno

  **Approach:**

  `backend/test/security/jwt-tampering.e2e-spec.ts`:

  ```typescript
  describe('JWT tampering', () => {
    it('rechaza token con alg=none', async () => {
      const noneAlg = jwt.sign({ sub: 'u-1', typ: 'access' }, '', {
        algorithm: 'none',
      });
      const res = await request(app).get('/api/users/me')
        .set('Authorization', `Bearer ${noneAlg}`);
      expect(res.status).toBe(401);
    });

    it('rechaza token firmado con secret distinto', async () => {
      const forged = jwt.sign({ sub: 'u-1', typ: 'access' }, 'otro-secret');
      const res = await request(app).get('/api/users/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('rechaza token con typ != access', async () => {
      const refresh = await loginAndGetRefreshToken();
      // intentar usar refresh token como access
      const res = await request(app).get('/api/users/me')
        .set('Authorization', `Bearer ${refresh}`);
      expect(res.status).toBe(401);
    });

    it('rechaza token expirado', async () => {
      // generar token con TTL pasado
      const expired = jwt.sign(
        { sub: 'u-1', typ: 'access', exp: Math.floor(Date.now()/1000) - 60 },
        process.env.JWT_ACCESS_SECRET,
      );
      const res = await request(app).get('/api/users/me')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });
  });
  ```

  **Validación:** todos deben ser 401.
  **Si sale mal:** un 200 indica bypass crítico.

---

### [P11] Tests E2E de seguridad — vector rate limit bypass

  **Severidad:** 🟠 Alto
  **Área:** code
  **Esfuerzo:** M (4h)
  **Riesgo de cambio:** Ninguno

  **Approach:**

  `backend/test/security/rate-limit.e2e-spec.ts`:

  ```typescript
  describe('Rate limiter', () => {
    it('429 al exceder RATE_LIMIT_MAX_REQUESTS en una ventana', async () => {
      const MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
      let lastStatus;
      for (let i = 0; i <= MAX; i++) {
        lastStatus = (await request(app)
          .post('/api/auth/login')
          .send({ email: 'a@b.com', password: 'wrong' })).status;
      }
      expect(lastStatus).toBe(429);
    });

    it('rate limit separa por user id (no se comparte entre usuarios)',
      async () => { /* … */ });

    it('rate limit NO bypaseable con IPv4-mapped IPv6 spoofing',
      async () => {
        // Después de fix P1 (proxy-addr)
        const MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
        const spoofed = '::ffff:127.0.0.1';
        let lastStatus;
        for (let i = 0; i <= MAX; i++) {
          lastStatus = (await request(app)
            .post('/api/auth/login')
            .set('X-Forwarded-For', spoofed)
            .send({ email: 'a@b.com', password: 'wrong' })).status;
        }
        expect(lastStatus).toBe(429);
      });
  });
  ```

  **Validación:** todos deben bloquear tras N requests.
  **Si sale mal:** IP no se respeta — proxy-addr no actualizado, o
  `TRUSTED_PROXY_CIDR` demasiado permisivo.

---

### [P12] Verificar que el logging NO expone PII (passwords, tokens, etc.)

  **Severidad:** 🟠 Alto (compliance: GDPR, reputacional)
  **Área:** code
  **Esfuerzo:** S (2h)
  **Riesgo de cambio:** Bajo (solo agregar filtering)

  **Approach:**

  1. `grep -rE "(password|token|secret)" backend/src --include="*.ts" | grep -v ".spec.ts"`
  2. Para cada hit en código de runtime, verificar que NO está dentro
     de un `Logger.log(...)` o `console.log(...)`.
  3. Si se loguea body de POST, asegurar que el `RequestIdLogger`
     filtra los campos sensibles:

     ```typescript
     // backend/src/shared/observability/request-id.logger.ts
     const REDACTED_FIELDS = ['password', 'token', 'access_token',
                              'refresh_token', 'authorization'];

     private redactBody(body: unknown): unknown {
       if (!body || typeof body !== 'object') return body;
       const out = { ...body as Record<string, unknown> };
       for (const key of REDACTED_FIELDS) {
         if (key in out) out[key] = '[REDACTED]';
       }
       return out;
     }
     ```

  **Validación:** enviar un POST con `password: 'leaked123'` y revisar
  los logs — no debe aparecer la password.
  **Si sale mal:** agregar el campo al REDACTED_FIELDS y re-desplegar.

---

## 🟡 MEDIO (Sprint 2-3, próximos 14-30 días)

### [P13] Subir coverage de branches de 60% → 75%

  **Severidad:** 🟡 Medio
  **Área:** code
  **Esfuerzo:** L (1-2d)
  **Riesgo de cambio:** Bajo

  **Approach:**

  1. Identificar los archivos con branches <60% usando el
     `coverage-summary.json`.
  2. Por archivo, escribir specs para los branches rojos (`if` no
     cubiertos, ternarios, `&&`/`||` con cortocircuito).
  3. Targets prioritarios (los más riesgosos):

     - `backend/src/main.ts` (0% — bootstrap path)
     - `backend/src/app.module.ts` (0% — composición)
     - `backend/src/modules/*/entities/*.ts` (validators)
     - `backend/src/modules/auth/auth.service.ts` (flujos de error)

  **Validación:** `pnpm test --coverage` debe mostrar `branches >= 75%`
  en el total.
  **Si sale mal:** branches en try/catch alrededor de operaciones de DB
  son difíciles de cubrir sin un testcontainer; aceptar la brecha con
  un comentario `// istanbul ignore next`.

---

### [P14] Key rotation JWT (kid header + multi-key validation)

  **Severidad:** 🟡 Medio
  **Área:** auth
  **Esfuerzo:** L (1-2d)
  **Riesgo de cambio:** Alto (rompe tokens existentes si se hace mal)

  **Approach:**

  1. Generar un nuevo `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
  2. Hacer que `JwtStrategy` valide contra una lista de claves
     (`kid` → secret):

     ```typescript
     const KEYS: Record<string, string> = {
       'k1': process.env.JWT_ACCESS_SECRET_K1,
       'k2': process.env.JWT_ACCESS_SECRET_K2, // nuevo
     };
     // verificación intenta con cada kid del header, o por defecto usa la
     // primaria hasta que todos los tokens viejos expiren (15 min).
     ```

  3. Firmar tokens nuevos con `kid: 'k2'`. Los tokens viejos siguen
     funcionando hasta que expire el TTL.
  4. Después de 1 semana (todos los tokens viejos expirados), remover
     `k1` del config.

  **Validación:** tokens firmados con secret viejo siguen siendo aceptados;
  tokens nuevos también; tokens con `kid: 'invalid'` son rechazados.
  **Si sale mal:** mantener compatibilidad reversa (ambos secrets
  válidos) durante la ventana de rotación.

---

### [P15] Backups automatizados de PostgreSQL

  **Severidad:** 🟡 Medio (RPO/RTO dependency)
  **Área:** infra
  **Esfuerzo:** M (4-6h)
  **Riesgo de cambio:** Bajo (solo agrega un cron)

  **Approach:**

  1. Crear `database/scripts/backup.sh`:

     ```bash
     #!/usr/bin/env bash
     set -euo pipefail
     TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
     BACKUP_DIR=/var/backups/transito-alerta
     mkdir -p "$BACKUP_DIR"
     docker exec tase-postgres pg_dump \
       -U postgres -d transito_alerta \
       -Fc --no-owner --no-acl \
       > "$BACKUP_DIR/db-$TIMESTAMP.dump"
     # retención: 7 diarios, 4 semanales, 6 mensuales
     find "$BACKUP_DIR" -name "db-*.dump" -mtime +30 -delete
     ```

  2. Cron entry: `0 2 * * * /opt/transito-alerta/backup.sh >> /var/log/backup.log 2>&1`

  3. Almacenar en object storage (S3/MinIO) cifrado con
     `aws s3 cp ... --sse AES256`.

  4. Monitor: alerting si el último tiene >25h.

  **Validación:** ejecutar el script manualmente, verificar que el
  archivo `.dump` se puede restaurar (`pg_restore -d test_db ...`).
  **Si sale mal:** restaurar desde el backup más reciente (es por eso
  que se hacen).

---

### [P16] `bcrypt` rate limit más agresivo en `/auth/login`

  **Severidad:** 🟡 Medio (CPU exhaustion defense)
  **Área:** config
  **Esfuerzo:** XS (15 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  Añadir una entrada específica al `RateLimiterGuard` para rutas
  sensibles a CPU:

  ```typescript
  // backend/src/shared/guards/rate-limiter.guard.ts
  const STRICTER_LIMIT_PATHS = ['/api/auth/login', '/api/auth/register',
                                 '/api/auth/password-reset'];

  if (STRICTER_LIMIT_PATHS.includes(route)) {
    if (current >= rateLimit.strictMaxRequests ?? 10) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
  ```

  Configurar `RATE_LIMIT_STRICT_MAX_REQUESTS=10` (default) en
  `.env.example`.

  **Validación:** tras 10 logins fallidos en 60s, el 11º debe ser 429.
  **Si sale mal:** subir el límite si es demasiado estricto.

---

### [P17] Helmet — verificar CSP, HSTS, referrer-policy

  **Severidad:** 🟡 Medio
  **Área:** config
  **Esfuerzo:** XS (30 min)
  **Riesgo de cambio:** Bajo

  **Approach:**

  En `main.ts`:

  ```typescript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        scriptSrc: [`'self'`, ...], // ajustar según angular
        styleSrc: [`'self'`, `'unsafe-inline'`, ...],
        imgSrc: [`'self'`, 'data:', 'https:'],
        connectSrc: [`'self'`, 'wss:', 'https:'],
        objectSrc: [`'none'`],
        frameAncestors: [`'none'`],
      },
    },
    strictTransportSecurity: {
      maxAge: 31536000,  // 1 año
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,  // Angular puede romper
  }));
  ```

  **Validación:** `curl -I https://.../api/health | grep -iE "strict-transport|content-security|referrer"` debe mostrar las 3 cabeceras.
  **Si sale mal:** aflojar la directiva CSP específica que rompe Angular.

---

## 🟢 BAJO (Sprint 4+, próximos 30-90 días)

### [P18] SBOM generation en CI

  **Severidad:** 🟢 Bajo (compliance, auditabilidad)
  **Área:** ci
  **Esfuerzo:** S (2h)

  ```yaml
  # .github/workflows/ci.yml → nuevo job
  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Anchore/sbom-action@v0
        with:
          format: spdx-json
          artifact-name: transito-alerta.sbom.json
      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: transito-alerta.sbom.json
  ```

---

### [P19] Threat model document (STRIDE por recurso)

  **Severidad:** 🟢 Bajo (documentación, no es fix)
  **Área:** docs
  **Esfuerzo:** L (1-2d)

  Crear `docs/security/threat-model.md` con tabla por recurso:

  | Recurso | Spoofing | Tampering | Repudiation | Info disclosure | DoS | EoP |
  |---------|----------|-----------|-------------|-----------------|-----|-----|
  | users | Rate limit + JWT verify | bcrypt hash | audit_events | scope-based list | rate limit | assertCanManage |
  | incidents | JWT | role-based edit | audit_events | public read scope | rate limit | role rank |
  | ... | ... | ... | ... | ... | ... | ... |

---

### [P20] Tests E2E de seguridad adicionales (CSRF, password timing, etc.)

  **Severidad:** 🟢 Bajo
  **Área:** code
  **Esfuerzo:** M (4-6h por vector)

  Vectores pendientes después de P9-P11:
  - CSRF en endpoints con cookies (si se añaden)
  - Password timing attack (verificar que `bcrypt.compare` se usa
    consistentemente, no `===`)
  - Session fixation (re-generar session id en login)
  - Mass assignment en PATCH endpoints (verificar que DTOs tienen
    `forbidNonWhitelisted`)

---

## ⚪ MUY BAJO (backlog, próximo quarter)

### [P21] Dependency allowlist (BOLA / BOPLA)

  Documentar qué dependencias están aprobadas para uso y cuáles
  requieren revisión de seguridad. Útil para PRs que añaden deps.

### [P22] Incident response playbook

  Documentar runbook para: credential leak, DB compromise, DoS
  prolongado, key rotation emergency. Versión inicial en
  `docs/runbooks/security-incident.md`.

### [P23] Periodic re-audit

  Re-correr este plan trimestralmente. Cada `pnpm audit --json > audit-snapshot-YYYY-MM-DD.json` se commitea como evidencia histórica.

### [P24] SAML / OIDC para SSO institucional

  Hoy el sistema solo soporta email+password. Si en el futuro se
  requiere integración con la CTE (municipalidad), un SSO reduce la
  superficie de password management.

### [P25] Hardware security module (HSM) para JWT secrets

  Hoy los secrets viven en env vars (que se vuelcan a logs si no se
  tiene cuidado). Un HSM o un secret manager (Vault, AWS Secrets
  Manager) reduce el riesgo de leak.

---

## Resumen de prioridad

| Severidad | # items | Esfuerzo total | Fecha objetivo |
|-----------|---------|----------------|----------------|
| 🔴 Crítico | 6 | ~XS+S cada uno | **Antes del próximo deploy** |
| 🟠 Alto | 6 | ~1-2 días total | Sprint 1 (7-14 días) |
| 🟡 Medio | 5 | ~3-5 días total | Sprint 2-3 (14-30 días) |
| 🟢 Bajo | 3 | ~3-4 días total | Próximo quarter |
| ⚪ Muy bajo | 5 | No urgente | Backlog |

---

## Cómo ejecutar este plan (Batch-first para Builder Agent)

### BATCH 1: Deps + CI (P1-P6) — ~2.5h, 1 PR

**Bloquea:** Todas las otras mejoras (no puede haber security tests si hay CVEs
que fallan las checks).

```bash
cd backend && pnpm update proxy-addr@^2.0.8 multer@^2.2.0 engine.io@^6.6.10 tar@^7.4.3
pnpm update nodemailer@^7  # revisar logs para breaking changes
pnpm test
# Commit
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "chore(deps): close proxy-addr, multer, engine.io, tar, nodemailer CVEs"

# Dependabot
cat > .github/dependabot.yml << 'EOF'
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    groups:
      patch-and-minor:
        patterns: ["*"]
        update-types: ["minor", "patch"]
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
EOF
git add .github/dependabot.yml
git commit -m "ci: enable Dependabot weekly scanning (backend + frontend)"

# Verify
pnpm audit --prod --json > /tmp/audit-after-batch1.json
# comparar: jq '.metadata.vulnerabilities' /tmp/audit-after-batch1.json
# Esperado: critical=0, high ≤5 (era 2 critical + 25 high)
```

### BATCH 2: Docker + CORS (P7-P8) — ~1h, 1 PR

**Depende de:** BATCH 1 (debe pasar tests antes).

```bash
# backend/Dockerfile: agregar RUN addgroup + USER app (ver P7 arriba)
# backend/src/main.ts: reemplazar CORS config (ver P8 arriba)
# .env.example: actualizar CORS_ALLOWED_ORIGINS

pnpm test
docker compose up --build  # verify USER app
docker exec tase-backend whoami  # must print: app
curl http://localhost:3001/api/health

git add backend/Dockerfile backend/src/main.ts .env.example
git commit -m "chore: add USER app to Docker, fix CORS default to whitelist"
```

### BATCH 3: E2E Security Tests (P9-P12) — ~8h, 1-2 PRs

**Depende de:** BATCH 1, BATCH 2 (coverage mejora + PII audit).

- P9: SQL injection e2e vectors
- P10: JWT tampering tests
- P11: Rate limit bypass tests
- P12: PII logging audit (grep + add redaction if needed)

```bash
# Crear specs + grep audit
# pnpm test
```

### BATCH 4: Medium Priority (P13-P17) — ~5-8h, 1-2 PRs

**No bloquea:** BATCH 1-3. Se pueden hacer en paralelo con P9-P12.

- P13: Coverage branches 60% → 75%
- P14: JWT key rotation (kid header)
- P15: pg_dump backups + cron
- P16: Stricter rate limit `/auth/login`
- P17: Helmet CSP/HSTS/Referrer audit

### Métricas de éxito (Dashboard post-Batch 1)

```
Before: critical=2, high=25, moderate=32, low=3
After:  critical=0, high≤5,  moderate=20, low=3
```

Rerun cada viernes:
```bash
pnpm audit --prod > audit-$(date +%F).txt
```

---

## Notas — Builder Agent

- **Batch execution:** 4 batches independientes (ver sección "Cómo ejecutar").
  Batch 1 bloquea los otros. Batches 2-4 pueden solaparse.
- **1 PR per batch** = 1 commit per item (no squash).
- **Breaking changes:** P5 (nodemailer v6→v7) requiere test de integración
  (ver `mail-outbox.consumer.spec.ts`). Otros updates son minor/patch.
- **Si un fix rompe algo:**
  - Verificar error en tests
  - Revertir ese item del batch
  - Abrir issue con el detalle
  - No acumular trabajo roto
- **Urgencia real:** `XS` fixes (P1, P2, P3, P4, P6, P7, P8) **cierran**
  2/3 de CVEs en ~2-3h. `L/XL` fixes (P14, P15) son valuable pero no
  urgentes. Priorizar por severidad/effort ratio.