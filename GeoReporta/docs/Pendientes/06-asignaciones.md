# 06 — Asignaciones (`incidents.assignments`)

**Tipo:** Feature (backend stub)
**Severidad:** 🟠 Media
**Backend:** ✅ Stub y dominio eliminados · **Frontend:** N/A (no aplica) (verificado 07/07/2026)

> ✅ **COMPLETADO (verificado 07/07/2026)**
> - **Se adoptó la opción B del propio doc** (sección "Decisión previa crítica"): el flujo `claim` / `release` / `confirm` ya cubre la necesidad. No se construyen dos mecanismos paralelos para lo mismo.
> - `backend/app/Domains/Assignments/` fue **eliminado** del código (no existe el directorio).
> - La ruta `incidents.assignments` no aparece en `backend/routes/api.php` (búsqueda `grep -n "assignments"` retorna vacío).
> - La tabla `assignments` se dropeó vía migración `2026_07_05_000001_drop_assignments_table.php` (parte del stack zombie cleanup).
> - Frontend: el detalle de incidencia usa los botones `claim` / `release` / `confirmar`, no el `apiResource` anidado.
> - Si en el futuro se requiere asignación múltiple o historial formal, se puede revertir creando el modelo `Assignment` y haciendo que `claim`/`release` operen sobre él. Hoy no hace falta.
> - Ver [`00-INDEX.md`](./00-INDEX.md).

## Problema

Existe un `apiResource` anidado `incidents.assignments` con controller **stub**
(todos los métodos devuelven `['data' => []]`) y sin UI.

Puede solaparse con el flujo ya existente de **claim / release / confirm**, que sí
está implementado. Hay que definir si "assignments" es un modelo formal de
asignación (histórico, multi-operador, roles de asignación) o si es redundante.

## Estado actual

**Backend (stub):**
- `Route::apiResource('incidents.assignments', AssignmentController::class)->shallow()`
- `AssignmentController` — `index/store/show/update/destroy` → `['data' => []]`.
- Existe el enum `App\Domains\Assignments\Enums\AssignmentRole`.
- **No hay** modelo `Assignment` ni migración.

**Flujo alternativo YA implementado (en uso):**
- `POST /incidents/{incident}/claim` (`can:claim`)
- `POST /incidents/{incident}/release` (`can:release`)
- `POST /incidents/{incident}/confirmar` (`can:confirm`)
- El frontend (`incidencias.detail.component.js`) usa estos botones, **no** assignments.

## Decisión previa (crítica)

Antes de implementar, resolver la superposición:

- **A)** `assignments` es el modelo formal (una incidencia puede tener varias
  asignaciones con `AssignmentRole`, historial). Claim/release serían atajos que
  crean/cierran assignments por debajo. → Implementar modelo + migrar claim/release.
- **B)** Claim/release/confirm ya cubren la necesidad. → **Borrar**
  `AssignmentController`, la ruta y el enum. Menos superficie muerta.

Recomendado: **B** salvo que se requiera asignación múltiple o historial de
asignaciones con roles. No construir dos mecanismos para lo mismo.

## Alcance (si se elige A)

### Backend
- [ ] Modelo `Assignment` + migración: `incident_id`, `user_id`, `role` (`AssignmentRole`),
      `assigned_at`, `released_at`.
- [ ] Implementar `AssignmentController` real con policies.
- [ ] Reescribir claim/release/confirm para operar sobre assignments.

### Frontend
- [ ] UI de asignación en el detalle de incidencia (asignar operador, ver historial).
- [ ] Servicio del `apiResource` anidado.

## Criterios de aceptación

- No coexisten dos mecanismos de asignación no relacionados.
- Si se implementa: el `apiResource` devuelve datos reales y respeta policies.
- Si se descarta: no queda controller/ruta/enum stub sin uso.

## Archivos afectados

- `backend/app/Domains/Assignments/**`
- `backend/routes/api.php`
- `frontend/app/incidencias/pages/detail/incidencias.detail.component.js` (si se integra UI)
