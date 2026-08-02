# SC-127: Remover incidents.create de admin_sistema

**Estado:** ✅ Implementado  
**Fecha:** 2026-07-25  
**Ramas:** `alirr26/sc-127/quitar-permiso-create-incidencias-a-admin`

---

## Resumen

Se removió el permiso `incidents.create` del rol `admin_sistema` para reforzar la **Separación de Responsabilidades (SoC)** y el **Principio del Menor Privilegio (PoLP)**.

### Justificación

- **admin_sistema** gestiona y aprueba incidencias a nivel global, **no las reporta**
- Remover `incidents.create` evita ambigüedad de roles y refuerza seguridad
- Solo **operador_sistema**, **admin_organizacion**, **operador_organizacion** y **usuario** reportan incidencias

---

## Cambios Realizados

### 1. Backend - Seeder
**Archivo:** `backend/database/seeders/RolePermissionSeeder.php`

- Removida línea `['resource' => 'incidents', 'action' => 'create']` de `ADMIN_SISTEMA_PERMISSIONS`
- El seeder ahora define el estado inicial sin este permiso

### 2. Backend - Migración
**Archivo:** `backend/database/migrations/2026_07_25_225225_remove_incidents_create_from_admin_sistema.php`

- Migración que ejecuta DELETE en tabla `role_permission`
- Remueve el permiso de admin_sistema (id=1) en bases de datos existentes
- No tiene `down()` — cambio permanente

### 3. Sin Validación Defensiva
- No se agregó override en `IncidentPolicy::create()`
- La arquitectura es flexible: los permisos se validan via **Gates** basados en tabla `role_permission`
- A futuro, asignar el permiso via interfaz de roles (`/api/roles/{id}/sync-permissions`) será suficiente

---

## Matriz de Permisos Actualizada

| Rol | dashboard.view | incidents.view | incidents.create | incidents.update | incidents.delete | incidents.manage |
|-----|---|---|---|---|---|---|
| **admin_sistema** | ✓ | ✓ | **✗** | ✓ | ✓ | ✓ |
| **operador_sistema** | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| **admin_organizacion** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **operador_organizacion** | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| **usuario** | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

---

## Flujo de Autorización (sin cambios)

```
IncidentController::store()
  ↓
$this->authorizeResource(Incident::class)
  ↓
IncidentPolicy::create(User $user)
  ↓
parent::create($user)  // PermissionPolicy::create
  ↓
$user->can('incidents.create')  // Gate dinámico
  ↓
Valida tabla role_permission
```

---

## A Futuro: Reasignar el Permiso

Si necesitas que `admin_sistema` tenga `incidents.create` nuevamente:

### Opción 1: Via Interfaz de Roles (Recomendado)
1. Admin accede a `/roles/1` (admin_sistema)
2. UI muestra catálogo de permisos via `/api/roles/available-permissions`
3. Admin marca `incidents.create`
4. UI llama `POST /api/roles/1/sync-permissions` con array de permission_ids
5. Se actualiza tabla `role_permission`

### Opción 2: Via Nueva Migración
```php
// Nueva migración
DB::table('role_permission')->insert([
    'role_id' => 1,
    'permission_id' => Permission::where('resource', 'incidents')
        ->where('action', 'create')
        ->value('permission_id'),
    'created_at' => now(),
    'updated_at' => now(),
]);
```

### Opción 3: Editar Seeder
Agregar la línea de vuelta a `ADMIN_SISTEMA_PERMISSIONS` y ejecutar `php artisan db:seed --class=RolePermissionSeeder`

---

## Impacto en Funcionalidades Existentes

✅ **Operador Sistema:** Puede crear incidencias (permiso intacto)  
✅ **Admin Organización:** Puede crear incidencias (permiso intacto)  
✅ **Usuarios:** Pueden reportar incidencias (permiso intacto)  
✅ **Admin Sistema:** Puede gestionar/aprobar/actualizar incidencias (permisos intactos)  
✅ **Admin Sistema:** AHORA no puede crear incidencias vía API (bloqueado por Gate)

---

## Testing

Verificar:
1. `php artisan migrate` ejecuta migración sin errores
2. `php artisan db:seed --class=RolePermissionSeeder` re-applica permisos correctamente
3. admin_sistema NO ve botón "Nueva Incidencia" en frontend
4. admin_sistema intenta POST /api/incidents → respuesta 403 Forbidden
5. operador_sistema/admin_organizacion/usuario pueden crear normalmente

---

## Archivos Modificados

- `backend/database/seeders/RolePermissionSeeder.php` — Removida línea de permiso
- `backend/database/migrations/2026_07_25_225225_remove_incidents_create_from_admin_sistema.php` — Nueva migración
- `docs/MejorasIng/SC-127-remover-incidents-create-admin-sistema.md` — Esta documentación

---

## Referencias

- **Issue:** SC-127
- **Branch:** `alirr26/sc-127/quitar-permiso-create-incidencias-a-admin`
- **Arquitectura:** RBAC (Role-Based Access Control)
- **Patrón:** Laravel Gates + Policies + role_permission table