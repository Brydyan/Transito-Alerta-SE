# ADR-0003: Flujo de incidencias: claim / release / confirm

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

El sistema necesita que un operador se haga responsable de una incidencia y que otro actor (con un rol distinto) verifique que la resolución fue correcta. El flujo debe ser fluido (los operadores no pueden quedar atascados con una incidencia que no pueden atender) pero controlado (un operador no puede tener 50 incidencias simultáneas).

¿Cómo modelar la responsabilidad sobre una incidencia sin caer en una asignación rígida de tipo "responsable + apoyo" que vimos en el SRS v1.0?

## Considered Options

1. **Tabla pivote `IncidenciaResponsable` con roles** (`responsable` | `apoyo`) — propuesta del SRS v1.0. Permite múltiples responsables por incidencia.
2. **Claim / Release / Confirm con un solo operador a la vez** + límite `max_active_claims` por organización. **Elegido.**
3. **Multi-operador con historial completo** — un modelo `Assignment` formal con quién estuvo asignado, cuándo entró, cuándo salió.

## Decision Outcome

**Opción 2: claim / release / confirm con un operador a la vez.** La responsabilidad sobre una incidencia la lleva un único OperadorOrg en un momento dado, identificado por `incidents.claimed_by` + `incidents.claimed_at`. El operador puede liberarla (release) para que otro la tome. La confirmación de la resolución la hace un Publicador cuya organización cubra la categoría de la incidencia, y se registra en `incident_verifications` (sin cambiar `incidents.status`).

**Razones:**

- **El dominio no requiere multi-asignación**: una incidencia la trabaja un operador a la vez. Multi-asignación complica sin agregar valor.
- **El control de carga se vuelve trivial**: `max_active_claims` por organización limita cuántas puede tener un operador activas simultáneamente.
- **El release natural evita "islas"**: si un operador se va de vacaciones, libera sus incidencias y otro las toma. No hay que limpiar asignaciones huérfanas.
- **Verificación separada del flujo principal**: el Publicador que confirma no es el operador que resolvió; garantiza segregation of duties.
- **Tabla `assignments` dropeada**: la primera iteración tenía esa tabla pero quedó como zombie code. Esta decisión formaliza su eliminación (migración `2026_07_05_000001_drop_assignments_table.php`).

## Consequences

### Positive

- **Modelo de datos simple**: dos columnas (`claimed_by`, `claimed_at`) en vez de una tabla aparte.
- **Control de concurrencia natural**: el `max_active_claims` se chequea atómicamente al hacer claim.
- **Fácil de razonar**: un solo "dueño" activo por incidencia.
- **Auditoría clara**: `status_history` (vía trigger, ver ADR-0002) captura cada transición.
- **Multitenant safe**: claim verifica que el operador sea de la misma organización que la incidencia.

### Negative

- **Sin historial de quién estuvo asignado antes**: solo se sabe quién la tiene ahora. Si se necesita ese historial, hay que crear el modelo `Assignment` después (no se descarta para futuro, simplemente no se construye hoy).
- **No hay "apoyo"**: si un operador necesita ayuda, no puede asignar a otro. Tiene que release y que el otro haga claim. Trade-off aceptado.
- **El `max_active_claims` es por organización, no por operador**: todos los operadores de una org comparten el pool. Si se necesita por operador, requiere refactor.

## Implementation

**Archivos clave:**

- `backend/app/Domains/Incidents/Services/IncidentClaimService.php` — `claim()` y `release()`.
- `backend/app/Domains/Incidents/Services/IncidentVerificationService.php` — `confirm()`.
- `backend/app/Domains/Incidents/Http/Policies/IncidentPolicy.php` — gates `can:claim`, `can:release`, `can:confirm`.
- `backend/app/Domains/Incidents/Models/IncidentVerification.php` — tabla `incident_verifications`.
- `backend/database/migrations/2026_07_05_000001_drop_assignments_table.php` — eliminación de la tabla zombie.
- `backend/database/migrations/2026_06_29_000005_add_max_active_claims_to_organizations_table.php` — columna `max_active_claims` en `organizations`.

**Máquina de estados efectiva:**

```
[creación]  --(crear)-->  pending
pending       --(asignar a org)-->  pending_operator
pending_operator  --(claim)-->  in_progress
in_progress    --(release)-->  pending_operator
in_progress    --(operador terminó)-->  resolved
resolved       --(confirm por Publicador)-->  resolved  + IncidentVerification
```

`confirm` NO cambia `status`; inserta en `incident_verifications`. La transición "resolved → cerrado" del SRS v1.0 se reemplaza por "verificación" como side-effect.

## References

- [SRS v2.0 §3.2 RF-FUNC-009, 010, 011](../Requisitos/SRS.md#responsabilidad-claimrelease--nuevo-en-v20)
- [SRS v2.0 §3.2 RF-FUNC-032 Verificaciones](../Requisitos/SRS.md#nuevos-requisitos-v20-rf-func-029-a-rf-func-035)
- [docs/Pendientes/06-asignaciones.md](../Pendientes/06-asignaciones.md) — doc cerrado que documenta la decisión de eliminar `assignments`.
- ADR-0002 Auditoría inmutable — cada cambio de estado es registrado automáticamente.
- ADR-0004 Multitenant — claim/release/confirm respetan el scope por organización.
