# 📋 TAREA 02 — Fix N+1 Location Queries

**Asignado a**: Integrante Backend/BD (Yandris)  
**Prioridad**: 🔴 CRÍTICA  
**Estimado**: 1 hora  
**Dificultad**: Fácil  
**Sprint**: TODAY  

---

## 📌 DESCRIPCIÓN

Location filtering hace query separada (`Location::find()` + `descendantsAndSelf()`) por cada aplicación de filtro. En dashboard con 2000+ locations, esto genera queries redundantes.

**Problema**: 
```php
// Current (BAD)
$location = Location::find($locationId);           // Query 1
$locationIds = $location->descendantsAndSelf()
    ->pluck('id')
    ->toArray();                                    // Query 2-N
```

**Objetivo**: Cache location hierarchy o usar single query con join.

---

## 🎯 IMPACTO

- **Antes**: 2-3ms × 1000 filters/día = 2-3 segundos wasted
- **Después**: < 0.5ms (cached)
- **Ganancia**: 85% reduction en location queries

---

## 📁 ARCHIVOS AFECTADOS

| Archivo | Rol | Cambios |
|---|---|---|
| `backend/app/Domains/Incidents/Repositories/EloquentIncidentRepository.php` | Modify | Lines 74-79: optimizar location query |
| `backend/app/Models/Location.php` | Review | Verificar Nested Set structure |
| `backend/database/migrations/2026_*_create_locations_table.php` | Review | Verificar índices en parent_id |

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Paso 1: Analizar Current Code
**Archivo**: `backend/app/Domains/Incidents/Repositories/EloquentIncidentRepository.php`

**Ubicación**: Lines 74-79

**Current code** (PROBLEMATIC):
```php
private function applyLocationFilter($query, $locationId)
{
    $location = Location::find($locationId);
    $locationIds = $location->descendantsAndSelf()
        ->pluck('id')
        ->toArray();
    
    return $query->whereIn('location_id', $locationIds);
}
```

**Problemas**:
- Separate query para cada location hierarchy
- Llamado en loop si hay múltiples filters
- No caché entre requests

---

### Paso 2: Implementar Solución — Option A (Recomendado: Cache)

**Cambio**:
```php
use Illuminate\Support\Facades\Cache;

private function applyLocationFilter($query, $locationId)
{
    // Cache location hierarchy para evitar N+1
    $cacheKey = "location.descendants.{$locationId}";
    $cacheTTL = 1440; // 24 horas (location data no cambia frecuente)
    
    $locationIds = Cache::remember($cacheKey, $cacheTTL, function () use ($locationId) {
        $location = Location::find($locationId);
        
        if (!$location) {
            return [$locationId]; // Fallback
        }
        
        return $location->descendantsAndSelf()
            ->pluck('id')
            ->toArray();
    });
    
    return $query->whereIn('location_id', $locationIds);
}
```

**¿Por qué?**:
- Primera llamada: query DB (2-3ms)
- Siguientes 1440 llamadas: Redis cache (< 0.1ms)
- Si location se modifica: invalidar cache manualmente

---

### Paso 3: Invalidar Cache cuando Location cambia
**Archivo**: `backend/app/Models/Location.php`

**Agregar hooks**:
```php
namespace App\Models;

use Illuminate\Support\Facades\Cache;

class Location extends Model
{
    // ... existing code ...
    
    // AGREGAR: Cache invalidation on update
    protected static function booted()
    {
        static::updated(function ($model) {
            // Invalidate this location's hierarchy cache
            Cache::forget("location.descendants.{$model->id}");
            
            // Invalidate parent's hierarchy cache too
            if ($model->parent_id) {
                Cache::forget("location.descendants.{$model->parent_id}");
            }
        });
        
        static::deleted(function ($model) {
            Cache::forget("location.descendants.{$model->id}");
        });
    }
}
```

---

### Paso 4: Verificar Índices en BD
**Archivo**: `backend/database/migrations/2026_*_create_locations_table.php`

**Verificar** que existe índice en `parent_id`:
```php
Schema::create('locations', function (Blueprint $table) {
    // ... existing columns ...
    $table->unsignedBigInteger('parent_id')->nullable();
    $table->index('parent_id'); // ← DEBE EXISTIR
    $table->foreign('parent_id')->references('id')->on('locations')->cascadeOnDelete();
});
```

**Si no existe**, crear migration:
```bash
php artisan make:migration add_index_to_locations_parent_id

# En la migration:
Schema::table('locations', function (Blueprint $table) {
    $table->index('parent_id');
});
```

---

### Paso 5: Test Manually
**Bash**: Ejecutar en terminal

```bash
# 1. Acceder a tinker
php artisan tinker

# 2. Test single location query (should be fast now)
$start = microtime(true);
$locationIds = Location::find(5)->descendantsAndSelf()->pluck('id')->toArray();
$duration = microtime(true) - $start;
echo "Query time: " . round($duration * 1000, 2) . "ms\n";

# 3. Test cached query (should be < 1ms)
$start = microtime(true);
$locationIds = Location::find(5)->descendantsAndSelf()->pluck('id')->toArray();
$duration = microtime(true) - $start;
echo "Cached time: " . round($duration * 1000, 2) . "ms\n";

# 4. Verify cache exists
Cache::get('location.descendants.5');
// Should return array of IDs

exit
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] Location query wrapped in `Cache::remember()` with 1440s TTL
- [ ] Cache key includes locationId
- [ ] Cache invalidates on `Location::update()` and `delete()`
- [ ] First query hits DB (3-5ms)
- [ ] Subsequent queries hit cache (< 1ms)
- [ ] Index on `locations.parent_id` exists (verify: `\d locations` in psql)
- [ ] No errors in `php artisan tinker` test
- [ ] Dashboard filters still work correctly

---

## 🧪 VERIFICACIÓN

```bash
# 1. Check migration status
php artisan migrate:status | grep locations

# 2. Verify index exists
docker-compose exec db psql -U user -d incidencias_db -c "
    SELECT indexname FROM pg_indexes 
    WHERE tablename = 'locations' AND indexname LIKE '%parent%';
"
# Debe retornar: locations_parent_id_index

# 3. Run manual test
php artisan tinker
>>> $start = microtime(true); Location::find(1)->descendantsAndSelf()->count(); echo (microtime(true) - $start) * 1000 . "ms\n";
# Primera: 2-3ms
# Segunda: < 1ms

# 4. Verify cache
>>> Cache::has('location.descendants.1')
=> true
```

---

## 📝 NOTAS

- **1440s TTL = 24 horas**: Ubicaciones no cambian frecuente (sensible default)
- **Cascade invalidation**: Si parent cambia, child cache también se limpia
- **Fallback**: Si location no existe, retorna [$locationId] solo
- **Alternativa**: Eager load entire tree on app boot (menos flexible)

---

## 🔗 REFERENCIAS

- Nested set query patterns: https://laravel.com/docs/11.x/eloquent
- Cache tags: https://laravel.com/docs/11.x/cache#cache-tags
- Related: TAREA_01_CACHE_STATS_ENDPOINT (parallelizable)

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Yandris  
**Fecha inicio**: 2026-07-14  
**Fecha fin estimada**: 2026-07-14 (same day)

