# Design: T4.4 Documentación — Swagger + Runbook

**Change**: t4-documentation  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  

---

## D1 — T4.4a: Swagger setup mínimo en main.ts

### Dependencia de paquete

```bash
pnpm add @nestjs/swagger swagger-ui-express
```

`@nestjs/swagger` es el adaptador oficial para NestJS sobre `swagger-ui-express`.
Versión compatible con NestJS 10: `@nestjs/swagger@^7`.

### Posición en bootstrap()

Agregar **después de** `app.useGlobalInterceptors(...)` y **antes de** `app.listen(port)`.
Guard `NODE_ENV !== 'production'` — la UI de Swagger no debe exponerse en producción
(superficie de ataque, leak de contratos internos):

```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// dentro de bootstrap(), justo antes de app.listen(port):
if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder()
    .setTitle('Transito Alerta SE — API')
    .setDescription('Backend NestJS — migración GeoReporta')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
```

### Estado esperado de la UI

Sin decoradores `@ApiProperty` ni `@ApiOperation`, Swagger infiere los endpoints
desde los decoradores de NestJS (`@Get`, `@Post`, `@Body`, etc.) y los lista en la UI.
Los schemas de body/response aparecerán vacíos o como `{}` hasta que se agreguen
decoradores de forma incremental. Esto es aceptable para la entrega de T4.4a.

### Ruta

- Local: `http://localhost:3001/api/docs`
- Producción: ruta no existe (guard `NODE_ENV !== 'production'`)

### Impacto en test-environment.ts

El harness de Testcontainers NO necesita cambio — `NODE_ENV` en tests es `test`,
no `production`, así que Swagger quedaría activo en CI también. Para evitar que
el harness arranque Swagger innecesariamente en E2E, el guard puede ampliarse:

```typescript
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
```

Esto asegura que Swagger solo aparece en `development` (local con `NODE_ENV=development`
o sin NODE_ENV seteado).

---

## D2 — T4.4b: Runbook de despliegue

**Ruta**: `docs/runbooks/deploy.md`  
Documento Markdown puro. Sin cambios de código.

### Env vars completas (extraídas de `backend/src/config/`)

#### Obligatorias en producción

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `JWT_ACCESS_SECRET` | Secreto para firmar access tokens (⚠️ el default `dev-access-secret-change-me` es inseguro) | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Secreto para firmar refresh tokens (⚠️ inseguro por default) | `openssl rand -hex 32` |
| `DATABASE_URL` | Connection string PostgreSQL — Supabase Transaction Pooler (port 6543) | `postgresql://postgres.[ref]:[pass]@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `REDIS_URL` | URL de Redis (Upstash / ElastiCache / Railway) | `redis://default:[pass]@[host]:6379` |

#### Obligatorias para Mail

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SMTP_HOST` | Host SMTP | — (mail deshabilitado si ausente) |
| `SMTP_USER` | Usuario SMTP | — |
| `SMTP_PASSWORD` | Contraseña SMTP | — |
| `SMTP_FROM` | Dirección remitente | `no-reply@transito-alerta.example` |
| `FRONTEND_BASE_URL` | URL del frontend (para links en emails de invitación) | `http://localhost:3000` |

#### Opcionales con defaults seguros

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3001` | Puerto del servidor HTTP |
| `NODE_ENV` | `development` | Entorno (`development` / `production` / `test`) |
| `CORS_ORIGIN` | `*` (all) | Orígenes permitidos, separados por coma |
| `SENTRY_DSN` | — (disabled) | DSN de Sentry para error tracking |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | TTL del access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | TTL del refresh token |
| `PERMISSION_CACHE_TTL_SECONDS` | `300` | TTL del caché de permisos en Redis |
| `SESSION_REFRESH_GRACE_SECONDS` | `30` | Ventana de gracia para rotación de refresh token |

#### Opcionales de Redis (alternativa a REDIS_URL)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Host Redis (si no se usa REDIS_URL) |
| `REDIS_PORT` | `6379` | Puerto Redis |
| `REDIS_PASSWORD` | — | Contraseña Redis |
| `REDIS_CACHE_DB` | `1` | DB de Redis para cache-manager |
| `REDIS_STREAMS_DB` | `0` | DB de Redis para Streams / Pub-Sub |

#### Opcionales de DB (alternativa a DATABASE_URL)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Host PostgreSQL |
| `DB_PORT` | `5432` | Puerto PostgreSQL |
| `DB_USERNAME` | `postgres` | Usuario PostgreSQL |
| `DB_PASSWORD` | `postgres` | Contraseña PostgreSQL |
| `DB_NAME` | `transito_alerta` | Nombre de la base de datos |
| `DB_SSL` | `false` | `true` para habilitar SSL (requerido en Supabase) |
| `DB_LOGGING` | `false` | `true` para loggear queries SQL |

#### Opcionales de tunning

| Variable | Default | Descripción |
|----------|---------|-------------|
| `CACHE_TTL_SECONDS` | `300` | TTL general del caché de listas |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Ventana del rate limiter por usuario/IP |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Máximo de requests por ventana |
| `GEOFENCING_CACHE_TTL_SECONDS` | `3600` | TTL del caché de geofencing (1h) |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `MAIL_SWEEP_INTERVAL_MS` | `5000` | Intervalo del sweeper de mail outbox |
| `MAIL_CLAIM_IDLE_MS` | `30000` | Tiempo idle antes de reclamar mensaje de mail |

### Proceso de despliegue (CC3 — migraciones manuales)

Pasos críticos para el runbook:
1. Verificar `MIGRATION_LOG.md` — todas las filas `✅ Applied`
2. Aplicar migraciones pendientes (`⏳ Pending`) en Supabase SQL editor, orden numérico
3. Verificar rollback disponible para cada migración nueva
4. Deploy del servicio con las env vars configuradas
5. Health check: `GET /api/health` → 200
6. Smoke tests con curl

### Smoke tests con curl

```bash
# Health
curl -s https://api.transito-alerta.example/api/health | jq .

# Login con device_uuid (anonymous)
curl -s -X POST https://api.transito-alerta.example/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"device_uuid": "test-smoke-$(uuidgen)"}' | jq .

# Listar incidentes (público)
curl -s https://api.transito-alerta.example/api/incidents \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq 'length'
```

---

## D3 — Sin cambios en test-environment.ts para el runbook

`docs/runbooks/deploy.md` es un archivo Markdown puro. No toca código.
No requiere actualización del harness E2E ni nuevos tests.

---

## D4 — Tests requeridos para T4.4a

Solo un test mínimo para verificar que Swagger no rompe el build ni el arranque:

**No se requiere un test E2E de Swagger** — la UI es HTML servido por `swagger-ui-express`,
no una ruta de negocio. El criterio de aceptación es que:
- `pnpm run build` compila sin errores
- `GET /api/docs` retorna 200 en entorno `development` (verificable manualmente con curl)
- `NODE_ENV=test` → Swagger no activo → los tests E2E existentes no interfieren

Si se quiere automatizar la verificación, un test E2E mínimo en `health.e2e-spec.ts`
puede verificar que `/api/docs` devuelve 404 en `NODE_ENV=test` (o 200, según el guard elegido).
Esto es opcional — el build limpio ya prueba la integración del módulo.

---

## D5 — Archivos NO modificar

- `openspec/changes/t4-documentation/specs/**` — contrato de Architect
- `openspec/changes/t4-documentation/design.md` — este archivo
- `database/migrations/**` — sin migraciones en este change
- Cualquier controller/service/entity existente — Swagger es additive, no modifica lógica
