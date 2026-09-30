# Design: User form role & permission labels (sc-340)

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`
**Fecha**: 2026-09-27

## Regla que gobierna este diseño

> La mitad del código tiene razón y la otra mitad miente. Cuando dos lados del mismo
> repo discrepan sobre el mismo contrato, la mitad que ya está probada gana — y la otra
> se corrige copiando ese patrón, no inventando uno nuevo.

Este change es exactamente eso. Por eso el diseño **no** propone ningún mecanismo nuevo de
normalización: propone replicar en `users.service.ts` (frontend) el resolvedor que
`roles.service.ts` (frontend) ya tiene funcionando y testeado.

---

## D1 — RC1 (roles soft-deleted) se corrige en el backend

**Decisión**: `backend/src/modules/users/users.service.ts:64-89` (`getFormData`) DEBE aplicar
el mismo filtro que `roles.service.ts:126-128` ya aplica: `deletedAt: IsNull()`.

**Alternativa rechazada — filtrar en el frontend**: el dropdown recibiría la lista cruda y la
filtraría en el cliente. Se rechaza porque duplica la regla de visibilidad en un segundo
lugar que vuelve a quedar viejo, y porque oculta un defecto real del backend detrás de un
parche cosmético. La asimetría entre dos endpoints del mismo recurso es el defecto, no el
frontend.

**Nota de changemix**: el ticket dice «Frontend», pero RC1 es backend. El change es mixto y
fue autorizado explícitamente. Se registra acá para que no se lea como un accidental.

**Sin migración**: 0059 ya dejó los legacy soft-deleted. No se toca la base.

---

## D2 — Los labels de permisos se resuelven en el service de Angular

**Decisión**: replicar en `frontend/src/app/features/admin/users/services/users.service.ts`
el resolvedor que ya existe y funciona en
`frontend/src/app/features/admin/roles/services/roles.service.ts:145-185` (`getAllPermissions`).

Ese código ya resuelve, correctamente, los tres casos de este ticket:

```ts
// referencia probada — roles.service.ts:152-172
if (Array.isArray(res)) {
  rawItems = res;                                  // R4: array plano
} else if (res && typeof res === 'object') {
  rawItems = Array.isArray(res.data) ? res.data : [];
  totalPages = res.meta?.ultimaPagina ?? 1;         // R4: envelope
}

const mapped: PermissionItem[] = rawItems.map((p) => ({
  permisoId: p.id ?? '',
  nombre: p.nombre ?? `${p.action ?? ''} ${p.resource ?? ''}`.trim(),   // R3
  descripcion: p.descripcion ?? '',
  recurso: p.resource ?? '',
  accion: p.action ?? '',
}));
```

**Alternativa rechazada — endpoint backend que devuelva `"ACTION resource"`**: se rechaza por
tres razones, en orden de peso:
1. Ya existe un resolvedor funcional en el mismo repo, en el mismo dominio, para el mismo
   endpoint (`GET /api/permissions`). Agregar otro es crear el problema que estamos arreglando.
2. El catálogo de permisos es **informativo, no autoritativo** (precedente D3 del diseño del
   proyecto: `PermissionGuard` nunca consulta la tabla `permissions`). Un endpoint que compone
   strings pertenece a la capa de presentación, no de autorización.
3. Amplía el contrato HTTP del backend para un defecto de presentación del frontend.

**Verificación hecha antes de decidir**: `SnakeCaseResponseInterceptor` (`backend/src/main.ts:84`)
aplica `toSnakeCaseKeys` de forma genérica. `id`, `resource` y `action` son palabras simples
sin camelCase, **no se transforman**. El wire real de `GET /api/permissions` es
`[{ id, resource, action, deleted_at, created_at, updated_at }]` (array plano, confirmado en
`backend/src/modules/permissions/permissions.controller.ts:15-19`). Por eso el spec afirma
`id`/`resource`/`action` y no nombres snake_case inventados.

---

## D3 — La dualidad array/envelope se resuelve con el patrón existente, no con un helper global

**Decisión**: usar el mismo `Array.isArray(res) ? res : res.data ?? []` de
`roles.service.ts:157-162`, replicado en `users.service.ts`.

**Alternativa rechazada — un normalizador compartido** (`permissions-mapper.ts` importado por
ambos services): se rechaza porque un tercer lugar que hay que "actualizar en lockstep" es
exactamente la forma de defecto que este change está reparando. Dos copias de un patrón de
6 líneas, ya probadas, toleran mejor el drift que un helper compartido con dos consumidores
y una regla de sincronización implícita.

---

## D4 — `getStats` (backend) tiene el mismo defecto y queda FUERA de alcance con dueño

**Hallazgo verificado** (`backend/src/modules/roles/roles.service.ts:155-160`):

```ts
for (const perm of role.permissions ?? []) {
  allPerms.add(perm);
  const parts = perm.split(' ');
  if (parts.length === 2) {
    modules.add(parts[1]);
  }
}
```

Tras `0051_roles_permissions_uuid_format.sql`, `role.permissions` contiene **UUIDs**. Un UUID no
contiene espacio, así que `parts.length` siempre es `1` y **`modules` siempre queda vacío** —
la card de módulos de `/app/admin/roles` muestra cero. El comentario en `:148-150` advierte
literalmente este modo de falla («si el formato del permission string cambia, actualizá este
parser en lockstep con T3.1»); 0051 ya lo cambió.

**Decisión**: NO entra en este change. No es el síntoma reportado, y agregarlo sería scope
creep sobre un bug que el usuario no está viendo. Pero un ítem sin dueño es un defecto, así que
queda registrado como follow-up explícito en `tasks.md` con su causa raíz y su archivo.

---

## D5 — `roles.component` NO está roto: el mapeo existe

**Verificación**: `roles.component.ts` lee `r.nombre`, `role.rolId` y `role.permissionCount`, y
`Role` (`backend/src/entities/role.entity.ts:19`) define la columna como `name`, sin mapper en
el backend (`findAll` devuelve `RoleEntity[]` crudo). A primera vista parece el mismo defecto.

**No lo es**: `frontend/src/app/features/admin/roles/services/roles.service.ts:48-53` YA mapea
`r.id → rolId`, `r.name → nombre`, `r.permissions?.length → permissionCount`. El componente
consume una forma que el service garantiza.

**Decisión**: el único defecto en esa pantalla es el **fixture stale** de
`roles.component.spec.ts:31-35` (nombres pre-0040 + `rolId` numérico), que afirma un contrato
que el código ya no tiene. Entra como R6 (actualizar el fixture), no como fix de componente.

---

## D6 — `permisosDirectos` hardcodeados: deuda externa declarada, y por qué NO bloquea este ticket

`users.service.ts:129-135` deja `permisosDirectos: []` y `permisosRol: []` con el comentario
«el endpoint `GET /api/users/:id` no devuelve el desglose».

**Distinción que importa** (si se mezcla, el ticket no se cierra):
- La **«lista de permisos del usuario»** que el usuario reporta vacía es la lista de
  permisos **disponibles** con checkboxes, poblada desde `GET /api/permissions` vía
  `filteredAllPerms`. Eso lo arreglan R4 y R5.
- Lo que queda vacío por falta de endpoint es el **pre-check** de permisos ya asignados
  (`directPermissionIds` nunca matchea). Eso NO es lo reportado.

**Decisión**: deuda externa declarada, con follow-up con dueño en `tasks.md`. Extender
`GET /api/users/:id` toca el DTO de usuario, que consumen auditoría y varios servicios; meterlo
en un change de etiquetas sería el changemix que este repo ya suffered en sc-330.

---

## D7 — Los comentarios «F6 fix» obsoletos son parte del defecto, no documentación

`users.service.ts:246-250`, `user-form.component.ts:107-113` y
`user-form.component.html:252-255` afirman que el wire de permisos son strings `"ACTION resource"`.
Desde 0051 son UUIDs. Un comentario que afirma la garantía contraria a la del código es un
defecto activo: dirige al próximo que lo lea al debug equivocado.

**Decisión**: en los archivos que este change toque, esos comentarios se corrigen para
describir el contrato vigente. No se hace una barrida global (fuera de alcance), pero tampoco
se deja un comentario mintiendo en un archivo que acabamos de tocar.

---

## Contratos TypeScript (sin `any`)

```ts
// forma del wire real de GET /api/permissions (array plano, snake_case passthrough)
interface PermissionWireItem {
  id?: string;
  resource?: string;
  action?: string;
  deleted_at?: string | null;
}

// Both shapes: el endpoint puede devolver array plano o envelope; el type lo declara, no se castea.
type PermissionsWireResponse = PermissionWireItem[] | { data: PermissionWireItem[]; meta?: unknown };

// Projection: un solo lugar que decide la etiqueta
export function permissionLabel(p: {
  action?: string | null;
  resource?: string | null;
  nombre?: string | null;
}): string {
  const explicit = p.nombre?.trim();
  if (explicit) return explicit;
  const action = p.action?.trim() ?? '';
  const resource = p.resource?.trim() ?? '';
  return `${action} ${resource}`.trim();
}

// búsqueda null-safe: nunca llama a `.toLowerCase()` sobre un campo ausente
// ⚠️ Propuesta en el diseño, NO implementada así: ver D-T7 en apply-progress.md.
// El fix real fue inline en `UserFormComponent.filteredAllPerms` + normalización
// idempotente en el intake con `toPermissionItem`.
export function filterPermissions<T extends { nombre?: string | null }>(
  items: readonly T[],
  term: string,
): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((p) => (p.nombre ?? '').toLowerCase().includes(needle));
}
```

**Nota de nombre**: `PermissionItem` conserva `permisoId`/`nombre`/`recurso`/`accion` porque es
la forma que **consume el template** y que `roles.service.ts` ya produce. No se renombra el
modelo público: se corrige quién lo puebla. Renombrarlo tocaría `roles.component.html` y
`user-form.component.html` sin ganar nada.

---

## Archivos que cambian

**Backend** (2):
- `backend/src/modules/users/users.service.ts` — filtro `deletedAt` en `getFormData` (RC1).
- Tests de `users.service` — cobertura del filtro.

**Frontend** (5):
- `frontend/src/app/features/admin/users/services/users.service.ts` — `getPermissionsCatalog`,
  `getPermissions`, `getRolePermissions` alineados al wire (R2, R3, R4).
- `frontend/src/app/features/admin/users/models/user.interface.ts` — `PermissionItem` alineado al
  contrato real, y tipo del wire (R3, R4).
- `frontend/src/app/features/admin/users/user-form/user-form.component.ts` — `filteredAllPerms`
  null-safe (R5).
- `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts` +
  `.html` — render de labels resueltos (R2).
- `frontend/src/app/features/admin/users/user-form/user-form.component.html` — trackBy y render (R5).

**Tests** (5): `users.service.spec.ts`, `new-user-form.component.spec.ts`,
`user-form.component.spec.ts`, `roles.component.spec.ts` (R6), backend `users.service.spec.ts`.

**No cambia**: `openspec/specs/` (lo sincroniza `sdd-archive` tras verify), ninguna migración,
`roles.service.ts` backend (D4 es follow-up).

## Riesgo de contrato

Cambiar la proyección del catálogo afecta a todo consumidor de `getPermissionsCatalog` /
`getPermissions` en el módulo `users`. Se mitiga con el mapeo de D2, que produce **exactamente**
la forma que el template ya consumía antes de romperse — es decir, restaura el contrato, no lo
inventa. Riesgo: bajo.
