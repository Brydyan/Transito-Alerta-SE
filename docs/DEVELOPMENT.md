# 🛠️ Guía de Desarrollo Local — Tránsito Alerta SE

## Quick Start

Para configurar el entorno local de desarrollo en **2 pasos**:

```bash
# 1. Ejecutar el script de setup (primera vez: ~2-3 min, posteriores: ~30s)
./setup-local.sh

# 2. En dos terminales separadas:
# Terminal A:
cd backend && pnpm start:dev

# Terminal B:
cd frontend && pnpm start:dev
```

Accede a:
- **Frontend**: http://localhost:4200
- **Backend API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api

---

## 📋 Requisitos Previos

Asegúrate de tener instalado:

- **Docker + Docker Compose** — para postgres + redis
- **Node.js 20+** + **pnpm 11.x** — para backend + frontend
- **PostgreSQL client (psql)** — para ejecutar migraciones (opcional, pero recomendado)

```bash
# Verificar versiones
docker --version
docker-compose --version
node --version
pnpm --version
psql --version
```

---

## 🚀 Setup Completo Explicado

### Script Automático (Recomendado)

```bash
./setup-local.sh
```

Hace automáticamente:
1. ✅ Levanta postgres + redis en Docker
2. ✅ Aplica todas las migraciones (0001-0065)
3. ✅ Limpia el caché de menús en Redis
4. ✅ Seed de datos (usuarios, categorías, incidentes demo)
5. ✅ Muestra instrucciones para levantar el backend/frontend

### Manual (Si Prefieres Control Total)

```bash
# 1. Levanta contenedores
docker compose up -d postgres redis

# 2. Espera a que postgres esté listo
sleep 10

# 3. Aplica migraciones
for f in database/migrations/000*.sql; do
  echo "Applying $(basename $f)..."
  psql postgres://postgres:changeme@localhost:5432/transito_alerta < "$f"
done

# 4. Limpia caché de menús
docker exec tase-redis redis-cli DEL "menu:v1:*"

# 5. Seed de datos
cd backend && pnpm db:seed && cd ..

# 6. Levanta backend + frontend (en terminales separadas)
cd backend && pnpm start:dev
cd frontend && pnpm start:dev
```

---

## 📊 Acceso a la Base de Datos

### Vía psql

```bash
psql postgres://postgres:changeme@localhost:5432/transito_alerta

# Dentro de psql, ejemplos útiles:
\d                          -- Listar todas las tablas
\d menu_options             -- Describir una tabla
SELECT * FROM roles;        -- Query
\q                          -- Salir
```

### Vía Docker

```bash
docker exec -it tase-postgres psql -U postgres -d transito_alerta
```

### Configuración de Conexión

| Parámetro | Valor |
|-----------|-------|
| Host | localhost |
| Puerto | 5432 |
| Usuario | postgres |
| Contraseña | changeme |
| Base de datos | transito_alerta |

---

## 🔄 Migraciones

### Aplicar Nueva Migración

```bash
# 1. Crear archivo SQL en database/migrations/
# Nombre: 00NN_descripcion.sql (ej: 0066_nueva_tabla.sql)

# 2. Crear DOWN file (rollback)
# Nombre: database/rollback/00NN_descripcion.DOWN.sql

# 3. Aplicar manualmente o via script (próxima ejecución de setup-local.sh)
psql postgres://postgres:changeme@localhost:5432/transito_alerta < database/migrations/00NN_descripcion.sql
```

### Ver Estado de Migraciones

```bash
cd backend
pnpm db:migrate:status
```

### Rollback de Migración (Desarrollo Solo)

```bash
cd backend
pnpm db:rollback -- --down 0065
```

---

## 🌱 Seeds de Datos

### Correr Seeds Manualmente

```bash
cd backend

# Seed básico: usuarios + categorías + incidentes demo
pnpm db:seed

# Seed masivo: agrega 100+ incidentes para testing
pnpm db:seed:mass
```

### Archivos de Seed

| Archivo | Propósito |
|---------|-----------|
| `database/seeds/users.js` | Crea usuarios (admin, reporter, etc.) |
| `database/seeds/demo-incidents.js` | 10-20 incidentes de prueba |
| `database/seeds/volume-incidents.js` | 100+ incidentes para stress testing |
| `database/seeds/0003_seed_geo_zones.generated.sql` | Geozonas de Santa Elena |
| `database/seeds/0004_seed_parroquias.generated.sql` | Parroquias (OSM) |

---

## 🧹 Limpiar/Resetear Entorno

### Reseteo Completo (Pierde Todos los Datos)

```bash
# Detiene + elimina contenedores + borra volúmenes
docker compose down -v

# Levanta la BD desde cero
./setup-local.sh
```

### Limpiar Caché (Sin Borrar BD)

```bash
# Menús
docker exec tase-redis redis-cli DEL "menu:v1:*"

# Permisos
docker exec tase-redis redis-cli DEL "perm:v3:*"

# Todas las claves
docker exec tase-redis redis-cli FLUSHDB
```

### Detener Contenedores (Sin Borrar Datos)

```bash
docker compose down
# Datos persisten; reinicia con: docker compose up -d
```

---

## 🧪 Tests Locales

### Backend

```bash
cd backend

# Unit tests
pnpm test

# E2E tests (crea sus propios containers Testcontainers)
pnpm test:e2e

# E2E específico (categorías, por ejemplo)
pnpm test:e2e -- test/e2e/incident-categories.e2e-spec.ts

# Coverage
pnpm test:cov
```

### Frontend

```bash
cd frontend

# Tests unitarios
pnpm test

# E2E con Playwright (requiere build previo)
pnpm build
pnpm test:e2e
```

---

## 📝 Logs y Debugging

### Logs de Docker

```bash
# Postgres
docker logs -f tase-postgres

# Redis
docker logs -f tase-redis

# Migrations (if running in Docker)
docker logs -f tase-migrations
```

### Logs del Backend

```bash
cd backend && pnpm start:dev
# Logs aparecen en consola en tiempo real
```

### Logs del Frontend

```bash
cd frontend && pnpm start:dev
# Logs de webpack/vite aparecen en consola
```

### Debug con Inspector de Node

```bash
cd backend && pnpm start:debug
# Abre chrome://inspect en Chrome DevTools
```

---

## 🔧 Configuración de Variables de Entorno

El archivo `.env` en la raíz contiene:

```env
# Docker Compose
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=transito_alerta

# Backend
APP_ENV=development
DB_HOST=postgres        # En Docker Compose; en local es "localhost"
DB_PORT=5432
DB_NAME=transito_alerta
DB_USER=postgres
DB_PASSWORD=changeme

# JWT
JWT_ACCESS_SECRET=dev-secret-access-token
JWT_REFRESH_SECRET=dev-secret-refresh-token

# Redis
REDIS_URL=redis://redis:6379    # En Docker; en local puede ser redis://localhost:6379
```

**Para local con backend en terminal**, actualiza `.env`:

```bash
# En backend/.env (si existe) o raíz/.env
DB_HOST=localhost           # No "postgres" (ese es el nombre del container)
REDIS_URL=redis://localhost:6379  # No "redis" (ese es el nombre del container)
```

---

## 🎯 Flujo Típico de Desarrollo

```bash
# 1. Clone + Setup (una sola vez)
git clone <repo>
cd Transito-Alerta-SE
./setup-local.sh

# 2. Todos los días: Levanta backend + frontend
# Terminal A
cd backend && pnpm start:dev

# Terminal B
cd frontend && pnpm start:dev

# 3. Develop + Test
# Edita archivos → guardados automáticos recargan en navegador
# Abre http://localhost:4200

# 4. Antes de push
pnpm test              # Frontend
cd backend && pnpm test   # Backend unit
pnpm test:e2e              # Backend E2E

# 5. Commit + Push
git add .
git commit -m "..."
git push
```

---

## 🐛 Troubleshooting

### "psql: error: could not connect to server"

```bash
# Postgres no está listo aún
docker compose up -d postgres
sleep 10
psql postgres://postgres:changeme@localhost:5432/transito_alerta
```

### "docker: command not found"

Instala Docker Desktop desde https://www.docker.com/products/docker-desktop

### "pnpm: command not found"

```bash
npm install -g pnpm@11
```

### Migraciones fallan con "table already exists"

Las migraciones son idempotentes. Si una migración ya se ejecutó, puede no importar. Verifica:

```bash
cd backend && pnpm db:migrate:status
```

### Redis lleno o caché anticuado

```bash
docker exec tase-redis redis-cli FLUSHDB
```

### Base de datos corrupta o en mal estado

```bash
# Reseteo limpio (PIERDE TODO)
docker compose down -v
./setup-local.sh
```

---

## 📚 Documentación Adicional

- **Stack Tecnológico**: [docs/Stack-tecnológico.md](../docs/Stack-tecnológico.md)
- **CI/CD**: [docs/CI_CD.md](../docs/CI_CD.md)
- **Migraciones**: [database/MIGRATION_LOG.md](../database/MIGRATION_LOG.md)
- **Mail**: [docs/MAIL.md](../docs/MAIL.md)

---

## 💡 Tips Útiles

### Reconstruir Frontend SPA Rápidamente

```bash
cd frontend && pnpm build && pnpm preview
# Ahora http://localhost:4173 sirve la build de producción
```

### Inspeccionar BD en Tiempo Real

```bash
watch -n 1 "psql postgres://postgres:changeme@localhost:5432/transito_alerta -c 'SELECT COUNT(*) as total_incidents FROM incidents WHERE deleted_at IS NULL;'"
```

### Monitorear Redis

```bash
docker exec -it tase-redis redis-cli MONITOR
```

### Pre-commit Hook para Linting

```bash
# En .git/hooks/pre-commit
#!/bin/bash
cd backend && pnpm lint --fix
cd ../frontend && pnpm lint --fix
```

---

**¿Alguna pregunta?** Consulta [docs/](../docs/) o abre un issue en el repositorio.
