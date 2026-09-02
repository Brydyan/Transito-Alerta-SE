# Proposal: F1 — Alineación de menú y enrutado

## Intent

**El sidebar no navega a ninguna parte.** Las cinco entradas que devuelve
`GET /api/menus/my` caen todas al wildcard 404.

Cadena verificada:

1. `backend/src/modules/menus/menu-map.ts:19-25` declara cinco rutas:
   `/incidents`, `/assignments`, `/comments`, `/users`, `/roles`
2. `frontend/src/app/core/services/menu.service.ts:58-73` (`formatRoutes`) les
   antepone `/app` → `/app/incidents`, `/app/assignments`, `/app/comments`,
   `/app/users`, `/app/roles`
3. `frontend/src/app/app.routes.ts` no declara **ninguna** de esas cinco. Las que
   existen viven en otra parte: usuarios en `/app/admin/users`, roles en
   `/app/admin/roles`. Incidencias, asignaciones y comentarios no existen todavía.
4. Resultado: cada clic resuelve contra `path: '**'` → `ErrorPageComponent`

Es la conclusión natural del trabajo de la sesión anterior: se arregló que el menú
*se poblara* (permisos denormalizados + `FLUSHDB` de Redis), pero poblarlo dejó al
descubierto que los destinos no existen.

Deriva secundaria del mismo mapa:

| Aspecto | `menu-map.ts` hoy | `docs/mock` |
|---|---|---|
| Idioma de las etiquetas | Inglés (`Incidents`, `Users`) | Español (`Lista de Incidencias`, `Usuarios`) |
| Agrupación | No existe | `INCIDENCIAS` / `GESTIÓN` / `CATÁLOGOS` |
| Orden | Orden de inserción del objeto | Explícito en el mock |
| Cobertura | 5 entradas | 12 entradas |

## Scope

### In Scope
- Reescribir `MENU_MAP` con etiquetas en español, campo `group`, campo `order` y
  rutas que apunten a destinos reales
- Extender `MenuEntry` con `group` y `order`; propagarlos por `MenusService`
- Consumir `group` en `MenuService.transformBackendMenu()` (el sidebar ya sabe
  renderizarlo desde F0)
- Declarar rutas *placeholder* para los destinos que aún no tienen pantalla, de modo
  que ningún item del menú caiga al 404 antes de su fase
- Registrar el huérfano `features/citizen-report/` en `app.routes.ts`
- Corregir `path: 'Reportes'` (duplicado con mayúscula que reapunta al Dashboard)

### Out of Scope
- Implementar las pantallas reales de incidencias, catálogos, feed o mapa → F2–F4
- Menús dinámicos desde base de datos → **F5**. F1 mantiene `MENU_MAP` estático a
  propósito: es la corrección barata que desbloquea la navegación hoy, sin migración.
- Rediseño de las pantallas existentes → F6

## Capabilities

### New Capabilities
- ninguna

### Modified Capabilities
- `admin-panel-backend`: el contrato de `MenuEntry` gana `group` y `order`; las
  rutas del catálogo de menú pasan a ser las rutas reales del frontend

## DB Schema Changes

Ninguna. `MENU_MAP` sigue siendo una constante en TypeScript hasta F5.

## Permission Requirements (RBAC)

Sin permisos nuevos. Las entradas añadidas reutilizan permisos ya existentes en
`users.permissions`, verificados contra el seed:

| Entrada | `requires` |
|---|---|
| Lista de Incidencias | `READ incidents` |
| Usuarios | `READ users` |
| Roles | `READ roles` |
| Ubicaciones | `READ geo-zones` |
| Categorías | `READ incident-categories` |
| Organizaciones | `READ organizations` |

El usuario `master@tase.local` tiene los 35 permisos, así que ve el menú completo;
`operador_org` (15) verá un subconjunto — comportamiento correcto de
`MenusService.getMenuForUser()`, que no cambia.

## Domain Module Dependencies

- `backend/src/modules/menus` — se modifica `menu-map.ts` y el tipo `MenuEntry`
- `backend/src/modules/auth` — sin cambios; la resolución de permisos ya funciona
- Consumidores frontend: `MenuService`, `menuResolver`, `sidebar.component`

## Approach

Una sola tabla de verdad (`MENU_MAP`) que se declara **contra las rutas que
`app.routes.ts` realmente expone**, no contra un ideal. Para los destinos que aún
no existen se registra una ruta placeholder que renderiza un estado «en construcción»
usando el `empty-state` que ya está en `shared/components/`. Así el menú queda
navegable de punta a punta desde F1, y cada fase posterior sustituye su placeholder
por la pantalla real sin volver a tocar el menú.

Se conserva `/app/admin/users` y `/app/admin/roles` tal como están: mover esas rutas
para que se parezcan al mock sería churn sin beneficio, y el mock no muestra la URL.

## Dependencies

- **Depende de**: F0 (el sidebar debe saber renderizar `group` antes de que el
  backend lo envíe)
- **Bloquea**: F2, F3, F4 (sus pantallas cuelgan de estas rutas)

## Risks

- **R1 — Los placeholders pueden quedarse.** Mitigación: cada uno lleva un comentario
  `// PLACEHOLDER F<n>` y la fase correspondiente lo lista en su Definition of Done.
- **R2 — Caché de permisos en Redis.** Cambiar `MENU_MAP` no invalida `perm:v3:uid:*`,
  pero tampoco lo necesita: la caché guarda permisos, no menús. El menú se recalcula
  en cada request. Sin acción requerida — se documenta porque en la sesión previa
  esta caché sí fue la causa raíz de un menú vacío.
