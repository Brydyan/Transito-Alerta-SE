# Design: F1 — Alineación de menú y enrutado

## Technical Approach

El defecto es de **acoplamiento no verificado**: `menu-map.ts` y `app.routes.ts`
declaran rutas por separado y nada comprueba que coincidan. F1 no introduce un
mecanismo de sincronización automática (eso llega en F5 con menús en BD); introduce
una tabla única declarada contra las rutas reales, más un test que falla si vuelven
a divergir.

Ese test es el entregable duradero de la fase. Sin él, el mismo defecto reaparece
en cuanto alguien renombre una ruta.

## Architecture Decisions

**D1 — `MENU_MAP` sigue estático; el enrutado se alinea a él.**
Se rechaza adelantar F5 (menús en BD) para «arreglarlo bien de una vez»: F5 exige
migración, CRUD y pantalla de administración, y la navegación está rota **hoy**.
F1 cuesta horas; F5 cuesta una fase entera. Se separan a propósito.

**D2 — Placeholders por ruta, no entradas ocultas.**
Alternativa rechazada: emitir sólo las entradas que ya tienen pantalla y añadir el
resto fase por fase. Se descarta porque deja el sidebar cambiando de forma en cada
release y hace imposible validar el menú completo contra el mock. En su lugar, cada
destino pendiente registra una ruta que monta un placeholder compartido:

```ts
// frontend/src/app/features/placeholder/placeholder.component.ts
@Component({ selector: 'app-placeholder', standalone: true, /* … */ })
export class PlaceholderComponent {
  readonly title = input.required<string>();
  readonly phase = input.required<string>();   // 'F2' | 'F3' | 'F4' | 'F5'
}
```

Reutiliza `shared/components/empty-state`, ya existente. Cada registro lleva el
comentario `// PLACEHOLDER F<n>` para que sea grep-able.

**D3 — Contrato ampliado de `MenuEntry`.**

```ts
// backend/src/modules/menus/menu-map.ts
export interface MenuEntry {
  label: string;
  route: string;
  icon?: string;
  group?: string;   // NUEVO — encabezado de sección; ausente ⇒ sin encabezado
  order: number;    // NUEVO — orden determinista dentro del menú
}

interface MenuDefinition {
  route: string;
  requires: string;
  icon?: string;
  group?: string;
  order: number;
}
```

`order` es obligatorio en la definición y en la salida: hacerlo opcional invita a
que el orden dependa de la iteración de `Object.entries()`, que es exactamente la
fragilidad actual.

**D4 — Mapa resultante.**
Rutas tomadas de `app.routes.ts` cuando la pantalla existe; el resto son las rutas
que F2–F5 van a implementar, reservadas aquí.

| Clave (`label`) | `route` | `requires` | `group` | `order` | Estado |
|---|---|---|---|---|---|
| Dashboard | `/dashboard` | `READ incidents` | — | 10 | Existe |
| Inicio | `/inicio` | `READ incidents` | INCIDENCIAS | 20 | Placeholder → F4 |
| Lista de Incidencias | `/incidencias` | `READ incidents` | INCIDENCIAS | 30 | Placeholder → F3 |
| Mapa | `/mapa` | `READ incidents` | INCIDENCIAS | 40 | Placeholder → F4 |
| Reportar | `/reportar` | `CREATE incidents` | INCIDENCIAS | 50 | `citizen-report` (huérfano) |
| Usuarios | `/admin/users` | `READ users` | GESTIÓN | 60 | Existe |
| Roles | `/admin/roles` | `READ roles` | GESTIÓN | 70 | Existe |
| Organizaciones | `/organizaciones` | `READ organizations` | GESTIÓN | 80 | Placeholder → F2 |
| Categorías | `/categorias` | `READ incident-categories` | CATÁLOGOS | 90 | Placeholder → F2 |
| Ubicaciones | `/ubicaciones` | `READ geo-zones` | CATÁLOGOS | 100 | Placeholder → F2 |

**Reagrupación respecto al mock — resuelto (Q1, decidido por el equipo 2026-08-29).**
El mock 05-01 mete `Inicio`, `Reportar`, `Perfil` y `Mapa` bajo `CATÁLOGOS`. El equipo
confirmó que no es necesario replicarlo. Criterio aplicado:

- `CATÁLOGOS` queda reservado a **tablas de referencia que alimentan formularios**:
  Categorías y Ubicaciones. Nada más entra ahí.
- `Organizaciones` pasa a `GESTIÓN`: es una entidad con usuarios y ciclo de vida
  propio, no una lista de valores.
- `Inicio`, `Mapa` y `Reportar` pasan a `INCIDENCIAS`: las cuatro entradas del grupo
  son vistas del mismo objeto —feed, tabla, mapa y alta—, que es como el usuario las
  piensa.
- **`Perfil` sale del sidebar.** Ya está en el menú de usuario del encabezado
  (esquina superior derecha en todos los mocks). Duplicarlo en la navegación lateral
  es ruido.

Otras notas:
- `Controles` (mock 05-01, «Opciones de menú») **no** se incluye: su pantalla y su
  permiso nacen en F5.
- `Assignments` y `Comments` salen del menú. No tienen pantalla en ninguno de los
  18 mocks; los comentarios aparecen dentro del detalle de incidencia, no como
  sección. Sus permisos siguen existiendo y sus endpoints intactos.

**D5 — Rutas conservadas donde ya viven.**
`Usuarios` y `Roles` apuntan a `/app/admin/users` y `/app/admin/roles`. Alternativa
rechazada: mover a `/app/usuarios` y `/app/roles` por estética. El mock no muestra
URLs, mover implica tocar guards, breadcrumbs y enlaces existentes, y el beneficio
es nulo.

**D6 — El test de coherencia es el entregable de fondo.**
Un spec de backend importa `MENU_MAP` y contrasta el conjunto de `route` contra una
lista de rutas de `/app` mantenida en el propio test. Vive en backend porque
`MENU_MAP` es el origen y no hay import cruzado entre proyectos; el precio es
mantener la lista a mano, y ese precio es justamente lo que hace ruidosa —y por
tanto visible— cualquier divergencia futura.

## Data Flow

`GET /api/menus/my`
→ `MenusService.getMenuForUser(userId)`
→ `AuthService.getPermissionsByUserId()` (caché Redis `perm:v3:uid:*`, sin cambios)
→ filtra `MENU_MAP` por `definition.requires ∈ permissions`
→ ordena por `order` ascendente
→ `MenuEntry[]` con `{ label, route, icon?, group?, order }`
→ `SnakeCaseResponseInterceptor`
→ `MenuService.transformBackendMenu()` → `MenuItem[]` con `{ id, name, route, icon?, group?, children: [] }`
→ `formatRoutes()` antepone `/app`
→ sidebar agrupa por `group` (capacidad entregada en F0)

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/modules/menus/menu-map.ts` | Modificar (D3/D4) | `MENU_MAP` nuevo: español, `group`, `order`, rutas reales; retira `Assignments` y `Comments` |
| `backend/src/modules/menus/menus.service.ts` | Modificar (D3) | Propaga `group` y `order`; ordena por `order` antes de devolver |
| `backend/src/modules/menus/menus.service.spec.ts` | Modificar | Cubre agrupación, orden y filtrado por permisos |
| `backend/src/modules/menus/menu-map.spec.ts` | Nuevo (D6) | Test de coherencia rutas ↔ `app.routes.ts` |
| `frontend/src/app/core/services/menu.service.ts` | Modificar (D3) | `transformBackendMenu()` propaga `group`; tolera respuestas sin `group` |
| `frontend/src/app/core/models/menu.model.ts` | — | Sin cambios: `group` ya se añadió en F0 |
| `frontend/src/app/features/placeholder/` | Nuevo (D2) | Componente «en construcción» sobre `empty-state` |
| `frontend/src/app/app.routes.ts` | Modificar (D2/D5) | Registra `/incidencias`, `/ubicaciones`, `/categorias`, `/organizaciones`, `/inicio`, `/reportar`, `/mapa`; elimina el duplicado `Reportes` |

## Redis Caching Strategy

Sin cambios. `perm:v3:uid:*` cachea **permisos**, no menús; el menú se recalcula por
request. No se requiere invalidación al desplegar F1. Se documenta explícitamente
porque en la sesión previa esta caché sí fue la causa raíz de un menú vacío, y la
suposición contraria es un error fácil de repetir.

## Testing Strategy

- **Backend unit**: `MenusService` filtra por permisos, ordena por `order`, omite
  grupos que quedan vacíos tras el filtrado.
- **Backend de coherencia** (D6): toda `route` de `MENU_MAP` está en la lista de
  rutas de `/app`. Es el test que impide la reincidencia.
- **Frontend unit**: `transformBackendMenu()` propaga `group`; una respuesta sin
  `group` no lanza.
- **e2e (Playwright)**: autenticado como `master@tase.local`, recorrer cada entrada
  del sidebar y afirmar que ninguna aterriza en `ErrorPageComponent`. Es la
  aserción que corresponde uno a uno con el síntoma reportado.
- Verificación manual sugerida tras desplegar: login con `master@tase.local` /
  `ChangeMe!Demo2026` y clic en las 11 entradas.

## Cómo se decide qué menú ve cada usuario

Punto que conviene dejar explícito porque **cambia de modelo en F5**:

| Fase | Mecanismo | Granularidad |
|---|---|---|
| Hoy y F1 | `definition.requires` contrastado contra `users.permissions` | Un permiso por entrada; visible o no |
| F5 en adelante | Tabla `menu_option_roles` (rol × `can_read`/`can_write`) | Por rol, con lectura y escritura separadas |

Es decir: **hoy el menú se filtra por permiso, no por rol.** El rol influye sólo de
forma indirecta, porque `users.permissions` es una copia de `roles.permissions` tomada
al asignar el rol. El efecto observable coincide —`master` ve 11 entradas,
`operador_org` ve menos— pero el mecanismo es distinto, y la diferencia importa: dos
usuarios del mismo rol pueden divergir si a uno se le editaron los permisos a mano.

F5 sustituye ese filtrado por una matriz explícita rol × opción, que es lo que el
mock 05-01 exige. La razón de no adelantarlo está en D1.

## Open Questions

Ninguna. Q1 (agrupación del sidebar) quedó resuelta arriba, en D4.
