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

### 2.5 ✅ P1 YA HECHO: PostgreSQL Indices
**Status:** COMPLETADO — Integrante 3

```sql
-- Migration: 2026_07_21_000001_add_performance_indexes_to_incidents.php
-- ✅ APPLIED
CREATE INDEX idx_incidents_geom_gist ON incidents USING GIST (geom);
CREATE INDEX idx_incidents_organization_status ON incidents (organization_id, status);
CREATE INDEX idx_incidents_status ON incidents (status);
CREATE INDEX idx_incidents_priority ON incidents (priority);
CREATE INDEX idx_incidents_location_id ON incidents (location_id);
CREATE INDEX idx_incidents_user_id ON incidents (user_id);
CREATE INDEX idx_incidents_incident_category_id ON incidents (incident_category_id);
```

**Verificación:**
```bash
docker compose exec db psql -U user -d incidencias_db -c \
  "SELECT indexname FROM pg_indexes WHERE tablename='incidents' ORDER BY indexname;"
# Debería listar 7 índices idx_incidents_*
```

---

## 3. TABLA DE DEPENDENCIES Y ORDEN

```
┌─────────────────────────────────────────────────────────┐
│ P1: Connection Pooling                                  │
│ (Integrante 3 — DB/Infra)                               │
│ Est: 30 min                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ P1: Octane Workers=4                                    │
│ (Integrante 2 — Backend)                                │
│ Est: 10 min                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ P2: Async Events (Queue + ShouldQueue)                  │
│ (Integrante 2 — Backend)                                │
│ Est: 45 min                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ P2: Redis Cache TTL                                     │
│ (Integrante 2 — Backend)                                │
│ Est: 15 min                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ RE-TEST k6 → validate p(95) < 500ms                    │
│ (Todos)                                                 │
│ Est: 10 min                                             │
└─────────────────────────────────────────────────────────┘
```

**Total:** ~2 horas (si se hace en paralelo: Integrante 2 + Integrante 3)

---

## 4. TEST DE VALIDACIÓN

### Antes de aplicar cualquier fix
```bash
cd /home/andy/Escritorio/PROYECTOS/INTEGRADOR/sistema-incidencias-georreferenciadas

# Baseline
docker run --rm --network host \
  -v "$(pwd)/perf/scripts:/app" \
  -e API_BASE_URL="http://localhost:8000" \
  grafana/k6:latest run /app/load-test-complete.js --vus 50 --duration 2m 2>&1 | tail -50
```

**Esperado PRE-FIX:**
```
p(95)=4.21s
http_req_failed = 0%
```

### Después de CADA fix
Repetir el comando k6 y capturar:
- [ ] p(95) — debería disminuir
- [ ] http_req_failed — debería permanecer 0%
- [ ] Throughput (req/s) — debería aumentar

### Objetivo Final
```
p(95) < 500ms ✅
p(99) < 1000ms ✅
Throughput > 50 req/s ✅
http_req_failed < 1% ✅
```

---

## 5. ROLL-OUT STRATEGY

### Fase 1: LOCAL DEV (DONE)
- [x] Diagnosticar bottlenecks (k6 profiling)
- [x] Aplicar índices PostgreSQL
- [x] Documentar fixes pendientes

### Fase 2: STAGING (AHORA)
- [ ] Integrante 3: Connection pooling
- [ ] Integrante 2: Octane --workers=4 + Async events
- [ ] Ambos: Re-test k6 en staging
- [ ] Documento: Actualizar E7 con nuevos resultados

### Fase 3: PRODUCTION (Pre-Demo)
- [ ] Merge a `develop` con todos los fixes
- [ ] Deploy a staging/prod con rollback plan
- [ ] Monitoreo: Prometheus + Grafana métricas
- [ ] Demo 04 de mayo: ✅ LISTO

---

## 6. TROUBLESHOOTING

### "k6 still shows p(95)=4s después de connection pooling"
**Causas posibles:**
1. pgbouncer no conectado: `docker compose logs pgbouncer`
2. `.env` no recargó: `docker compose down backend && docker compose up -d backend`
3. Max connections aún insuficiente: aumentar a 300

### "Octane workers no se actualizan a 4"
**Causas posibles:**
1. Container no restarted: `docker compose restart backend`
2. Command no guardó: verificar `docker compose.yml` incluye `--workers=4`
3. Check: `docker compose exec backend ps aux | grep octane` — debería listar 4

### "Queue jobs not processing (Redis queue stuck)"
**Causas posibles:**
1. `queue:work` no iniciado: ver sección 2.3 paso 3
2. Redis auth fail: confirmar REDIS_PASSWORD=null en `.env`
3. Jobs dead-lettered: `redis-cli LLEN queues:failed`

---

## 7. REFERENCIAS

- **E7 Document:** `/docs/Entregables/E7/ActividadGrupal_E7ERCO_FINAL.md`
- **k6 Test:** `/perf/scripts/load-test-complete.js`
- **Laravel Queues:** https://laravel.com/docs/queues
- **PostgreSQL:** https://www.postgresql.org/docs/current/runtime-config-connection.html
- **pgbouncer:** https://www.pgbouncer.org/config.html

---

## 8. ASIGNACIÓN FORMAL

### Integrante 2 (Backend) — Alisson Yamel Reyes Ricardo
**Tasks:**
- [ ] Task 2.2: Octane --workers=4
- [ ] Task 2.3: Async event processing (Queue + ShouldQueue)
- [ ] Task 2.4: Redis cache TTL
- **Deadline:** 2026-07-25
- **Effort:** ~70 min

### Integrante 3 (BD/Infra) — Yandris Miguel Rivera Torres
**Tasks:**
- [ ] Task 2.1A o 2.1B: Connection pooling (pgbouncer o max_connections)
- **Deadline:** 2026-07-25
- **Effort:** ~30 min

### Integrante 1 (Frontend) — Andy Bryan Alejandro Vera
**Tasks:**
- Standup/review tests
- Actualizar E7 con resultados finales

---

**Última actualización:** 2026-07-22 05:05 UTC  
**Versión:** 1.0
