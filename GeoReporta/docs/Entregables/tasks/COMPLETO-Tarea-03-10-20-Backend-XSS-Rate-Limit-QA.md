# 🔵 TAREAS BACKEND — Integrante 2 (Alisson)
**Especialista: Backend / API REST · Laravel · Seguridad**

**Basadas en E1+E2+E3+E4 · Fecha: 16 de julio de 2026**

---

## 📋 Resumen de Tareas Backend

| Prioridad | Tarea | Defecto/RF | Estado | Est. |
|---|---|---|---|---|
| 🔴 Crítico | BUG-005: Sanitizar title/description | XSS Almacenado | ⏳ | 2h |
| 🔴 Crítico | BUG-002: Error handling QueryException | TypeError exposure | ✅ Corregido | 1h |
| 🟠 Alto | BUG-003: Validar categoría es hoja | Validación débil API | ⏳ | 1h |
| 🟠 Alto | BUG-004: Dashboard stats inconsistente | SoftDeletes bypass | ✅ Corregido | 1.5h |
| 🟡 Medio | H-04: Password complexity regex | 8+ chars, mayús/minús/dígito | ✅ Validado | 0h |
| 🟡 Medio | H-02: Rate-limiting POST /login | Throttle middleware | ⏳ | 1.5h |
| 🟡 Medio | Completar casos no ejecutados | CP-08-03-B a CP-08-05-B | ⏳ | 2h |
| 🟢 Bajo | BUG-006: IncidentSeeder logging | Contar reales | ⏳ | 0.5h |

**Total Estimado:** ~9.5 horas  
**Responsable:** Integrante 2 (Alisson Yamel Reyes Ricardo)

---

## 🔴 TAREA-B01: Sanitizar XSS (Parte Backend de BUG-005)

**Ver detalles completos en:** TASKS-CRITICAL-E4.md → TASK-002 (Backend section)

**Resumen:**
- Instalar `mews/purifier`
- Agregar `passedValidation()` a StoreIncidentRequest + StoreCommentRequest
- Sanitizar `title`, `description`, `message` con Purifier

**Archivos a Modificar:**
- `backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php`
- `backend/app/Domains/Incidents/Http/Requests/UpdateIncidentRequest.php` (si aplica)
- `backend/app/Domains/Comments/Http/Requests/StoreCommentRequest.php`

**Validación:**
- ✅ CP-10-03-B re-test: POST /api/incidents con XSS → almacena sanitizado
- ✅ GET /api/incidents retorna con `title` escapado: `&lt;script&gt;`

---

## 🟠 TAREA-B02: Validar Categoría es Hoja (BUG-003)

**Severidad:** Alto (UX pobre, pero integridad en BD protegida)  
**Estimado:** 1 hora  
**Evidencia:** CP-06-03-B retorna HTTP 500 en lugar de 422

### Problema

```http
POST /api/incidents
{
  "category_id": 5  // ID 5 es categoría padre (no-hoja)
}

Response: HTTP 500 (BUG-003)
Esperado: HTTP 422 con mensaje "must be a leaf category"
```

### Solución

**Paso 1:** Crear custom validation rule

```php
// app/Domains/Incidents/Http/Rules/CategoryIsLeafRule.php
<?php
namespace App\Domains\Incidents\Http\Rules;

use Illuminate\Contracts\Validation\Rule;
use App\Domains\Incidents\Models\IncidentCategory;

class CategoryIsLeafRule implements Rule
{
    public function passes($attribute, $value)
    {
        $category = IncidentCategory::find($value);
        if (!$category) return false;
        
        // Verificar que no tiene hijos
        return !$category->children()->exists();
    }
    
    public function message()
    {
        return 'The :attribute must be a leaf category (without children).';
    }
}
```

**Paso 2:** Agregar a StoreIncidentRequest

```php
// app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php
use App\Domains\Incidents\Http\Rules\CategoryIsLeafRule;

public function rules(): array
{
    return [
        'category_id' => [
            'required',
            'exists:incident_categories,id',
            new CategoryIsLeafRule(),  // ← NUEVO
        ],
        // ... otros campos
    ];
}
```

**Paso 3:** Validar

```bash
# Test con categoría padre (debe retornar 422):
curl -X POST http://localhost:8000/api/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category_id": 5, ...}'

# Esperado: HTTP 422
# {"category_id": ["The category_id must be a leaf category..."]}
```

### Criterio de Aceptación

```gherkin
Given: IncidentCategory con id=5 (es padre, tiene hijos)
When: POST /api/incidents {"category_id": 5}
Then: HTTP 422 (no 500)
And: Response contiene mensaje "leaf category"
```

---

## 🟠 TAREA-B03: H-02 Rate-limiting POST /login

**Hallazgo E2:** POST /api/login sin rate-limiting → Brute Force vulnerability  
**Estimado:** 1.5 horas  
**Prioridad:** Alta (seguridad, aunque otro integrante podría hacerlo)

### Problema

```http
POST /api/login
{"email": "user@test.com", "password": "wrong"}

# Puede intentarse ilimitadas veces sin bloqueo
# OWASP: Authentication Failures
```

### Solución: Middleware Throttle

**Opción A: Throttle en ruta**

```php
// backend/routes/api.php
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1')  // 5 intentos por 1 minuto
    ->name('auth.login');
```

**Opción B: Throttle personalizado (recomendado)**

```php
// app/Http/Middleware/ThrottleLogin.php
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Cache\RateLimiter;

class ThrottleLogin
{
    public function handle($request, Closure $next)
    {
        $key = 'login_' . $request->ip();
        $maxAttempts = 5;
        $decayMinutes = 1;
        
        if ($this->limiter->tooManyAttempts($key, $maxAttempts)) {
            return response()->json([
                'message' => 'Too many login attempts. Try again in ' . 
                    $this->limiter->availableIn($key) . ' second(s).'
            ], 429);
        }
        
        $this->limiter->hit($key, $decayMinutes * 60);
        
        return $next($request);
    }
}
```

**Opción C: Usar package (recomendado)**

```bash
composer require spatie/laravel-rate-limited-job-middleware
```

### Implementación

- [ ] **B03.1:** Elegir opción A, B, o C
- [ ] **B03.2:** Implementar en routes/api.php o middleware
- [ ] **B03.3:** Configurar: 5 intentos por 60 segundos
- [ ] **B03.4:** Test manual (intentar 6 logins fallidos → 429 en 6to)

### Validación

```bash
# Test con script bash:
for i in {1..6}; do
  curl -X POST http://localhost:8000/api/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo "Intento $i"
done

# Esperado:
# Intentos 1-5: HTTP 422 (credenciales incorrectas)
# Intento 6: HTTP 429 (Too Many Requests)
```

---

## 🟡 TAREA-B04: Completar Casos No Ejecutados (CP-08-03-B a CP-08-05-B)

**Severidad:** Medio  
**Estimado:** 2 horas  
**Casos bloqueados:** CP-08-03-B, CP-08-04-B, CP-08-05-B (Dashboard filters)

### Contexto (E3)

CP-08-03-B: `/api/incidents/stats?start_date=...&end_date=...`  
CP-08-04-B: `/api/incidents/stats?type_id=5`  
CP-08-05-B: `/api/incidents/stats?ciudad_id=10`

### Realidad (E4)

El endpoint `/api/incidents/stats` **no acepta parámetros de filtro** en la implementación actual. Opciones:

**Opción A: Implementar soporte de filtros (recomendado)**

```php
// app/Domains/Incidents/Http/IncidentStatsController.php

public function groupCounts(Request $request)
{
    $query = Incident::query();
    
    // Filtro por rango de fechas
    if ($request->filled('start_date')) {
        $query->where('created_at', '>=', $request->start_date);
    }
    if ($request->filled('end_date')) {
        $query->where('created_at', '<=', $request->end_date);
    }
    
    // Filtro por tipo
    if ($request->filled('type_id')) {
        $query->where('category_id', $request->type_id);
    }
    
    // Filtro por ciudad
    if ($request->filled('location_id')) {
        $query->where('location_id', $request->location_id);
    }
    
    return response()->json([
        'total' => $query->count(),
        'by_status' => $query->groupBy('status')
                            ->selectRaw('status, count(*) as count')
                            ->pluck('count', 'status'),
    ]);
}
```

**Opción B: Marcar casos como "No Aplica" (E3 desactualizado)**

Documentar que E3 diseño incluía filtros que no existen en la arquitectura real. Cerrar CP-08-03-B a CP-08-05-B como "Diseño desactualizado".

### Decisión Recomendada

**Implementar Opción A** (mayor valor funcional + E3 coverage).

- [ ] **B04.1:** Agregar filtros a IncidentStatsController
- [ ] **B04.2:** Validar parámetros (dates en formato ISO, IDs existen)
- [ ] **B04.3:** Re-ejecutar CP-08-03-B, CP-08-04-B, CP-08-05-B
- [ ] **B04.4:** Verificar que dashboard sigue funcionando (no romper)

---

## 🟡 TAREA-B05: BUG-006 IncidentSeeder Logging

**Severidad:** Bajo (dev only)  
**Estimado:** 0.5 horas

### Problema

```php
// database/seeders/IncidentSeeder.php
echo "22 incidents seeded";  // Sin contar reales

// En realidad pueden ser 0 si usuarios no existen
```

### Solución

```php
public function run(): void
{
    $created = 0;
    foreach (self::INCIDENTS as $incident) {
        try {
            Incident::create($incident);
            $created++;
        } catch (\Exception $e) {
            // Log error, continue
        }
    }
    $this->command->info("Incidents seeded: $created");
}
```

---

## ✅ Validaciones Previas (E2 — Ya Completadas)

### H-04: Password Complexity

**Estado:** ✅ Implementado + Validado en E4  
**Ubicación:** 
- `backend/app/Domains/Users/Http/Requests/StoreUserRequest.php:50`
- `backend/app/Domains/Users/Http/Requests/UpdateUserRequest.php:67`

**Regex:** `^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/`  
**Validación:** CP-09-02-B (password incorrecto → 422 con mensaje clarity)

**No requiere acción adicional.**

### H-02: Rate-limiting (Este Backend)

**Estado:** ⏳ Pendiente  
**Asignado a:** Este integrante (B03)

### H-03: IncidentPolicy (Anterior Backend)

**Estado:** ✅ Ya implementado + Verificado  
**Ubicación:** `backend/app/Domains/Incidents/Http/Policies/IncidentPolicy.php`  
**Verificación:** CP-09-01-B, CP-09-04-B (autorización funciona)

**No requiere acción.**

---

## 📅 Timeline Recomendado

| Tarea | Inicio | Duración | Fin |
|---|---|---|---|
| B01 (XSS sanitize) | 2026-07-18 | 2h | 2026-07-18 |
| B02 (Validar categoria) | 2026-07-18 | 1h | 2026-07-18 |
| B03 (Rate-limit login) | 2026-07-19 | 1.5h | 2026-07-19 |
| B04 (Dashboard filters) | 2026-07-19 | 2h | 2026-07-20 |
| B05 (Seeder logging) | 2026-07-20 | 0.5h | 2026-07-20 |
| **Re-test casos** | 2026-07-20 | 2h | 2026-07-21 |
| **Buffer** | 2026-07-21 | — | 2026-07-31 |

---

## 🎯 Criterios de Aceptación Global

```gherkin
Feature: Backend E4 Completion
  
  Scenario: BUG-005 XSS Sanitization
    Given: Payload con <script> en title
    When: POST /api/incidents
    Then: Almacena sanitizado (&lt;script&gt;)
    And: CP-10-03-B pasa
  
  Scenario: BUG-003 Validación Categoría
    Given: category_id es padre (no-hoja)
    When: POST /api/incidents
    Then: HTTP 422 (no 500)
  
  Scenario: H-02 Rate-limiting
    Given: 6 intentos POST /api/login fallidos
    When: En 60 segundos
    Then: Intento 6 retorna HTTP 429
  
  Scenario: Dashboard Stats
    Given: /api/incidents/stats?type_id=5
    When: GET con filtro
    Then: HTTP 200, stats solo del tipo 5
```

---

**Documento generado:** 16 de julio de 2026  
**Responsable:** Integrante 2 (Backend/Seguridad)  
**Siguiente:** TASKS-FRONTEND-E4.md (Integrante 1)
