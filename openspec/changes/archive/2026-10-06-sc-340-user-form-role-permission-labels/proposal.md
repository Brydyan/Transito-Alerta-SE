# Proposal: Fix user form role/permission labels (sc-340)

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`  
**Scope**: Mixto (backend + frontend). Backend corrige filtro de roles; frontend alinea contratos de permisos/labels con el wire real.  
**Ticket**: sc-340 (epic «⚠️ GeoReporta»)  
**Fecha**: 2026-09-27  
**Prioridad**: Media  
**Estado**: `spec_ready` (pendiente aprobación humana)

## Intent

Corregir cuatro defectos que aparecen en el formulario de usuarios (creación/edición):

1. El dropdown de roles lista roles legacy soft-deleted («roles que no existen en la base de datos»).
2. Las listas de permisos muestran UUIDs crudos (en lugar de `"ACTION resource"`).
3. El catálogo de permisos produce `undefined undefined` al mapear nombres de campos inexistentes.
4. La «Lista de permisos del usuario» queda vacía y puede lanzar `TypeError` al filtrar (shape incompatible + arrays hardcodeados).

## Diagnóstico original vs evidencia (por qué fue erróneo)

El diagnóstico del ticket afirmó tres puntos incorrectos:

- **«Los roles del dropdown están hardcodeados»** → Falso. El dropdown viene de `GET /api/users/form-data` (`frontend/.../new-user-form.component.ts:148` mapea `getFormData()`), no está hardcodeado.
- **«`first_name`/`last_name` producen `undefined undefined`»** → Falso. Ya existen guardas en `backend/src/modules/users/users.service.ts:119-120` (`?? ''`). No es la causa de RC3.
- **«La evidencia es `roles.component.spec.ts:31-35`»** → Ese fixture es **stale** (mockea nombres pre-0040: `admin_sistema`, `operador_sistema`, `admin_organizacion`, `operador_organizacion`, `usuario` y usa `rolId` numérico cuando el wire actual usa UUID). No representa el estado real de la DB.

El cuarto punto del ticket («UUIDs crudos y permisos vacíos») sí identifica síntomas, pero atribuye mal el origen: el contrato cambió con `database/migrations/0051_roles_permissions_uuid_format.sql` (permisos pasaron de strings `"ACTION resource"` a **UUIDs**). Los comentarios F6 que afirman formato string están **obsoletos** (patrón de «comentario que afirma garantía contraria al código» ya documentado en `openspec/ROADMAP.md`).

## Root causes (con evidencia exacta)

### RC1 — Roles soft-deleted en dropdown
- `backend/src/modules/users/users.service.ts:64-89` (`getFormData`): `roleRepo.find({ select, where, order })` **sin** `deletedAt: IsNull()`.
- Contraste: `backend/src/modules/roles/roles.service.ts:126-128` (`findAll`) **sí** filtra `deletedAt: IsNull()`.
- Migraciones: `0040_rename_roles.sql` renombró canónicos; `0059_sanitize_roles_matrix.sql` (header 1-20) documenta coexistencia legacy → soft-delete local.

### RC2 — UUIDs crudos (contrato roto post-0051)
- `database/migrations/0051_roles_permissions_uuid_format.sql`: normaliza `roles.permissions` (jsonb) de `"ACTION resource"` a **UUIDs** del catálogo.
- `backend/src/modules/roles/roles.service.ts:66-72` (`listPermissions`): devuelve `role.permissions ?? []` crudo.
- Comentario explícito: `backend/src/modules/roles/roles.service.ts:292-299` («F6 fix (post-0051): el wire de `roles.permissions` es UUIDs, no strings formateados»).
- Render crudo: `new-user-form.component.html:238` (`{{ perm }}` sobre `selectedRolePermissions().access`), `user-form.component.html:274` (`{{ perm }}` sobre `rolePermissions()`).
- Comentarios obsoletos: `users.service.ts:246-250`, `user-form.component.ts:107-113`, `user-form.component.html:252-255`.

### RC3 — `undefined undefined`
- `frontend/src/app/features/admin/users/services/users.service.ts:277-283` (`getPermissionsCatalog`): `items.map(p => \`${p.accion} ${p.recurso}\`.trim())`.
- Entidad real: `backend/src/entities/permission.entity.ts` → `{ id, resource, action, ... }` (no existen `accion`/`recurso`).
- `backend/src/modules/permissions/permissions.controller.ts:15-19` devuelve array plano `PermissionEntity[]`; `users.service.ts:267,278,425-431` asume envelope `{ data, meta }`.
- `SnakeCaseResponseInterceptor` transforma a snake_case; el mapeo debe derivarse del **wire real** (snake_case o entidad mapeada), no del DTO con nombres erróneos.

### RC4 — Permisos del usuario vacíos + riesgo TypeError
- `frontend/.../users/models/user.interface.ts:36-46` (`PermissionItem`): campos `permisoId, nombre, descripcion, recurso, accion` — **no existen** en wire (`id, resource, action`).
- `user-form.component.html:304` trackea `track perm.permisoId` (undefined). `318,322` usan `perm.nombre`/`perm.accion` (vacíos).
- `user-form.component.ts:119-124` (`filteredAllPerms`): `p.nombre.toLowerCase()` → **TypeError** al tipear en buscador.
- `users.service.ts:129-135` (`getUserById`): `permisosDirectos: []`, `permisosRol: []` hardcodeados con comentario «el endpoint `GET /api/users/:id` no devuelve el desglose». Esto evita marcar permisos aunque existan.

## Alcance

**In Scope**
- Backend: filtrar roles soft-deleted en `getFormData` (RC1). Alinear resolución de labels de permisos cuando roles traen UUIDs (RC2), sin romper contratos existentes donde sea posible.
- Frontend: corregir mapeo del catálogo de permisos (RC3), alinear modelo `PermissionItem`/wire y hacer `filteredAllPerms` null-safe (RC4), corregir renders/trackBy y evitar asumir campos inexistentes. Resolver labels de permisos rol/usuario usando catálogo (no hardcodear strings obsoletos).
- Tests: actualizar fixtures/specs afectados (`roles.component.spec.ts`, `users.service.spec.ts`, `new-user-form.component.spec.ts`, `user-form.component.spec.ts`) para reflejar contrato post-0051 (UUIDs, nombres canónicos) sin inventar hechos.

**Out of Scope (deuda externa declarada)**
- Extender `GET /api/users/:id` para devolver desglose completo de `permisosDirectos`/`permisosRol` (RC4 raíz completa). Si no se resuelve ahora, se documenta como **deuda externa declarada** en `tasks.md` con follow-up explícito (no bloquea archive). Ver decisión D3.
- Refactor global de comentarios F6 obsoletos fuera de archivos tocados (se corrigen solo donde afectan contratos modificados).

## Dependencias
- Ninguna migración DB nueva requerida. Solo correcciones de consulta/mapeo y alineación de contratos frontend/backend.
- Requiere leer contratos existentes: `backend/src/entities/permission.entity.ts`, migraciones 0040/0051/0059.

## Riesgos
- Cambiar mapeo de catálogo puede afectar otros consumidores (bajo). Aislado a módulo `users`.
- Alinear contratos sin romper permisos puede introducir regresión si asumimos strings. Mitigar con tests unitarios y null-safety.

## Decisión de autorización
Change mixto autorizado por el usuario. Se documenta explícitamente en design para evitar «changemix» inadvertido.

## Estrategia de entrega
`ask-on-risk` (preflight). Review Workload Forecast se calcula en `tasks.md`.
