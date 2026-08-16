# 7: Pipeline de Despliegue y CI/CD

## Flujo de Trabajo GitHub Actions

### Trabajo Backend
**Trigger**: PR en `main`, push en `main`  
**Pasos**:
1. Checkout código, setup Node 22, pnpm
2. Instalar dependencias (`pnpm install`)
3. Lint (`pnpm run lint`) → falla si @typescript-eslint/no-floating-promises o vars no usadas
4. Type check (`pnpm run typecheck`)
5. Build (`pnpm run build`)
6. Ejecutar pruebas (`pnpm run test -- --testPathIgnorePatterns=e2e`) → falla si alguna prueba falla o cobertura < 70%
7. Ejecutar migrations lint (`database/scripts/validate-migrations.ts`) → verificar sintaxis SQL, sin versiones downgraded

### Trabajo Frontend
**Pasos**:
1. Lint (`npm run lint`, `npm run lint:fix`)
2. Verificación de formato (`npm run format`)
3. Build (`npm run build`)
4. Ejecutar unit tests (`npm run test:unit`)
5. Ejecutar e2e tests (`npm run test:e2e`) → Playwright contra backend de staging

### Trabajo Base de Datos (Opcional, Recomendado)
**Pasos**:
1. Validar sintaxis de migración (archivos `.sql` solo, sin procedures)
2. Verificar operaciones no seguras (DROP TABLE en non-rollback, DELETE directo sin WHERE)
3. Verificar archivo rollback existe para cada migración

## Build Multi-Stage en Docker

### Backend
```dockerfile
# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/ .
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY backend/src/modules/*/templates ./dist/modules/
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### Frontend
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

## Ejecutor Manual de Migraciones de Base de Datos (CI)

**Script**: `backend/scripts/run-migrations.ts`
```typescript
// Lee archivos database/migrations/*.sql en orden (0001, 0002, ...)
// Aplica cada uno si no ya aplicado (rastreado en tabla schema_migrations)
// En error: rollback y salida (estricto)
// Usado en:
// 1. Dev local: pnpm run db:migrate
// 2. Docker Compose startup: entry.sh llama run-migrations antes de boot de app
// 3. Supabase CI: copy-paste manual de SQL desde dashboard (o CLI si auto-apply habilitado)
```

## Entorno de Staging

**Infraestructura**:
- Backend NestJS (containerizado, 2 replicas)
- PostgreSQL 16 + PostGIS 3.4 (Supabase administrada)
- Redis 7 (AWS Elasticache o Supabase administrada)
- Proxy inverso Nginx (terminación TLS, gzip)

**Checklist Pre-Staging**:
- [ ] Aplicar migraciones pendientes (0009, 0010, etc.) a staging de Supabase
- [ ] Verificar extensión PostGIS habilitada (`SELECT postgis_version();`)
- [ ] Ejecutar health check: `GET /api/health` → 200
- [ ] Ejecutar smoke test: POST /api/auth/login → JWT issuado
- [ ] Ejecutar suite E2E contra staging
- [ ] Load test: 100 usuarios concurrentes, p95 < 500ms

## Despliegue en Producción

### Estrategia Blue-Green
1. **Blue** (actual): NestJS v1 en producción
2. **Green** (nuevo): NestJS v2 desplegado, calentando
3. **Switch**: Actualizar load balancer para apuntar a Green
4. **Rollback**: Si errores, cambiar de vuelta a Blue (< 5 min downtime posible)

### Pasos de Despliegue
1. Tagear release en git (v0.1.0, v0.2.0, etc.)
2. Docker image built + pushed a registry (`nestjs-app:v0.1.0`)
3. Aplicar migraciones a BD de producción (downtime: 5 min)
4. Boot cluster de contenedor NestJS v2
5. Health checks pasen (todos los 5 replicas arriba, `/api/health` 200)
6. Switch load balancer: Blue → Green
7. Monitorear tasa de error (objetivo: sin nuevos 5xx durante 1 hora)
8. Si errores > 5%: rollback a Blue, investigar

### Monitoreo Post-Despliegue
- [ ] Tasa de error < 0.5% (latencia p95 < 200ms)
- [ ] Conexiones WebSocket estables (5k por instancia esperada)
- [ ] Latencia de consulta de BD p95 < 50ms
- [ ] Tasa de hit de caché > 80% para búsquedas de permisos
- [ ] Tasa de creación de incident sostenida (objetivo 1k/min)

## Configuración Específica de Supabase

### Setup de Una Sola Vez
1. Crear proyecto (PostgreSQL 16, PostGIS 3.4)
2. Crear secretos `.env`:
   - `DATABASE_URL`: postgres://user:password@host:5432/db
   - `REDIS_URL`: redis://host:6379
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
3. Habilitar PostGIS: `CREATE EXTENSION postgis;`
4. Crear tabla `schema_migrations`:
   ```sql
   CREATE TABLE schema_migrations (
     version INT PRIMARY KEY,
     name VARCHAR(255),
     applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

### Despliegue de Migración
**Opción A** (Manual, más seguro):
1. Leer archivo SQL de migración
2. Copy-paste a editor SQL de Supabase
3. Ejecutar
4. Verificar éxito

**Opción B** (Automatizado, si disponible):
1. Usar Supabase CLI: `supabase db push`
2. Maneja versioning de migración automáticamente

## Procedimiento de Rollback

**Si Producción Falla Post-Despliegue**:
1. Cambiar load balancer de vuelta a Blue (< 1 min)
2. Investigar error logs de Green (mantenidos 1 hora post-switch)
3. Arreglaar bug en código o BD
4. Re-desplegar Green con fix (o desplegar nueva versión)
5. Testear staging completamente antes de segundo intento en producción

**Si Migración de BD Falla**:
1. Restaurar Supabase desde backup point-in-time (disponible hasta 7 días atrás)
2. Rollback: Aplicar script DOWN para migración fallida
3. Reintentar migración después del code fix

## Criterios de Éxito

- [ ] GitHub Actions CI pasa en cada PR
- [ ] Entorno de staging completamente automatizado (aplicar migraciones, boot app)
- [ ] Switchover de load balancer < 5 min (< 1 min downtime)
- [ ] Rollback probado (código y BD)
- [ ] Alertas de monitoreo configuradas (tasa de error, latencia, drops de WebSocket)
