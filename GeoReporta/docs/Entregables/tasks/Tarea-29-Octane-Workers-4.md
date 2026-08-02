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

### 2.2 🔴 P1 CRÍTICO: Octane Workers Suboptimizados
**Responsable:** Integrante 2 (Backend)

#### Problema
```
Octane --workers=2 (default) → 2 worker processes
50 VUs concurrentes → sobrecarga, queueing, CPU 95%+
```

#### Solución
1. **Editar `docker-compose.yml`** — comando backend:
```yaml
backend:
  # ... configuración existente ...
  command: php artisan octane:start --workers=4 --port=8000 --host=0.0.0.0
  # CAMBIO: de --workers=2 a --workers=4
```

2. **Rebuild y restart:**
```bash
docker compose down backend
docker compose up -d backend --build
```

3. **Validar workers activos:**
```bash
docker compose exec backend ps aux | grep "octane"
# Debería mostrar 4 procesos worker + 1 server process
```

4. **Monitorear CPU durante test:**
```bash
watch -n 1 'docker stats sistema-incidencias-georreferenciadas-backend-1'
# CPU deberían estar ~50-70% (no 95%+)
```

#### Checklist
- [ ] Actualizar `docker-compose.yml` con `--workers=4`
- [ ] Restart backend container
- [ ] Verificar 4+ procesos worker con `ps aux`
- [ ] Ejecutar k6 → medir CPU y p(95)

---

