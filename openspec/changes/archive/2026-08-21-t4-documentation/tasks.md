# Tasks: T4.4 Documentación — Swagger + Runbook

**Change**: t4-documentation  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  
**Artifact store**: openspec  
**Strict TDD**: activo — pero T4.4 es mayormente docs/config, no lógica de negocio  
**Working dir**: `backend/` para Fase 1; repo root para Fase 2  
**Test commands**: `pnpm test` | `pnpm run test:e2e` | `pnpm run build`  

Baseline a preservar:
- `pnpm test` → 77 suites / 714 tests passing
- `pnpm run test:e2e` → 15 suites / 138 tests passing
- `pnpm run typecheck` → 0 errores
- `pnpm run lint` → 0 errores, 16 warnings pre-existentes

Leer `openspec/changes/t4-documentation/design.md` ANTES de tocar código.

---

## Fase 0 — Verificación del baseline

- [x] **T0.1** `pnpm test` desde `backend/` → confirmar 77 suites, 714 tests
- [x] **T0.2** `pnpm run test:e2e` desde `backend/` → confirmar 15 suites, 138 tests
- [x] **T0.3** Verificar que `helmet` ya está en `package.json` (T4.3 completada)

---

## Fase 1 — T4.4a: Swagger en main.ts

- [x] **T1.1** Instalar paquetes desde `backend/`:
  ```bash
  pnpm add @nestjs/swagger swagger-ui-express
  ```

- [x] **T1.2** Verificar que `package.json` incluye `"@nestjs/swagger"` y `"swagger-ui-express"` en `dependencies`

- [x] **T1.3** En `backend/src/main.ts`, agregar import de Swagger **junto a los imports existentes de NestJS** (no después de los de la app):
  ```typescript
  import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
  ```

- [x] **T1.4** En `bootstrap()`, agregar el bloque Swagger **después de** `app.useGlobalInterceptors(...)` y **antes de** `const port = ...`:
  ```typescript
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Transito Alerta SE — API')
      .setDescription('Backend NestJS — migración GeoReporta')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
  ```

  > **Nota sobre el guard**: el design.md propone `!== 'production' && !== 'test'`.
  > Esto asegura que Swagger solo aparece en `development` local.
  > En CI (`NODE_ENV=test`) y producción (`NODE_ENV=production`) la ruta no existe.

- [x] **T1.5** `pnpm run typecheck` → 0 errores
- [x] **T1.6** `pnpm run lint` → 0 errores adicionales
- [x] **T1.7** `pnpm run build` → compilación limpia

- [ ] **T1.8** Verificación manual (no automatizada):
  ```bash
  # En terminal separada, desde backend/:
  NODE_ENV=development pnpm run start:dev
  # En otro terminal:
  curl -s http://localhost:3001/api/docs -o /dev/null -w "%{http_code}"
  # Esperado: 301 (redirect a /api/docs/) o 200
  ```

- [x] **T1.9** `pnpm run test:e2e` → 15 suites, 138 tests, sin regresiones
  (Swagger no activo en NODE_ENV=test → los tests existentes no ven /api/docs)

---

## Fase 2 — T4.4b: Runbook de despliegue

Archivo Markdown puro. Sin cambios de código. Crear desde repo root.

- [x] **T2.1** Crear directorio si no existe:
  ```bash
  mkdir -p docs/runbooks
  ```

- [x] **T2.2** Crear `docs/runbooks/deploy.md` con el contenido completo:

```markdown
# Runbook de Despliegue — Transito Alerta SE Backend

## Pre-requisitos

- Supabase project con extensión PostGIS habilitada (`CREATE EXTENSION postgis`)
- Redis accesible (Upstash / AWS ElastiCache / Railway Redis)
- Variables de entorno configuradas (ver tabla abajo)
- Node.js 22+, pnpm 9+

## Proceso de Despliegue (CC3 — migraciones manuales)

⚠️ **Las migraciones NUNCA se aplican automáticamente** (`synchronize: false`).
Deben ejecutarse a mano en el editor SQL de Supabase, en orden numérico.

### Paso 1 — Verificar estado de migraciones

Abrir `database/MIGRATION_LOG.md`. Todas las filas deben estar `✅ Applied`.
Si alguna dice `⏳ Pending`, aplicarla antes de continuar.

### Paso 2 — Aplicar migraciones pendientes (si las hay)

Para cada migración en `⏳ Pending`, en orden numérico:
1. Abrir Supabase → SQL Editor
2. Copiar el contenido de `database/migrations/NNNN_nombre.sql`
3. Ejecutar
4. Verificar que no hay errores
5. Actualizar `database/MIGRATION_LOG.md`: cambiar `⏳ Pending` → `✅ Applied` con fecha y ambiente

Verificar que existe rollback para cada migración nueva:
```
database/rollback/NNNN_nombre.DOWN.sql
```

### Paso 3 — Deploy del servicio

Plataforma dependiente. Pasos comunes:
```bash
# Desde backend/
pnpm install --frozen-lockfile
pnpm run build
pnpm run start:prod
```

Variables de entorno requeridas en la plataforma de deploy (ver tabla abajo).

### Paso 4 — Health check

```bash
curl -s https://TU_DOMINIO/api/health
# Esperado: {"status":"ok"} con HTTP 200
```

### Paso 5 — Smoke tests

```bash
BASE_URL="https://TU_DOMINIO"

# 1. Health
curl -s $BASE_URL/api/health | jq .

# 2. Login anónimo (device_uuid identity)
DEVICE_UUID=$(uuidgen)
TOKENS=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"device_uuid\": \"$DEVICE_UUID\"}")
echo $TOKENS | jq .
ACCESS_TOKEN=$(echo $TOKENS | jq -r '.access_token')

# 3. Listar incidentes (acceso público)
curl -s $BASE_URL/api/incidents \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq 'length'
# Esperado: número >= 0 (array, no error)

# 4. Verificar headers de seguridad (helmet)
curl -sI $BASE_URL/api/health | grep -i "x-frame-options\|x-content-type"
# Esperado: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff
```

## Rollback

Si algo falla post-deploy:

1. Aplicar rollback de migraciones (en orden inverso de las aplicadas):
   ```
   # En Supabase SQL Editor:
   database/rollback/NNNN_nombre.DOWN.sql
   ```
2. Actualizar `database/MIGRATION_LOG.md` → `❌ Rolled back`
3. Hacer rollback del servicio a la versión anterior en la plataforma de deploy

## Variables de Entorno

### Obligatorias en producción

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `JWT_ACCESS_SECRET` | Secreto para firmar access tokens (**cambiar el default inseguro**) | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Secreto para firmar refresh tokens (**cambiar el default inseguro**) | `openssl rand -hex 32` |
| `DATABASE_URL` | Connection string PostgreSQL (Supabase Transaction Pooler port 6543) | `postgresql://postgres.[ref]:[pass]@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `REDIS_URL` | URL de Redis | `redis://default:[pass]@[host]:6379` |
| `NODE_ENV` | Entorno (`production`) | `production` |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma | `https://app.transito-alerta.example` |

### Obligatorias para Mail (si se usa el módulo Mail)

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SMTP_HOST` | Host SMTP | — (mail deshabilitado si ausente) |
| `SMTP_USER` | Usuario SMTP | — |
| `SMTP_PASSWORD` | Contraseña SMTP | — |
| `SMTP_FROM` | Dirección remitente | `no-reply@transito-alerta.example` |
| `FRONTEND_BASE_URL` | URL del frontend (links en emails) | `http://localhost:3000` |

### Opcionales con defaults

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3001` | Puerto HTTP del servidor |
| `SENTRY_DSN` | — | DSN de Sentry (error tracking, opcional) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | TTL del access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | TTL del refresh token |
| `PERMISSION_CACHE_TTL_SECONDS` | `300` | TTL caché de permisos en Redis (5 min) |
| `SESSION_REFRESH_GRACE_SECONDS` | `30` | Ventana de gracia para rotación de refresh token |
| `REDIS_CACHE_DB` | `1` | Base de datos Redis para cache-manager |
| `REDIS_STREAMS_DB` | `0` | Base de datos Redis para Streams / Pub-Sub |
| `REDIS_PASSWORD` | — | Contraseña Redis (si REDIS_URL no la incluye) |
| `DB_SSL` | `false` | `true` para TLS en conexión PostgreSQL (requerido en Supabase) |
| `DB_LOGGING` | `false` | `true` para loggear queries SQL (solo desarrollo) |
| `CACHE_TTL_SECONDS` | `300` | TTL general del caché de listas |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Ventana del rate limiter por usuario/IP |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests máximos por ventana por usuario |
| `GEOFENCING_CACHE_TTL_SECONDS` | `3600` | TTL del caché de geofencing (1 hora) |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `MAIL_SWEEP_INTERVAL_MS` | `5000` | Intervalo del sweeper de mail outbox |
| `MAIL_CLAIM_IDLE_MS` | `30000` | Idle antes de reclamar mensaje de mail en Streams |

## Notas de seguridad

- **`JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`**: los defaults en el código son
  `dev-access-secret-change-me` y `dev-refresh-secret-change-me`. Si se despliega
  sin cambiarlos, cualquier persona que lea el código fuente puede forjar tokens válidos.
  Generar con `openssl rand -hex 32`.
- **Swagger UI**: solo activo en `NODE_ENV=development`. En producción (`NODE_ENV=production`)
  la ruta `/api/docs` no existe.
- **`DB_LOGGING=true`**: puede loggear datos sensibles en producción. Usar solo para debugging.
```

- [x] **T2.3** Verificar que el archivo existe y tiene las secciones requeridas:
  ```bash
  grep -c "^## " docs/runbooks/deploy.md
  # Esperado: >= 5 secciones (Pre-requisitos, Proceso, Rollback, Variables, Seguridad)
  ```

---

## Fase 3 — Verificación final

- [x] **T3.1** `pnpm run lint` desde `backend/` → 0 errores adicionales a los 16 warnings pre-existentes
- [x] **T3.2** `pnpm run typecheck` desde `backend/` → 0 errores
- [x] **T3.3** `pnpm run build` desde `backend/` → compilación limpia
- [x] **T3.4** `pnpm test` desde `backend/` → 77 suites / 714 tests (sin cambio)
- [x] **T3.5** `pnpm run test:e2e` desde `backend/` → 15 suites / 138 tests (sin cambio)
- [x] **T3.6** `docs/runbooks/deploy.md` existe y tiene contenido

---

## Al terminar

Dejar `openspec/changes/t4-documentation/apply-progress.md` con:
- Lista de tareas completadas
- Confirmación del resultado del build
- Conteo de tests (debe coincidir con baseline)
- Status: `READY FOR VERIFY`

Avisar al humano para que dispare `sdd-verify`.
