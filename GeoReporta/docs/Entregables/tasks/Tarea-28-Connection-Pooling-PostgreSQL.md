# PLAN DE CORRECCIÓN — Fixes Negativos Performance E7
## Sistema de Incidencias Georreferenciadas

**Fecha:** 2026-07-22  
**Status:** En curso  
**Asignados:** Integrante 2 (Backend) + Integrante 3 (BD/Infra)

---

## 1. RESUMEN EJECUTIVO

### Problema Diagnosticado
- **Métrica:** Latencia p(95) = 4210ms (target < 500ms)
- **Causa Raíz:** Write contention + Redis sync delays + Connection pool exhaustion
- **Impacto:** Sistema degradado bajo carga (50 VUs simultáneos)
- **Bloqueante:** SÍ — impide demo 04 de mayo sin remediation

### Estado Actual
| Fix | Descripción | Status | Responsable |
|---|---|---|---|
| ✅ GiST Index | PostgreSQL spatial index en `geom` | DONE | Integrante 3 |
| ✅ Attribute Indices | 6 índices en (status, priority, org) | DONE | Integrante 3 |
| ⏳ Connection Pooling | pgbouncer + max_connections | **PENDING** | Integrante 3 |
| ⏳ Octane Workers | Aumentar --workers de 2 → 4 | **PENDING** | Integrante 2 |
| ⏳ Async Events | Desacoplar Incident::created sync | **PENDING** | Integrante 2 |
| ⏳ Redis TTL | Agregar expiry a cache feed | **PENDING** | Integrante 2 |

---

## 2. FIXES NEGATIVOS — DETALLE Y REMEDIACIÓN

### 2.1 🔴 P1 CRÍTICO: Connection Pool Exhaustion
**Responsable:** Integrante 3 (BD/Infra)

#### Problema
```
PostgreSQL: "remaining connection slots are reserved for non-replication superuser connections"
```
- Backend + k6 test = 50+ conexiones simultáneas
- `max_connections` default (100) agotado rápidamente
- Queries quedan en espera → timeout → lentitud cascada

#### Solución

##### Option A: Aumentar max_connections (rápido, menos óptimo)
```sql
-- En container PostgreSQL
psql -U user -d incidencias_db

ALTER SYSTEM SET max_connections = 250;
SELECT pg_reload_conf();
SELECT setting FROM pg_settings WHERE name = 'max_connections';
```

**Verificar:**
```bash
docker compose exec db psql -U user -d incidencias_db -c "SHOW max_connections;"
# Debería retornar: 250
```

##### Option B: Implementar pgbouncer (recomendado PROD)
1. **Editar `docker-compose.yml`** — agregar servicio pgbouncer:
```yaml
pgbouncer:
  image: pgbouncer:latest
  container_name: pgbouncer
  environment:
    DATABASES_HOST: db
    DATABASES_PORT: 5432
    DATABASES_USER: user
    DATABASES_PASSWORD: password
    DATABASES_DBNAME: incidencias_db
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 200
    PGBOUNCER_DEFAULT_POOL_SIZE: 20
    PGBOUNCER_MIN_POOL_SIZE: 5
  ports:
    - "6432:6432"
  depends_on:
    - db
  networks:
    - dev-network
```

2. **Actualizar conexión Laravel** en `backend/.env`:
```env
DB_HOST=pgbouncer  # CAMBIO: era 'db'
DB_PORT=6432       # CAMBIO: era 5432
```

3. **Aplicar cambios:**
```bash
docker compose up -d pgbouncer
docker compose restart backend
```

4. **Validar:**
```bash
curl http://localhost:8000/api/health
# Debería retornar 200 OK con DB conectada
```

#### Checklist
- [ ] Actualizar `max_connections` a 250 O implementar pgbouncer
- [ ] Validar conexión desde backend
- [ ] Ejecutar k6 smoke test (1 VU) → confirm 37ms baseline
- [ ] Ejecutar k6 read-heavy (50 VUs) → medir mejora p(95)

---

