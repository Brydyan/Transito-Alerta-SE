# TAREA 11: Implementar Auditoría de Resoluciones (Opción C — Hybrid)

**Asignado a:** Andy Alejandro Vera  
**Duración estimada:** 2-3 horas  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** Ninguna (independiente)

---

## 📋 Descripción

El proyecto actual implementa un flujo de **3 estados** (pending → in_progress → resolved) sin un paso de verificación por "Publicador". Sin embargo, **E1 SRS.md v2.0 requiere RF-FUNC-011 y RF-FUNC-032** (confirm endpoint + incident_verifications table).

**Opción C (Hybrid)** reconcilia ambos sin agregar complejidad:
- Mantener 3 estados (no rompe implementación actual)
- Crear **auditoría automática** cuando incidencia → resolved
- Guardar metadata en tabla **resolution_audits** (ligera, solo log)
- Generar notificación al creador con timestamp + actor
- Visible en detalle incidencia como historial de resoluciones

**Ventaja:** Cumple E1 "verificación de resolución" sin Publicador role ni confirm endpoint.

---

## 🎯 Objetivo

1. Crear tabla `resolution_audits` con: incident_id, resolved_by_user_id, resolved_at, notes
2. Auto-insertar en `resolution_audits` cuando status → resolved (via trigger o observer)
3. Incluir `resolutions` relation en `GET /api/incidents/{id}`
4. Notificación al creador: "Tu incidencia fue resuelta por [Operador] el [fecha]"
5. Mostrar historial en frontend detalle (opcional, pero recomendado)

---

## ✅ Criterios de Aceptación

- [ ] Tabla `resolution_audits` creada (soft delete)
- [ ] Observer/Trigger inserta automáticamente al cambiar status → resolved
- [ ] GET /api/incidents/{id} incluye relación `resolutions`
- [ ] Notificación enviada al creador con timestamp + operador
- [ ] Backend tests: trigger inserta 1 fila por resolución
- [ ] No afecta 3-state workflow actual
- [ ] Visible en detalle incidencia (resolver_name, resolved_at)

---

## 🔧 Cómo Resolver

### PASO 1: Crear Migración (tabla resolution_audits)

**Archivo:** `backend/database/migrations/2026_07_15_000001_create_resolution_audits_table.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resolution_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('resolved_by_user_id')->constrained('users');
            $table->timestamp('resolved_at')->useCurrent();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // Index para queries rápidas por incidencia
            $table->index('incident_id');
            $table->index('resolved_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resolution_audits');
    }
};
```

### PASO 2: Crear Modelo ResolutionAudit

**Archivo:** `backend/app/Domains/Incidents/Models/ResolutionAudit.php`

```php
<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Models;

use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ResolutionAudit extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'incident_id',
        'resolved_by_user_id',
        'resolved_at',
        'notes',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function resolvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_user_id');
    }
}
```

### PASO 3: Agregar Relación a Incident Model

**Archivo:** `backend/app/Domains/Incidents/Models/Incident.php` (línea ~114)

```php
// Agregar después de assignments():

public function resolutions(): HasMany
{
    return $this->hasMany(ResolutionAudit::class);
}
```

### PASO 4: Crear Observer (auto-insertar en resolutions)

**Archivo:** `backend/app/Domains/Incidents/Observers/IncidentResolutionObserver.php`

```php
<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Observers;

use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Models\ResolutionAudit;
use Illuminate\Support\Facades\Auth;

class IncidentResolutionObserver
{
    /**
     * Crea entrada en resolution_audits cuando status → resolved.
     */
    public function updated(Incident $incident): void
    {
        // Solo disparar si status cambió Y nuevo status es "resolved"
        if ($incident->isDirty('status') && $incident->status === IncidentStatus::Resolved) {
            /** @var \App\Domains\Users\Models\User|null $user */
            $user = Auth::user();

            // Crear entrada de auditoría
            ResolutionAudit::create([
                'incident_id' => $incident->id,
                'resolved_by_user_id' => $user?->id ?? $incident->claimed_by,
                'resolved_at' => now(),
                'notes' => 'Resuelta por ' . ($user?->name ?? 'Sistema'),
            ]);

            // Generar notificación al creador (ver PASO 5)
        }
    }
}
```

### PASO 5: Registrar Observer

**Archivo:** `backend/app/Providers/AppServiceProvider.php` (en boot())

```php
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Observers\IncidentResolutionObserver;

public function boot(): void
{
    Incident::observe(IncidentResolutionObserver::class);
    // ... resto de observers
}
```

### PASO 6: Incluir `resolutions` en GET /api/incidents/{id}

**Archivo:** `backend/app/Domains/Incidents/Http/IncidentController.php` (línea ~126)

```php
private const SHOW_RELATIONS = ['category', 'organization', 'user', 'location', 'assignments.user', 'resolutions.resolvedByUser'];

public function show(Request $request, Incident $incident): JsonResponse
{
    $incident->load(self::SHOW_RELATIONS);

    return (new IncidentResource($incident))->withDetail()->response();
}
```

### PASO 7: Actualizar IncidentResource

**Archivo:** `backend/app/Domains/Incidents/Http/Resources/IncidentResource.php`

Agregar en `toArray()` dentro del `if ($this->resource->relations->has('resolutions'))`:

```php
public function toArray($request): array
{
    // ... campos existentes ...
    
    if ($this->resource->relations->has('resolutions')) {
        $data['resolutions'] = $this->resolutions->map(function (ResolutionAudit $audit) {
            return [
                'id' => $audit->id,
                'resolved_by' => [
                    'id' => $audit->resolvedByUser?->id,
                    'name' => $audit->resolvedByUser?->name,
                    'email' => $audit->resolvedByUser?->email,
                ],
                'resolved_at' => $audit->resolved_at?->toIso8601String(),
                'notes' => $audit->notes,
            ];
        });
    }

    return $data;
}
```

### PASO 8: Generar Notificación (Opcional)

Si usas `IncidentNotificationObserver`, agregar:

```php
// En App\Domains\Incidents\Observers\IncidentNotificationObserver::updated()

if ($incident->isDirty('status') && $incident->status === IncidentStatus::Resolved) {
    // Notificar al creador
    Notification::create([
        'user_id' => $incident->user_id,
        'title' => 'Incidencia Resuelta',
        'message' => sprintf(
            'Tu incidencia "%s" fue resuelta por %s el %s',
            $incident->title,
            $incident->claimed_by ? User::find($incident->claimed_by)->name : 'Sistema',
            now()->format('d/m/Y H:i')
        ),
        'related_id' => $incident->id,
    ]);
}
```

### PASO 9: Frontend — Mostrar Historial (Opcional)

**Archivo:** `frontend/app/incidencias/pages/detail/feed-detail.component.js`

Agregar sección de "Historial de Resoluciones":

```javascript
// En template detalle, después de comentarios:
<div class="card mt-3" id="resolutions-section">
  <div class="card-header">
    <h5>Historial de Resoluciones</h5>
  </div>
  <div class="card-body">
    <ul id="resolutions-list" class="list-unstyled">
      <!-- Rellenado por JS desde data.resolutions -->
    </ul>
  </div>
</div>

// En onInit:
if (incidentData.resolutions?.length) {
  const list = document.getElementById('resolutions-list');
  incidentData.resolutions.forEach((res) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="small text-muted mb-2">
        <strong>${escapeHtml(res.resolved_by?.name || 'Sistema')}</strong>
        resolvió el ${new Date(res.resolved_at).toLocaleString('es-ES')}
        ${res.notes ? `<br><em>${escapeHtml(res.notes)}</em>` : ''}
      </div>
    `;
    list.appendChild(li);
  });
} else {
  document.getElementById('resolutions-section').style.display = 'none';
}
```

---

## 🧪 Testing

**Backend Tests:**

```bash
# Crear test: tests/Feature/Incidents/ResolutionAuditTest.php
php artisan make:test Incidents/ResolutionAuditTest --pest

# Test: al cambiar status → resolved, se inserta 1 fila en resolution_audits
test('resolution audit is created when incident is resolved', function () {
    $incident = Incident::factory()->create(['status' => 'in_progress']);
    $user = User::factory()->create();
    
    $this->actingAs($user)->put("/api/incidents/{$incident->id}/estado", [
        'status' => 'resolved',
    ]);

    expect(ResolutionAudit::where('incident_id', $incident->id)->count())->toBe(1);
    expect(ResolutionAudit::latest()->first()->resolved_by_user_id)->toBe($user->id);
});
```

**Manual Testing (DevTools):**

1. GET `/api/incidents/{id}` → incluye `resolutions` array
2. PUT `/api/incidents/{id}/estado` con `status=resolved`
3. Verificar que `resolution_audits` tiene 1 nueva fila
4. GET `/api/incidents/{id}` → `resolutions[0]` contiene timestamp + usuario

---

## 📝 Notas

- **No usa Publicador role** → mantiene 3 estados
- **No usa incident_verifications** → tabla ligera `resolution_audits` solo
- **Auto-insert via Observer** → no requiere endpoint confirm
- **Cumple E1 "verificación"** como historial de resoluciones
- **Seguro para presentación** → no rompe flujo actual

---

## 🔗 Contexto: Por Qué Opción C

| Aspecto | Opción A | Opción B | **Opción C (Elegida)** |
|---------|----------|----------|------------------------|
| Estados | 4 | 3 | 3 |
| Publicador | Sí | No | No |
| Verifications table | Sí | No | resolution_audits (ligero) |
| Confirm endpoint | Sí | No | No |
| Auditoría | Sí | No | **Sí (historial)** |
| Impacto | 🔴 Alto | 🟢 Bajo | 🟡 Mínimo |
| Presentación | ⚠️ Riesgo | ✅ Seguro | ✅ Seguro |
| E1 Cumplimiento | 100% | ~60% | **~85%** |

**Opción C es el balance:** cumple espíritu de E1 (auditoría de resoluciones) sin riesgo para presentación.

---

**Testeado por:** [Tu nombre]  
**Fecha:** 15 de julio de 2026  
**Estado:** 📋 Planificado
