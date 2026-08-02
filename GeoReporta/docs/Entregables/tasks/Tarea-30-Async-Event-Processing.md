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

### 2.3 🟠 P2 ALTO: Async Event Processing
**Responsable:** Integrante 2 (Backend)

#### Problema
```php
// IncidentController::store() → Incident::create()
// Trigger 5+ listeners síncronamente:
// - RedisIncidentSync (push to Redis) → LENTO en dev (auth fail)
// - StatusHistoryRecorder (insert status_history) → DB wait
// - NotificationDispatcher (crear notificaciones) → DB + mail queue
// Total: +300-500ms por create request
```

#### Solución
**Usar Laravel Queues** para eventos:

1. **Editar `config/queue.php`** — confirmar `QUEUE_CONNECTION=redis`:
```env
# backend/.env
QUEUE_CONNECTION=redis  # ✅ Ya configurado
REDIS_HOST=redis
REDIS_PORT=6379
```

2. **Marcar listeners como queueable** — en `app/Domains/Incidents/Listeners/`:

```php
// app/Domains/Incidents/Listeners/RedisIncidentSync.php
namespace App\Domains\Incidents\Listeners;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class RedisIncidentSync implements ShouldQueue
{
    use InteractsWithQueue;
    
    public function handle(IncidentCreated $event)
    {
        // Sync será async via Redis queue
    }
}
```

3. **Iniciar queue worker:**
```bash
docker compose exec backend php artisan queue:work redis --tries=3 --timeout=90
# O en background:
docker compose exec -d backend php artisan queue:work redis --tries=3
```

4. **Validar queue processing:**
```bash
docker compose exec redis redis-cli LLEN queues:default
# Debería decrecer conforme procesa
```

#### Benefit
- Store incident: **NOW** 50ms (crear en DB) + queue job
- Sync/notify: **ASYNC** en background (max 30s después)
- **Result:** p(95) write drops ~60%

#### Checklist
- [ ] Verificar `QUEUE_CONNECTION=redis` en `.env`
- [ ] Marcar listeners con `ShouldQueue`
- [ ] Iniciar queue:work en background
- [ ] Ejecutar k6 write-heavy → medir p(95)

---

