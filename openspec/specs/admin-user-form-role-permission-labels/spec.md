# Specifications: User form role & permission labels (sc-340)

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`
**Capability deltas**: `admin-user-creation-form` (frontend), `admin-user-creation-form-backend` (backend), `users-admin` (integración)
**Scenarios**: 6 requirements · 11 scenarios (primary + edge cases)
**Componentes**: `UsersService.getFormData`, `RolesService.listPermissions`, `UsersService.getPermissionsCatalog` (frontend), `PermissionItem`, `NewUserFormComponent`, `UserFormComponent`

**Convención**: cada requirement tiene id estable `R<n>`, un solo `DEBE`, y se expresa como
escenario Given/When/Then con `Acceptance`. Cada `R<n>` declara el test concreto que lo cubre
(regla de trazabilidad de `docs/sdd/specs.md`).

---

## R1 — El dropdown de roles no debe ofrecer roles soft-deleted

`GET /api/users/form-data` DEBE excluir todo rol cuyo `deleted_at` no sea `NULL`.

### Scenario 1: Rol legacy soft-deleted presente en la tabla → no aparece en el dropdown

**Given** la tabla `roles` contiene un rol canónico `admin_org` (`deleted_at IS NULL`)
**And** contiene un rol legacy `admin_organizacion` con `deleted_at` no nulo (estado creado por `0059_sanitize_roles_matrix.sql`)
**And** `GET /api/roles` (`rolesService.findAll`) devuelve solo los canónicos

**When** un admin abre el formulario de creación de usuario (`GET /api/users/form-data` → `NewUserFormComponent.loadFormData`)

**Then** el array `roles` de la respuesta contiene `admin_org`
**And** no contiene `admin_organizacion`
**And** el dropdown renderizado no ofrece el rol legacy

**Acceptance**: dropdown y endpoint coinciden exactamente con el mismo criterio de visibilidad.

### Scenario 2: Simetría de filtro entre endpoints

**Given** un rol soft-deleted existe en la base

**When** se comparan `GET /api/users/form-data` y `GET /api/roles`

**Then** ninguno de los dos devuelve ese rol

**Acceptance**: la asimetría `where` entre `users.service.ts:64-89` y `roles.service.ts:126-128` está cerrada.

**Trazabilidad**: `users.service.spec.ts` → test de `getFormData` con repo mockeado que devuelve un rol con `deletedAt` definido; `roles.service.spec.ts` (existente) cubre el lado `findAll`.

---

## R2 — Los permisos de un rol se deben mostrar como etiqueta legible, no como UUID

`getRolePermissions` y `listPermissions` DEBEN entregar identificadores que la vista pueda convertir a `"ACTION resource"` usando el catálogo de permisos.

### Scenario 3: Rol con permisos post-0051 → la vista muestra `ACTION resource`

**Given** `roles.permissions` contiene UUIDs (estado tras `0051_roles_permissions_uuid_format.sql`)
**And** el catálogo de permisos expone las entradas correspondientes
**And** un admin selecciona ese rol en el formulario de creación

**When** se expande la vista de permisos del rol

**Then** cada fila muestra `"{action} {resource}"`
**And** no se muestra ningún UUID crudo

**Acceptance**: el valor crudo deja de llegar al template. El fix vive en la capa de
datos (`UsersService.getRolePermissions` resuelve los UUIDs antes de emitir), **no** en el
template — ver la Enmienda A-1 al pie de este spec.

### Scenario 4: Modo edición → mismo etiquetado que el modo creación

**Given** un usuario tiene un rol con permisos en UUID
**And** un admin abre el panel de edición de ese usuario

**When** se cargan los permisos del rol (`GET /api/roles/:id` → `getRoleById` → `rolePermissions()`)

**Then** cada fila muestra `"{action} {resource}"`
**And** `user-form.component.html:274` no renderiza el UUID crudo

**Acceptance**: los dos modos de presentación usan el mismo resolvedor de etiquetas.

### Scenario 5: UUID sin entrada en el catálogo → fallback explícito, no vacío

**Given** `roles.permissions` contiene un UUID que no existe en el catálogo de permisos

**When** se resuelve su etiqueta

**Then** la vista muestra un marcador explícito de permiso no encontrado (por ejemplo `permiso no encontrado`)
**And** no muestra la cadena `undefined`
**And** no lanza excepción

**Acceptance**: un UUID huérfano degrada de forma legible y no rompe el render.

**Trazabilidad**: `users.service.spec.ts` (frontend) → test de resolución de etiqueta con UUID conocido y con UUID ausente; `new-user-form.component.spec.ts` → test de render de la lista de permisos del rol.

---

## R3 — La proyección del catálogo de permisos no debe producir `undefined undefined`

`getPermissionsCatalog` DEBE proyectar usando los campos que el backend realmente expone.

### Scenario 6: Catálogo con entity real → etiquetas correctas

**Given** el backend responde el catálogo de permisos
**And** cada entrada expone el identificador del permiso, el recurso y la acción

**When** `getPermissionsCatalog` proyecta cada entrada

**Then** el resultado es `"{action} {resource}"`
**And** ninguna entrada contiene la cadena `undefined`

**Acceptance**: `users.service.ts:277-283` deja de leer `p.accion` / `p.recurso`.

**Trazabilidad**: `users.service.spec.ts` → test de `getPermissionsCatalog` con una entrada de catálogo que solo tiene `id`/`resource`/`action`.

---

## R4 — El cliente del catálogo debe tolerar el wire real (array plano)

`getPermissionsCatalog` y `getPermissions` DEBEN consumir la forma plana `PermissionEntity[]` que devuelve `GET /api/permissions`.

### Scenario 7: Respuesta array plano → el catálogo se puebla

**Given** `permissions.controller.ts:15-19` devuelve un array plano de permisos (no un envelope `{ data, meta }`)

**When** el frontend pide el catálogo

**Then** el servicio lo interpreta como la lista completa de permisos
**And** no lanza `TypeError` por `.data` inexistente
**And** `getPermissionsCatalog` recibe la lista, no un objeto vacío

**Acceptance**: `users.service.ts:267,278,425-431` deja de asumir un envelope inexistente.

**Trazabilidad**: `users.service.spec.ts` → test con respuesta HTTP que resuelve a un array plano.

---

## R5 — La lista de permisos del usuario debe mostrar etiquetas y no fallar al buscar

`filteredAllPerms` DEBE devolver una lista vacía (no lanzar excepción) cuando una entrada de permiso carece de nombre legible.

### Scenario 8: PermissionItem con la forma del wire real → lista poblada y con trackBy estable

**Given** la lista de permisos disponible para el usuario llega con el identificador, el recurso y la acción de cada entrada

**When** el panel de edición renderiza la lista de permisos del usuario

**Then** cada fila muestra una etiqueta legible
**And** el `trackBy` recibe un identificador real y no `undefined`
**And** `user-form.component.html:318,322` no renderizan campos inexistentes

**Acceptance**: el panel consume el modelo alineado al wire. La normalización ocurre en
`user-form.component.ts` (intake idempotente con `toPermissionItem`), no en los binds del
template — ver la Enmienda A-1 al pie de este spec.

### Scenario 9: El usuario escribe en el buscador de permisos → no lanza excepción

**Given** el panel de edición está abierto
**And** el usuario escribe texto en el buscador de permisos

**When** `filteredAllPerms` corre el filtro sobre la lista

**Then** no se lanza `TypeError`
**And** la lista se filtra por la etiqueta legible disponible

**Acceptance**: `user-form.component.ts:119-124` deja de llamar `.toLowerCase()` sobre un campo ausente.

### Scenario 10: Búsqueda sin coincidencias → lista vacía, sin crasheo

**Given** el usuario escribe un texto que no aparece en ninguna etiqueta de permiso

**When** `filteredAllPerms` corre el filtro

**Then** devuelve una lista vacía
**And** el template renderiza el estado vacío sin error

**Acceptance**: el filtro es total sobre la lista de permisos.

**Trazabilidad**: `user-form.component.spec.ts` → tests de render de la lista y de filtrado con texto coincidente / no coincidente; `users.service.spec.ts` → test de mapeo de la lista de permisos al modelo.

---

## R6 — La evidencia de tests no debe afirmar un contrato que el código ya no cumple

`roles.component.spec.ts` y los fixtures afectados DEBEN reflejar el contrato vigente (nombres de rol post-0040 e identificadores post-0051).

### Scenario 11: Fixture de roles desactualizado → deja de afirmar nombres legacy como si fueran el contrato

**Given** `roles.component.spec.ts:31-35` mockea `admin_sistema`, `operador_sistema`, `admin_organizacion`, `operador_organizacion`, `usuario` con `rolId` numérico

**When** ese fixture se usa para afirmar el contrato del listado de roles

**Then** el fixture no se usa como evidencia del estado real de la base
**And** se actualiza a los nombres canónicos post-0040 con identificadores del contrato vigente

**Acceptance**: ningún test afirma un contrato obsoleto como si fuera verdad actual.

**Trazabilidad**: `roles.component.spec.ts` → test del listado de roles con fixture canónico.

---

## Enmiendas

### A-1 — Corregidos los `Acceptance` que apuntaban al sitio equivocado del fix

**Fecha**: 2026-09-30, posterior al apply.

**Motivo**: R2 Scenario 3 y R5 Scenario 8 enunciaban su `Acceptance` apuntando a líneas de
template (`new-user-form.component.html:238`, `user-form.component.html:304,318,322`) como si
el fix fuera ahí. Al implementarlo se verificó que esos binds **ya eran correctos** para el
modelo alineado: `:238` y `:274` renderizan la etiqueta como string, `:304` ya trackeaba
`perm.permisoId`, `:318/:322` ya leían `perm.nombre`/`perm.accion`. El defecto era siempre el
**dato**: el service entregaba UUIDs crudos y el modelo `PermissionItem` sin poblar. Registrado
como **D-T2** en `apply-progress.md`.

**Qué cambió**: solo el puntero del `Acceptance`. Los `Given/When/Then` y los `DEBE` de cada
requirement quedan **intactos** — el comportamiento exigido se cumple igual, solo se corrige
dónde vive el arreglo.

**Por qué importa**: un `sdd-verify` ejecutado literal contra el acceptance original iba a
reportar como faltante un cambio que no debía existir, o peor, iba a "corregir" binds que ya
funcionaban. La Enmienda A-1 es la que evita esa lectura errónea.

**Corrección de conteo**: el encabezado decía «6 requirements · 10 scenarios». Hay **11**
scenarios (R6 aporta el Scenario 11).

