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

### 2.4 🟠 P2 MEDIO: Redis Cache TTL
**Responsable:** Integrante 2 (Backend)

#### Problema
```php
// RedisIncidentSync.php línea 120
Cache::put($feedKey, $feedData);
// ❌ Sin TTL → perpetuo, memory leak eventual
```

#### Solución
```php
// app/Domains/Incidents/Listeners/RedisIncidentSync.php

public function handle(IncidentCreated $event)
{
    $feedKey = "feed:incidents:{$org_id}";
    $feedData = [...];
    
    // ✅ Agregar TTL: 1 hora
    Cache::put($feedKey, $feedData, 3600);
    
    // O más explícito con Redis:
    Redis::setex($feedKey, 3600, json_encode($feedData));
}
```

#### Checklist
- [ ] Ubicar todas las `Cache::put()` sin TTL
- [ ] Agregar `3600` (1 hora) a cada una
- [ ] Validar en Redis: `TTL {key}` debería retornar ~3600
- [ ] Ejecutar k6 → confirmar sin memory bloat

---

