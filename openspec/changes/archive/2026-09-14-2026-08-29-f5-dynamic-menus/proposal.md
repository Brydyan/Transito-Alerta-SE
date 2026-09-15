# Proposal: F5 — Menús dinámicos administrables

## Intent

El mock 05-01 («Opciones de menú») describe un sistema de menús **gobernado desde
base de datos**, muy por encima de lo que el backend implementa hoy.

`backend/src/modules/menus/menu-map.ts` es una constante TypeScript de cinco (once
tras F1) entradas planas. Cambiar el menú exige editar código, compilar y desplegar.

El mock exige, por cada opción de menú:

| Atributo del mock | `MENU_MAP` hoy |
|---|---|
| Nombre editable | clave literal en código |
| Ruta editable | literal en código |
| Icono editable | literal en código |
| **Orden** explícito | añadido en F1, aún en código |
| **Opción padre** (jerarquía padre/hijo) | inexistente |
| **Matriz de roles × lectura/escritura** | un único permiso `requires` por entrada |
| Separación roles de empresa principal / roles de cliente | inexistente |
| **Endpoints de API asociados** a la opción | inexistente |
| CRUD desde la interfaz | inexistente |

Los dos saltos de fondo son la **matriz de acceso por rol con lectura y escritura
separadas** —hoy es un solo permiso booleano por entrada— y la **asociación de
endpoints**, que convierte el menú en el punto donde se declara qué API necesita cada
sección para funcionar.

Es la fase más cara y va al final por eso: F1 ya dejó la navegación funcionando con
el mapa estático, así que aquí no hay urgencia operativa, sólo deuda de producto.

## Scope

### In Scope
- Migración: tablas de menús, acceso por rol y endpoints asociados
- Módulo backend con CRUD completo de opciones de menú
- Jerarquía padre/hijo con orden explícito
- Matriz de acceso rol × (lectura, escritura)
- Catálogo de endpoints disponibles y su asignación por opción de menú
- Reescritura de `GET /api/menus/my` para resolver desde base de datos
- Pantalla `/app/controles` (mock 05-01): árbol de menús, formulario de detalle,
  matriz de roles, asignador de endpoints con doble panel
- Migración de datos: las entradas de `MENU_MAP` pasan a filas

### Out of Scope
- Menús por organización (multi-tenant): el mock separa roles de empresa principal y
  roles de cliente, no menús por organización → ver Q1
- Versionado o histórico de cambios de menú
- Arrastrar y soltar para reordenar: el mock muestra un campo `ORDEN` numérico
- Descubrimiento automático de endpoints desde los controladores → ver Q2

## Capabilities

### New Capabilities
- `dynamic-menus`: menús administrables con jerarquía, acceso por rol y endpoints asociados

### Modified Capabilities
- `admin-panel-backend`: `GET /api/menus/my` deja de resolver contra una constante y
  pasa a resolver contra base de datos; el contrato de respuesta se conserva

## DB Schema Changes

Cuatro tablas. Numeración a reservar en `database/MIGRATION_LOG.md` al implementar.

**`menu_options`**
- `id` uuid PK · `name` text · `route` text · `icon` text NULL
- `parent_id` uuid NULL FK → `menu_options` (autorreferencia)
- `display_order` int · `is_active` bool · `deleted_at` timestamptz NULL
- Índice sobre `(parent_id, display_order)`

**`menu_option_roles`**
- `menu_option_id` uuid FK · `role_id` uuid FK
- `can_read` bool · `can_write` bool
- PK compuesta `(menu_option_id, role_id)`

**`api_endpoints`** — catálogo de endpoints asignables
- `id` uuid PK · `method` text · `path` text · `description` text
- `UNIQUE (method, path)`

**`menu_option_endpoints`**
- `menu_option_id` uuid FK · `endpoint_id` uuid FK
- PK compuesta

Más una migración de datos que traslada las entradas de `MENU_MAP` a `menu_options`,
con su acceso por rol derivado del `requires` actual.

## Permission Requirements (RBAC)

Permisos nuevos, sólo para roles administrativos:

| Permiso | Roles |
|---|---|
| `READ menu-options` | `master`, `operador_sistema` |
| `CREATE menu-options` | `master` |
| `UPDATE menu-options` | `master` |
| `DELETE menu-options` | `master` |

**Recordatorio del modelo denormalizado**: como en F4, la migración debe actualizar
`roles.permissions` **y** `users.permissions`, e invalidar `perm:v3:uid:*` tras el
despliegue.

## Domain Module Dependencies

- `backend/src/modules/menus` — se reescribe por completo
- `backend/src/modules/roles` — origen de la matriz de acceso
- `backend/src/modules/permissions` — coexiste; ver D2 del diseño
- `backend/src/modules/auth` — resolución de permisos, sin cambios

## Approach

Backend primero y en dos tramos: primero el esquema y la lectura
(`GET /api/menus/my` resolviendo desde base de datos, con el contrato de respuesta
intacto), después el CRUD y la pantalla de administración.

Ese orden permite validar la parte arriesgada —que el menú siga funcionando igual
cuando su origen cambia— antes de construir la interfaz que lo edita. Si la lectura
desde base de datos falla, el `MENU_MAP` sigue en el repositorio como referencia
para revertir.

## Dependencies

- **Depende de**: F0 (primitivos), F1 (contrato `MenuEntry` con `group` y `order`)
- **Bloquea**: nada. Es la última fase por diseño.

## Risks

- **R1 — Regresión de navegación.** Es la fase que puede volver a romper el sidebar,
  el defecto que F1 arregló. Mitigación: el test de coherencia de F1
  (`menu-map.spec.ts`) se adapta para validar las filas en base de datos, y la
  migración de datos se verifica comparando la salida del endpoint antes y después.
- **R2 — Rendimiento de la resolución.** Resolver menú con jerarquía y matriz de roles
  por petición es más caro que filtrar un objeto en memoria. Mitigación: caché en
  Redis con invalidación al escribir; ver D4.
- **R3 — Catálogo de endpoints desincronizado.** Si se puebla a mano, divergirá de los
  controladores reales. Ver Q2.
