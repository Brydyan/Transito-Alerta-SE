# Security Audit — 2026-10-18

**Date:** 2026-10-18
**Status:** Analysis Report
**Target:** Backend (NestJS + TypeORM), Frontend (Angular), Infra (Docker), CI/CD
**Complexity:** Audit snapshot — no code changes

---

## Executive Summary

Snapshot del estado de seguridad y buenas prácticas del proyecto al 2026-10-18.
El proyecto tiene **bases sólidas** (authz bien modelada, SQL parametrizado,
secretos limpios, audit log presente) pero **está expuesto** por no actualizar
dependencias: **2 CVEs críticos** + **25 altos** + **32 moderados** + **3 bajos**.

Los critical/high no son problemas de diseño — son de mantenimiento. Un
`pnpm update` los cierra en horas. Las mejoras estructurales (CORS audit,
USER node en Docker, key rotation JWT, E2E security tests) son sprints de
baja/media intensidad que pagan en confianza operativa.

---

## Hallazgos críticos (acción inmediata)

### 1. `proxy-addr` — IP spoofing (CRITICAL)

```
Advisory:  GHSA-jqcg-44mw-7w3h
Severity:  CRITICAL
Package:   proxy-addr (>=1.1.0 <2.0.8)
Patched:   >=2.0.8
Path:      @nestjs/platform-express > express > proxy-addr
```

**Impacto:** El `RateLimiterGuard` (CC1) usa `request.ip` como identidad de
fallback para llamadas no autenticadas (POST /auth/login, GET /health).
Un atacante puede hacer spoofing de IP vía IPv4-mapped IPv6 en el trust
subnet, **bypaseando el rate limit por usuario**.

```typescript
// En RateLimiterGuard.resolveIdentity (backend/src/shared/guards/rate-limiter.guard.ts):
const userId = this.userIdFromToken(request.headers?.authorization);
if (userId) return `user:${userId}`;
// FALLBACK VULNERABLE: usa request.ip
```

**Fix:** `pnpm update proxy-addr@^2.0.8` (fuerza cascada en express /
@nestjs/platform-express).

### 2. `multer` — DoS por uploads incompletos (HIGH × 9 paths)

```
Patched:   >=2.1.0 (DoS cleanup) y >=2.2.0 (fileFilter race)
Path:      @nestjs/platform-express > multer (3 chains distintos)
```

**Impacto:** Atacante puede DoSear el backend enviando uploads parciales
que no se limpian. Aplica a `incident-images`, `comment-images`, `avatar`
controllers.

### 3. `engine.io` — Socket.IO Protocol Mismatch DoS (HIGH × 10)

```
Patched:   >=6.6.10
```

**Impacto:** DoS en WebSocket gateway (`realtime/events.gateway.ts`).

### 4. `nodemailer` — DoS + bypass de file/url access (HIGH × 5)

```
Patched:   >=7.0.0 (recomendado saltar major)
```

**Impacto:** El `mail-outbox.consumer` procesa emails. Quadratic-time
`addressparser` permite DoS con BCCs crafted.

### 5. `tar` — Hardlink path traversal (HIGH × 9)

```
Patched:   >=7.4.3
```

**Impacto:** Varias dependencias usan `tar`; path traversal durante install
de packages.

---

## Lo que está BIEN (no tocar)

### Autenticación y autorización

- ✅ **JWT dual** (access 15min + refresh 7d) con secrets separados.
- ✅ **bcrypt** con cost configurable (default 12), password min 12 chars.
- ✅ **SubjectScope** discriminated union (admin_org/org/global/department)
  — previene el bug GeoReporta de mezclar scope con role string.
- ✅ **RateLimiterGuard** con sliding-minute, **verifica firma del JWT antes
  de usar `sub`** (anti-forgery de identidad).
- ✅ **Session revocation** denylist en Redis (`revocation-cache`).
- ✅ **PermissionGuard** + `@RequirePermission` decorator — 39 controllers
  con guards declarados.
- ✅ **assertCanManage** + **assertCanInvite** + **isVisibleUnderScope** con
  case `'department'` (recién añadido en commit `9e94d132c`).
- ✅ **Timing-safe comparison** para tokens (`timingSafeEqualHex`).

### Secretos y config

- ✅ **Cero secretos hardcoded** en código fuente (los `'secret1234567'`
  que aparecen son fixtures de tests).
- ✅ **JWT secrets tienen default `'dev-...-change-me'`** como alarma
  visible — no se usan en producción.
- ✅ **`.env.example` con `changeme` explícito** + `.env` ignorado en
  `.gitignore`.
- ✅ **`.env` en 3 ubicaciones** (raíz, `backend/`, `database/seeds/`) —
  TODAS en `.gitignore`.

### Validación de input

- ✅ **100% queries parametrizadas** (`$1, $2, ...` con array params) —
  verificado en los 8 repos que usan `dataSource.query`.
- ✅ **ValidationPipe global** en `main.ts`.
- ✅ **class-validator** en todos los DTOs.

### Logging / Audit

- ✅ **AuditService** con tabla `audit_events` (actor_id SET NULL post-
  delete — GDPR-compliant).
- ✅ **17 archivos** referencian `auditService.record` (cobertura amplia).
- ✅ **`console.log` solo 2 ocurrencias** (main.ts) — usan NestJS Logger
  con RequestId.
- ✅ **Sentry** condicional via `SENTRY_DSN` env (tracesSampleRate 0.2
  prod, 1.0 dev).

### Seguridad HTTP

- ✅ **helmet** habilitado (CSP, HSTS, frame-options).
- ✅ **ValidationPipe** con whitelist + `forbidNonWhitelisted`.
- ✅ **SnakeCase response interceptor** para consistencia.

### Docker

- ✅ **Multi-stage builds** (deps → build → production).
- ✅ **`pnpm install --frozen-lockfile`** (builds reproducibles).
- ✅ **`--prod`** en el runtime stage (no devDeps).
- ✅ **`node:22-alpine`** + **`nginx:alpine`** (imágenes ligeras).
- ✅ **Frontend bundleado en imagen** (no requiere node en runtime).

### CI/CD

- ✅ **Secrets en `${{ secrets.* }}`** (no plaintext en YAML).
- ✅ **`actionlint`** gate de workflows.
- ✅ **Path filter** evita CI innecesario en PRs docs-only.
- ✅ **Concurrency group** cancela runs obsoletos.
- ✅ **Cutover nightly** (cron 02:00 UTC) detecta regresiones.

---

## Áreas a mejorar (no críticas)

### A. Docker — ejecución como root

```dockerfile
# backend/Dockerfile (stage 'production'):
CMD ["node", "dist/src/main.js"]
# FALTA: USER node
```

**Recomendación:** Agregar `USER node` (uid 1000) antes del `CMD` en ambos
Dockerfiles. Si algún archivo requiere escritura (logs, tmp), ajustar
ownership en stage de build.

### B. CORS — sin documentar

Verificar `app.enableCors(...)` en `main.ts` con origen específico. Si
está en `*`, es vector de fuga de tokens vía cross-origin reads.

### C. Dependency scanning automatizado — AUSENTE

No hay `.github/dependabot.yml` ni `renovate.json`. Las 62 vulnerabilidades
se acumulan silenciosamente. **Recomendación:** añadir Dependabot con
auto-merge para patch updates.

### D. Coverage de branches — 60%

| Tipo | % |
|------|---|
| Lines | 78.27% |
| Statements | 72.00% |
| Functions | 69.88% |
| **Branches** | **60.23%** |

Los branches son el indicador más relevante para seguridad (cubren caminos
de error, validaciones, asserts). **Gap principal:** `app.module.ts` (0%),
`main.ts` (0%), varios `*.module.ts` y DTOs.

### E. Tests E2E — solo 1 archivo

```
test/e2e/invitations-repository.e2e-spec.ts
```

Para un proyecto de civic infra, esperaríamos al menos:

- Auth flows (login brute-force, JWT tampering)
- SQL injection fuzzing
- CSRF sobre cookies de sesión
- Rate limit bypass attempts

### F. Backups

No hay scripts ni cron de `pg_dump` versionados en el repo. Si la BD se
borra hoy, no hay red de seguridad documentada.

### G. Logging de PII

El `RequestIdLogger` loguea request/response. **Pendiente verificar:**

- ¿Se loguea el body de `POST /auth/login` (passwords en logs)?
- ¿Se loguea contenido de comments / incidents?

### H. JWKS / Key rotation

Los JWT secrets están en env vars estáticas. No hay mecanismo documentado
de rotación de claves (kid header, multi-secret validation). Si un secret
se compromete, hay que reiniciar todo.

### I. Timeout de bcrypt — denegación por DoS

```typescript
// password-hasher.ts: cost 12 default
```

Login con password incorrecto tarda ~250ms (bcrypt cost 12). Si hay 100 RPS
al endpoint `/auth/login` (poco probable dado el rate limit), son 25s de CPU
por segundo → CPU saturation. **Recomendación:** considerar rate limit más
agresivo en `/auth/login` (10 RPS vs 100 global).

### J. Headers de seguridad específicos

Verificar `helmet` configuration para:

- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Content-Security-Policy`

---

## Plan de remediación priorizado

### 🔴 Sprint 0 (esta semana)

1. **`pnpm update proxy-addr`** → forzar cascada.

   ```bash
   cd backend && pnpm update proxy-addr@^2.0.8
   pnpm test # verificar que ningún test rompe
   ```

2. **`pnpm update multer engine.io tar nodemailer`** en lote.

   ```bash
   pnpm update multer@^2.2.0 engine.io@^6.6.10 tar@^7.4.3
   pnpm update nodemailer@^7   # requiere revisar breaking changes
   ```

3. **Agregar Dependabot** — crear `.github/dependabot.yml`:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/backend"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 5
     - package-ecosystem: "npm"
       directory: "/frontend"
       schedule:
         interval: "weekly"
   ```

4. **Renovar `pnpm-lock.yaml`** después de los updates, commit + push.

### 🟡 Sprint 1 (próximas 2 semanas)

5. **`USER node` en Dockerfiles** (backend + frontend + migrations).
6. **Auditar CORS** en `main.ts` — whitelist de origins explícita.
7. **Tests E2E de seguridad**:
   - SQL injection fuzzing (al menos 5 vectores)
   - JWT tampering (alg=none, signature removal)
   - Rate limit bypass attempts
8. **Verificar logging no expone PII** — `grep "body.*password|body.*token"`.
9. **Subir coverage de branches a 75%+** — enfocarse en `*.module.ts` y DTOs.

### 🟢 Sprint 2 (mes siguiente)

10. **Key rotation JWT** — agregar `kid` header, validar contra lista de keys.
11. **Backups automatizados** — script `pg_dump` + cron + monitor.
12. **Security headers audit** — verificar `helmet` config.
13. **Threat model document** — STRIDE-style para roles/columns/scope.
14. **SBOM generation** — `pnpm audit --json > sbom.json` en CI.

---

## Métricas de seguimiento

| Métrica | Hoy (2026-10-18) | Meta Q1 |
|---------|------------------|---------|
| Critical CVEs | 2 | 0 |
| High CVEs | 25 | ≤3 |
| Coverage branches | 60.23% | ≥75% |
| E2E security tests | 0 | ≥5 vectores |
| Auto-merge Dependabot | ❌ | ✅ para patch |
| `USER node` en Docker | ❌ | ✅ |
| CORS whitelist explícito | ❓ | ✅ documentado |

---

## Evidencia de respaldo

| Hallazgo | Archivo de evidencia |
|----------|----------------------|
| 62 vulns deps | `pnpm audit --prod --json` (snapshot al 2026-10-18) |
| SQL parametrizado | `grep dataSource.query\(` → 8 repos con `$1, $2` |
| RateLimiter | `backend/src/shared/guards/rate-limiter.guard.ts` |
| JWT defaults | `backend/src/config/auth.config.ts:108-109` |
| SubjectScope | `backend/src/shared/authz/subject-scope.ts` (recién extendido) |
| Audit coverage | 17 archivos con `auditService.record` |
| Multi-stage Docker | `backend/Dockerfile`, `frontend/Dockerfile` |
| CI secrets | `.github/workflows/deploy-staging.yml` (usa `${{ secrets.* }}`) |
| Coverage JSONL | `backend/coverage/coverage-summary.json` |
| 135 specs verdes | `npx jest` → 1501 passed / 12 skipped |

---

## Notas

- Este es un snapshot. Los números de vulnerabilidades cambian con cada
  `pnpm audit` — re-ejecutar después de cada Sprint para medir progreso.
- El Sprint 0 (4 tareas) puede completarse en <1 día de trabajo si las
  major versions de `nodemailer` no introducen breaking changes que
  afecten a `MailService`.
- Los hallazgos `C-J` no son urgent security issues pero son deuda que
  crece con el tiempo. Es mejor atacarlos en sprints dedicados que
  mezclarlos con feature work.