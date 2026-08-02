# 📋 TAREA 01 — Cache Stats Endpoint

**Asignado a**: Integrante Backend (Andy)  
**Prioridad**: 🔴 CRÍTICA  
**Estimado**: 1-2 horas  
**Dificultad**: Fácil-Media  
**Sprint**: TODAY  

---

## 📌 DESCRIPCIÓN

Dashboard stats endpoint (`GET /api/incidents/stats`) ejecuta **6 aggregation queries** cada vez que se llama. Sin caché, dashboard refetcha cada 30s × 1000 usuarios = **100-200s desperdiciados diariamente**.

**Objetivo**: Implementar Redis cache con 60s TTL + tag-based invalidation.

---

## 🎯 IMPACTO

- **Antes**: 400-600ms por request
- **Después**: < 200ms (cached)
- **Ganancia**: 50% performance improvement
- **Usuarios**: 1000+ beneficiados (dashboard constante)

---

## 📁 ARCHIVOS AFECTADOS

| Archivo | Rol | Cambios |
|---|---|---|
| `backend/app/Domains/Incidents/Http/IncidentStatsController.php` | Modify | Agregar Cache::remember() wrapper |
| `backend/app/Models/Incident.php` | Modify | Agregar hook para invalidar cache en create/update |
| `backend/routes/api.php` | Review | Verificar endpoint `/api/incidents/stats` existe |
| `backend/tests/Feature/Incidents/IncidentStatsControllerTest.php` | Modify | Agregar test para cache hit/miss |

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Paso 1: Modificar IncidentStatsController.__invoke()
**Archivo**: `backend/app/Domains/Incidents/Http/IncidentStatsController.php`

**Ubicación**: Lines 30-222 (método `__invoke()`)

**Cambio**:
```php
public function __invoke(Request $request)
{
    // Validar formato de fechas (existing code)
    $request->validate([
        'inicio' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:fin'],
        'fin' => ['nullable', 'date_format:Y-m-d'],
    ]);
    
    // AGREGAR: Cache key generation
    $cacheKey = "incident.stats." . md5(json_encode($request->all()));
    $cacheTTL = 60; // 60 segundos
    
    // AGREGAR: Cache wrapper
    return response()->json(
        Cache::remember($cacheKey, $cacheTTL, function () use ($request) {
            // TODO: Move existing query logic into this closure
            $inicio = $request->input('inicio');
            $fin = $request->input('fin');
            $tipo_id = $request->input('tipo_id');
            $ciudad_id = $request->input('ciudad_id');
            $provincia_id = $request->input('provincia_id');
            $pais_id = $request->input('pais_id');
            
            // Existing aggregation queries (lines 58-130)
            // ... groupCounts(), averageResolutionTime(), etc. ...
            
            return [
                'total' => $total,
                'by_status' => $this->groupCounts(...),
                'by_priority' => $this->groupCountsPriority(...),
                'average_resolution_time' => $this->averageResolutionTime(...),
                'locations_count' => $this->locationsCount(...),
                'recent_count' => $this->recentCount(...),
            ];
        })
    );
}
```

**¿Qué cambió?**:
- Generar cache key basado en parámetros request
- Wrap queries en `Cache::remember()` con TTL 60s
- Devuelve resultado cached si existe, sino ejecuta queries

---

### Paso 2: Invalidar Cache en Incident Model
**Archivo**: `backend/app/Models/Incident.php`

**Ubicación**: Agregar hooks después de `protected $casts`

**Cambio**:
```php
namespace App\Models;

use Illuminate\Support\Facades\Cache;

class Incident extends Model
{
    // ... existing code ...
    
    // AGREGAR: Invalidate cache hooks
    protected static function booted()
    {
        static::created(function ($model) {
            self::invalidateStatsCache();
        });
        
        static::updated(function ($model) {
            self::invalidateStatsCache();
        });
        
        static::deleted(function ($model) {
            self::invalidateStatsCache();
        });
    }
    
    // AGREGAR: Helper method
    private static function invalidateStatsCache()
    {
        // Clear ALL stats cache keys (pattern-based)
        Cache::tags(['incident.stats'])->flush();
        // O alternativa: Cache::forget('incident.stats.*') — pero Redis no soporta wildcards
    }
}
```

**¿Por qué?**:
- Cuando incident se crea/actualiza/elimina, cache se invalida
- Dashboard siempre muestra datos frescos (max 1 operación + 60s)

---

### Paso 3: Verificar .env Redis Configuration
**Archivo**: `.env` (o `.env.example`)

**Verificar**:
```
CACHE_DRIVER=redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null  # (OK en dev)
```

**Si no existe**: Agregar a `.env`

---

### Paso 4: Agregar Test para Cache
**Archivo**: `backend/tests/Feature/Incidents/IncidentStatsControllerTest.php`

**Agregar test** (después de existing tests):
```php
public function test_stats_endpoint_caches_results()
{
    Cache::flush(); // Start fresh
    
    // First call — should query DB
    $response1 = $this->get('/api/incidents/stats');
    $this->assertEquals(200, $response1->status());
    $data1 = $response1->json();
    
    // Second call — should be cached
    $start = microtime(true);
    $response2 = $this->get('/api/incidents/stats');
    $duration = microtime(true) - $start;
    
    // Verify cached (< 10ms typically)
    $this->assertLessThan(0.01, $duration);
    $this->assertEquals($data1, $response2->json());
}

public function test_cache_invalidates_on_incident_create()
{
    Cache::flush();
    $response1 = $this->get('/api/incidents/stats');
    $total1 = $response1->json('total');
    
    // Create new incident
    $this->post('/api/incidents', [
        'title' => 'Test',
        'description' => 'Test',
        // ... full payload ...
    ]);
    
    // Cache should be invalidated
    $response2 = $this->get('/api/incidents/stats');
    $total2 = $response2->json('total');
    
    // Total should increase by 1
    $this->assertEquals($total1 + 1, $total2);
}
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] Stats endpoint returns cached response on 2nd call (< 10ms)
- [ ] Cache key includes all filter parameters (inicio, fin, tipo_id, etc.)
- [ ] Cache TTL = 60 seconds ± 5 seconds
- [ ] Cache invalidates automatically on `Incident::create()`, `update()`, `delete()`
- [ ] Tests pass: `php artisan test --filter IncidentStatsController`
- [ ] Redis is used (verify with `docker-compose exec redis redis-cli KEYS "incident.stats*"`)
- [ ] Performance measured: before vs after (screenshot terminal output)

---

## 🧪 VERIFICACIÓN

**Antes de completar**, ejecutar:

```bash
# 1. Run tests
php artisan test --filter IncidentStatsController

# 2. Manual test — hit endpoint 2 veces
curl -v http://localhost:8000/api/incidents/stats?inicio=2026-07-01
# Nota response time en primera llamada (400-600ms)

curl -v http://localhost:8000/api/incidents/stats?inicio=2026-07-01
# Nota response time en segunda llamada (< 10ms si cached)

# 3. Verify cache in Redis
docker-compose exec redis redis-cli
> KEYS "incident.stats*"
# Debe retornar la cache key

# 4. Create incident y verifica cache se limpia
curl -X POST http://localhost:8000/api/incidents \
  -H "Authorization: Bearer [token]" \
  -d '{...incident payload...}'

curl -v http://localhost:8000/api/incidents/stats
# Response time debe ser 400-600ms nuevamente (cache invalidated)
```

---

## 📝 NOTAS

- **Redis debe estar running**: `docker-compose ps redis` debe mostrar `Up`
- **Cache key incluye filtros**: Diferentes filtros = diferentes cache keys (correcto)
- **TTL = 60s es balance**: Datos frescos cada minuto; sin sobrecargar Redis
- **Tag-based flush**: Si cambias a `Cache::tags()`, verifica que Redis lo soporta

---

## 🔗 REFERENCIAS

- Laravel Cache docs: https://laravel.com/docs/11.x/cache
- Redis TTL: https://redis.io/commands/expire/
- Related task: TAREA_02_FIX_N+1_QUERIES (parallelizable)

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Andy  
**Fecha inicio**: 2026-07-14  
**Fecha fin estimada**: 2026-07-14 (same day)

