# ADR-0004: Multitenant por `organization_id` con scope en policies

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

El sistema va a ser usado por múltiples organizaciones (municipalidades, empresas de servicios, etc.) que no deben ver ni editar los datos de las demás. Hay que aislar los datos de cada organización de forma confiable, sin que el código de aplicación tenga que acordarse de filtrar manualmente en cada query.

¿Cómo modelar la separación entre organizaciones?

## Considered Options

1. **Base de datos por organización** (`multi-tenant database-per-tenant`).
2. **Schema por organización dentro de la misma BD** (`schema-per-tenant`).
3. **Row-level con `organization_id` en cada tabla, enforced en policies de Laravel** (no en la BD). **Elegido.**
4. **Row-level con `organization_id` + Row-Level Security (RLS) de PostgreSQL** (enforced en la BD).

## Decision Outcome

**Opción 3: row-level con enforcement en application layer.** Cada tabla "tenant-scoped" tiene una columna `organization_id` (nullable solo para `SystemAdmin`). Las Policies de Laravel verifican que `user.organization_id === model.organization_id` (o que el usuario sea `SystemAdmin`). Las queries usan Eloquent scopes globales donde aplica.

**Razones:**

- **Simplicidad operacional**: una sola BD, un solo deploy, un solo backup.
- **Cross-tenant queries posibles**: el `SystemAdmin` puede listar incidencias de todas las orgs para el dashboard global, lo que no es posible con DB-per-tenant.
- **Migración centralizada**: cambiar el schema aplica a todas las orgs a la vez.
- **Suficiente para el caso de uso**: las orgs no tienen requisitos de compliance que exijan aislamiento físico.
- **PostgreSQL RLS queda como upgrade futuro** si la complejidad lo amerita (ver "Negative Consequences").

## Consequences

### Positive

- **Una sola BD y un solo deploy**: menor costo operacional.
- **Cross-tenant reporting trivial**: un SystemAdmin puede listar todas las orgs sin federación.
- **Multitenant sin sacrificar JOINs**: se pueden hacer queries entre tenants si se necesita (e.g. "todas las incidencias de la categoría X en el país").
- **Escalabilidad horizontal vía particionamiento**: si una org crece mucho, se puede particionar la tabla por `organization_id` sin cambiar el modelo de la app.

### Negative

- **El aislamiento depende de la disciplina del código**: un `Incident::all()` sin scope filtra datos de otras orgs. Mitigación: tests de `TenantScopingTest` que verifican el aislamiento.
- **Sin defensa en profundidad en la BD**: si la app tiene un bug, la BD no lo detiene. RLS (PostgreSQL) agregaría una segunda capa pero hoy se considera over-engineering.
- **Backups incluyen datos de todas las orgs**: si una org pide "borrar mis datos" (GDPR-style), requiere DELETE por `organization_id`, no drop de schema.
- **`SystemAdmin` bypass**: si la verificación se rompe, el admin ve/modifica todo. Mitigación: tests específicos para el bypass.

## Implementation

**Archivos clave:**

- `backend/app/Domains/Users/Models/User.php` — `organization_id` (nullable).
- `backend/app/Domains/Incidents/Models/Incident.php` — `organization_id`.
- `backend/app/Domains/Organizations/Models/Organization.php` — `parent_id` (jerarquía) + `incident_category_id` + `max_active_claims`.
- `backend/app/Domains/Incidents/Http/Policies/IncidentPolicy.php` — `view`, `update`, `delete` chequean scope; `claim`/`release`/`confirm` también.
- `backend/app/Domains/Users/Http/Policies/UserPolicy.php` — `view`, `update`, `delete` chequean scope.
- `backend/app/Domains/Organizations/Http/Policies/OrganizationPolicy.php` — `view`, `update` chequean scope.
- `backend/tests/Feature/TenantScopingTest.php` — tests que verifican que un OperadorOrg no ve datos de otra org.
- `backend/app/Domains/Users/Models/User.php` — métodos `isSystemAdmin()`, `isOrganizationAdmin()`, `isOperator()` que consultan `role.name`.

**Patrón típico en una policy:**

```php
public function view(User $user, Model $model): bool {
    if (! parent::view($user, $model)) return false;       // gate dinámico
    if ($user->isSystemAdmin()) return true;               // bypass admin
    return $model->organization_id !== null
        && $model->organization_id === $user->organization_id;
}
```

**Regla de oro:** toda policy tenant-scoped debe tener el triple `parent::xxx() → isSystemAdmin() bypass → scope check`.

## References

- [SRS v2.0 §3.2 RF-FUNC-031 Scoping Multitenant](../Requisitos/SRS.md#nuevos-requisitos-v20-rf-func-029-a-rf-func-035)
- [SRS v2.0 §2.3.1 SystemAdmin](../Requisitos/SRS.md#231-systemadmin) — bypass documentado.
- ADR-0001 RBAC — el patrón de policies que se reutiliza para el scope.
- ADR-0003 Claim/Release/Confirm — las acciones específicas que heredan este scope.
- ADR-0007 PostGIS — la BD ya está atada a PostgreSQL, lo que deja la puerta abierta a RLS futuro.
