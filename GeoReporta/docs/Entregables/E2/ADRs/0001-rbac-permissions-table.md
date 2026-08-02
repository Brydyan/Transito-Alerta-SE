# ADR-0001: RBAC con tabla de permisos + patrón de policies

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

El sistema necesita controlar el acceso a recursos (incidencias, ubicaciones, organizaciones, etc.) según el rol del usuario. Los roles son tres: `SystemAdmin`, `OperadorOrganizacion`, `Publicador`, más el visitante sin auth. Los permisos específicos que cada rol tiene sobre cada recurso pueden cambiar con el tiempo a medida que el producto evoluciona y se agregan o quitan acciones.

¿Cómo modelar el control de acceso para que sea mantenible, modificable sin redeploy, y consistente a través de los 13 dominios del backend?

## Considered Options

1. **Roles hardcodeados con chequeos inline** — `if ($user->role === 'admin') ...` esparcidos por el código.
2. **Catálogo de permisos editable por UI + roles fijos** — Tabla `permissions` con CRUD completo desde la app.
3. **Gates dinámicos generados desde tabla `permissions` + policy pattern** — Tabla `permissions` solo editable por seed/migración, con policy abstracta que centraliza el chequeo y policies hijas por dominio. **Elegido.**

## Decision Outcome

**Opción 3: gates dinámicos + policy pattern.** Los roles son fijos (3 + visitante), pero los permisos que cada rol tiene sobre cada recurso se almacenan en la tabla `permissions` y la asociación rol↔permiso en `role_permissions`. Los Gates se generan al boot del framework recorriendo la tabla. Cada dominio define una Policy que hereda de `PermissionPolicy` y solo override'a cuando necesita lógica específica (multitenant, claim, etc.).

**Razones:**

- Modificar permisos no requiere redeploy (cambia la fila en `role_permissions` y se aplica al siguiente request).
- Centralizar el chequeo en `PermissionPolicy` evita duplicación entre los 13 dominios.
- Las policies hijas solo contienen lógica específica de su dominio, manteniendo cada archivo bajo ~100 líneas.
- Editar el catálogo de permisos por UI introduce complejidad innecesaria: los permisos son estructurales (definidos por devs, no por usuarios finales).

## Consequences

### Positive

- **Modificable en caliente**: agregar un permiso = INSERT en `permissions` + asociación en `role_permissions`. No requiere tocar código.
- **Reutilización alta**: una sola fuente de verdad para el chequeo de permisos (`PermissionPolicy`).
- **Auditable**: la tabla `permissions` muestra exactamente quién puede qué.
- **Extensible**: agregar un nuevo dominio = crear su policy heredando de `PermissionPolicy` (5 líneas: solo `resource()`).

### Negative

- **No editable por UI** (a propósito): cambiar el catálogo de permisos requiere migraciones. Es un trade-off aceptado.
- **Performance**: cada chequeo de permiso hace una query (o usa el cache del Gate). Para endpoints de alto tráfico, considerar cachear permisos por rol en Redis.
- **Debugging menos directo**: el flujo "usuario X hace acción Y" requiere entender la cadena Gate → Policy → método. Más profundo que un `if` inline.

## Implementation

**Archivos clave:**

- `backend/app/Domains/Shared/Http/Policies/PermissionPolicy.php` — clase abstracta base (38 líneas, 5 métodos).
- `backend/app/Domains/{Auth,Incidents,Locations,Organizations,Roles,Users,IncidentCategories,Comments,Menus,Notifications,Permissions}/Http/Policies/*Policy.php` — policies hijas.
- `backend/app/Providers/AppServiceProvider.php::boot()` — registra gates dinámicamente desde la tabla `permissions`.
- `backend/database/seeders/RolePermissionSeeder.php` — sembrado de permisos por rol.
- `backend/database/migrations/2026_06_15_000011_create_permissions_tables.php` — crea `permissions`, `roles`, `role_permissions`.

**Patrón de override** (ejemplo `IncidentPolicy`):

```php
public function update(User $user, Incident $incident): bool {
    if ($user->isSystemAdmin()) return true;
    if ($user->isOperator()) return $incident->organization_id === $user->organization_id;
    return parent::update($user, $incident) && $incident->organization_id === $user->organization_id;
}
```

## References

- [SRS v2.0 §2.3 Clases de Usuario](../Requisitos/SRS.md#23-clases-de-usuario-y-características)
- [SRS v2.0 §3.1.3 RF-SW-006 RBAC](../Requisitos/SRS.md#rbac)
- ADR-0004 Multitenant — explica el scope que se aplica encima de este patrón.
- ADR-0003 Claim/Release/Confirm — usa gates `can:claim`, `can:release`, `can:confirm` derivados de este patrón.
