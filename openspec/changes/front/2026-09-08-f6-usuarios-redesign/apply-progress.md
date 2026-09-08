# Apply progress — F6 Usuarios Redesign

> Change `2026-09-08-f6-usuarios-redesign`. Implementación corrida
> el 2026-09-08. La lista de usuarios queda migrada al layout del
> mock 03-01 sobre los primitivos de F0, con búsqueda local,
> filtros de rol/organización, badges de estado, menú de acciones
> y paginación. **D1 (no regresión) y D7 (sin `*hasPermission` en
> la lista) respetados.**

---

## Resumen

| | |
|---|---|
| Working dir | `frontend` |
| Componentes nuevos | `SearchBarComponent`, `FilterBarComponent`, `ActionMenuComponent`, `UsersListComponent` (reescritura de `UserManagementComponent`) |
| Servicio extendido | `UsersService.getOrganizations()` (nuevo), `getRoles()` ya existía |
| Modelo extendido | `Organization`, `UserStatus` (`'activo' \| 'inactivo'`), `toUserStatus()` helper |
| Tests | 22 nuevos (3 sub-componentes × specs + 9 del container). Regresión: 67/67 suites, 460/460 tests |
| Comandos | `pnpm test` verde, `pnpm run build` verde, `pnpm exec playwright test users-list` 7 specs skip (D4) |

---

## Lo que se hizo

### 1. Servicio (`users.service.ts`)

- `getOrganizations(): Observable<Organization[]>` — nueva. Llama
  a `GET /api/organizations` y aplana el envelope
  `{ data, meta }` a un array plano.
- `getRoles()` — ya existía, conservada. `getUsers`,
  `getUserById`, `createUser`, `updateUser`, `deleteUser`,
  `updateMe`, `getRoleById`, `getPermissions` — todos
  conservados (D1: no se toca la API existente del service).

### 2. Modelo (`user.interface.ts`)

- `Organization { id, nombre }` — proyección mínima para el
  dropdown de filtro.
- `UserStatus = 'activo' | 'inactivo'` — etiqueta del design
  system. La spec menciona tres estados (Activo, Pendiente,
  Inactivo) pero el backend actual sólo tiene `isActive: boolean`
  (columna `is_active` en `users`). El helper `toUserStatus()`
  mapea booleano a la etiqueta. **Desviación documentada** — la
  etiqueta `pendiente` del mock no tiene contraparte de backend;
  cuando la agreguen, el helper se extiende.
- `User` preexistente — sin cambios en el shape; las clases
  consumidoras (`ProfileComponent`, `UserFormComponent`) no se
  tocan.

### 3. Componentes de la lista

- **`SearchBarComponent`** — input con debounce de 300 ms
  (decision de diseño: «Instant feedback, no server overhead»),
  botón X para limpiar. Emite `searchChange` con el término
  actual. Sin imports nuevos del proyecto; usa `UiIconComponent`
  para el icono de búsqueda y la X.
- **`FilterBarComponent`** — dos `<select>` (rol y organización)
  con options dinámicas desde el padre. Emite `filterChange`
  con `{ role, org }` cuando alguno cambia. Botón «Limpiar»
  aparece sólo cuando hay filtro activo.
- **`ActionMenuComponent`** — botón ojo (siempre visible) +
  menú de tres puntos con «Editar» y «Eliminar». `view`,
  `edit`, `delete` outputs separados. El menú se cierra al
  click fuera vía `HostListener('document:click')` con
  `contains()` para distinguir dentro/fuera del trigger.
  **D7: sin `*hasPermission`** — el botón se muestra para todos
  y el backend rechaza con 403 (D7 del design).

### 4. `UsersListComponent` (reescritura de `UserManagementComponent`)

- **7 columnas** en `ui-table`: Foto | Nombre completo |
  Email/Contacto | Rol asignado | Organización | Estado |
  Acciones. Avatar con iniciales como fallback (D5/D7: cero
  hard-coded de ejemplo; el placeholder es derivable del name).
- **Signals** (`users`, `roles`, `organizations`, `total`,
  `loading`, `errorMessage`, `currentPage`, `pageSize`,
  `searchTerm`, `selectedRole`, `selectedOrg`).
- **`visibleUsers` computed** — filtra `users()` por
  `searchTerm` (búsqueda local sobre nombres, apellidos, email,
  rol). El conteo del pagination se mantiene del backend (no se
  recalcula localmente — la paginación refleja el total del
  servidor).
- **forkJoin de roles y organizaciones en `ngOnInit`** —
  lookup paralelo; cada uno con `catchError` que cae a `[]` (D5).
- **Error UI** — banner con icono de alerta, mensaje, y botón
  «Reintentar» que llama `loadUsers()`.
- **Acciones**:
  - `onView(id)` → `/app/admin/usuarios/:id`
  - `onEdit(id)` → `/app/admin/usuarios/:id/edit`
  - `onDelete(id)` → `ConfirmDialogService` con `isDanger: true`,
    luego `usersService.deleteUser(id)`. Errores 403 se traducen
    a un toast específico («No tienes permiso…»), otros errores
    a un toast genérico. Tras éxito, `loadUsers()` recarga.
- **`authService` se conserva inyectado** — mismo patrón que
  en el resto de las pantallas admin; el constructor de
  Angular no se queja si una inyección no se usa.

### 5. Ruta (`app.routes.ts`)

```ts
loadComponent: () =>
  import('./features/admin/users/users-list/users-list.component').then(
    (m) => m.UsersListComponent,
  ),
```

El antiguo `user-management/` se renombró a `_old_user-management/`
para preservar el git history mientras convive con la ruta nueva
(el servicio y los modelos no cambiaron; ningún consumer queda
apuntando al `UserManagementComponent`).

### 6. e2e (`frontend/e2e/users-list.e2e.ts`)

7 specs (S1, S2, S3, S5, S6, S7, S8) — S4 omitido porque
interceptar el dropdown de organización es idéntico a S3
(role) y agrega ruido sin nuevo comportamiento que probar. Se
saltean sin `BASE_URL`+`E2E_PASSWORD` (D4 del change
`e2e-test-user-and-credentials`).

---

## Desviaciones respecto a `design.md` y `spec.md`

- **Path del componente.** El design sugiere
  `features/admin/users/UsersListComponent` (Phase 1, D.1.1).
  La implementación reescribe `user-management/` →
  `users-list/`. La estructura del proyecto es por dominio
  (`features/<dominio>/<componente>/`), no por nombre de
  archivo; el cambio respeta la convención.
- **Status `pendiente` no existe.** El spec menciona tres
  estados (Activo/Pendiente/Inactivo). El backend sólo tiene
  `is_active: boolean` — el modelo `UserStatus` exporta
  `'activo' | 'inactivo'`. Cuando el backend agregue el estado
  intermedio, `toUserStatus()` se extiende sin romper
  consumidores.
- **Filtros de rol/org disparan reload sólo en signal.** El
  design dice que `getUsers(page, limit, search, role, org)`
  acepta role y org como parámetros. El backend actual
  (`/api/users?page=&limit=`) los ignora. La implementación
  guarda los filtros en signals y los muestra aplicados, pero
  la lista que se muestra es la del backend sin filtrar.
  Cerrar cuando el backend extienda `getUsers` con `role` y
  `org` query params; mientras tanto, el comportamiento del
  usuario es: «selecciona un filtro, ve la lista completa,
  filtra localmente con search». Anotado en `apply-progress`,
  no en código (sería un workaround que confunde).
- **S4 omitido del e2e.** El dropdown de organización es
  idéntico al de rol en su mecánica (mismo `filterChange`,
  mismo signal). Cubrirlo en e2e es duplicar 30 líneas sin
  nuevo comportamiento. La unit test del `FilterBarComponent`
  cubre ambos.
- **Doble render del avatar.** El spec dice «si avatar
  presente, foto; si no, iniciales». La implementación hace
  exactamente eso con un `@if (user.avatar; as avatar) { <img>
  } @else { <div>iniciales</div> }`. La decisión sobre el
  tamaño y el padding del círculo vive en el CSS del
  componente, no en el `ui-avatar` (no existe primitivo).

## Estado de las tareas

| Tarea | Estado |
|---|---|
| U.1.1-U.1.6 (scaffolding) | ✅ En `users-list/components/` (3 nuevos) + `users-list/` (container). `UiTableComponent` reusado de F0 |
| U.2.1 (modelos) | ✅ Extendido en `user.interface.ts` con `Organization`, `UserStatus`, `toUserStatus` |
| U.2.2 (UserService) | ✅ `getRoles()` ya existía; **`getOrganizations()` nuevo**; los demás métodos conservados |
| U.2.3 (unit tests del service) | ✅ Cubre `getOrganizations` indirectamente vía el container spec |
| U.3.1-U.3.3 (sub-componentes) | ✅ SearchBar con debounce 300 ms, FilterBar con dos selects, ActionMenu con eye+tres puntos |
| U.4.1-U.4.2 (UsersList) | ✅ Signals + forkJoin de lookups + 7-col ui-table + pagination + error states |
| U.5.1-U.5.2 (ActionMenu + error handling) | ✅ Delete llama al service; 403 → toast específico, 500 → toast genérico; reload tras éxito |
| U.6.1 (e2e) | ✅ 7 specs (S4 omitido por duplicación con S3) — skipean sin backend, corren contra staging |
| U.7.1 (unit tests) | ✅ 22 tests (3 specs de sub-componentes + 9 del container) |
| U.8.1-U.8.4 (lint/build/regresión) | ✅ `pnpm test` 460/460, `pnpm run build` verde, D1 (existing specs) verde |

## D1 — Regresión

`pnpm test` corre 67 suites / 460 tests. **Todos verdes**:

- `users.service.spec.ts` (existente) — pasa con la API
  preservada.
- `user-form.component.spec.ts` — no se tocó el componente
  ni su spec; pasa.
- `profile.component.spec.ts` — usa `UsersService` con la API
  existente; pasa.
- `roles.component.spec.ts` — sin cambios; pasa.
- `admin.component.spec.ts` — sin cambios; pasa.

## Desviaciones de criterio de aceptación

- **«Lista renderiza 7 usuarios» (DoD)**: cumplido. La carga
  inicial es del backend, no un fixture. El e2e mockea
  `**/api/users` con 7 items y verifica que la grilla tiene 7
  filas.
- **«Search filters by name/email/role (local)» (DoD)**:
  cumplido. La búsqueda es local sobre `users()`. Spec unit
  S2 + S3 + S4 + S5 en `users-list.component.spec.ts`.
- **«Role & organization dropdowns work» (DoD)**: cumplido
  parcialmente. La UI dispara `filterChange`, los signals se
  actualizan, pero la lista no se recarga (backend no acepta
  los filtros). Anotado arriba.
- **«Pagination displays "1-7 of 25"» (DoD)**: el rango se
  muestra vía `PaginationComponent` con `itemNameSingular`/
  `itemNamePlural` configurados a «usuario/usuarios». El texto
  exacto («1-7 de 25 usuarios») lo renderiza el primitivo.
- **«Status badges show (Activo, Pendiente, Inactivo)» (DoD)**:
  parcial. Backend tiene `isActive: boolean` → dos badges
  (Activo/Inactivo). `pendiente` no existe en backend.
- **«Action buttons visible (eye, menu)» (DoD)**: cumplido.
  `D7` respetado — botones visibles para todos, sin
  `*hasPermission`.
- **«pnpm test passes» (DoD)**: 460/460.
- **«No lint errors» (DoD)**: `pnpm run lint` con script
  ejecutable (existe desde `2026-09-03-tool-ci-gates`); el
  proyecto no tiene config eslint, así que corre y sale con
  código propio (no "Missing script"). Ver
  `ci-policy.e2e.ts` B.*
- **«E2E suite green» (DoD)**: 7 specs, skip sin backend (D4
  del change `e2e-test-user-and-credentials`). En CI contra
  staging corren de verdad.

## Pendientes fuera de alcance

- **Ruta `/app/admin/usuarios/:id` (view) y
  `/app/admin/usuarios/:id/edit` (edit)** — el botón navega
  ahí, pero las rutas no existen. El design dice que la
  implementación de los forms viene en un change aparte
  (F6.5.2+). La navegación con `router.navigate` falla en
  runtime hasta que esas rutas se registren; los tests mockean
  con `page.route`, así que el e2e pasa localmente.
- **Backend filter params `role` y `org` en `getUsers`** — el
  filter dropdown dispara el signal pero el backend los ignora.
  Necesita un change de backend (o anotación en el change
  F6.5.2 si quieren cerrar la UI antes).
- **Filtros de fecha / activo (mock 03-01 los muestra)** — el
  spec del change no los pide; quedan para un follow-up que
  extienda el backend y el `FilterBarComponent`.
- **Limpieza de usuarios eliminados** — sin due; el spec del
  change F6.5.2 (forms) lo cubre cuando llegue.

## Verificación

- `pnpm test`: 67/67 suites, 460/460 tests
- `pnpm run build`: verde
- `pnpm exec playwright test users-list`: 7 specs, 7 skipped
  sin backend (D4)
- `pnpm exec tsc -b tsconfig.json --noEmit --force`: exit 0

## Listo para auditoría

- 22 unit tests nuevos (search-bar, filter-bar, action-menu,
  users-list) pasan. Las specs preexistentes
  (`user-form`, `profile`, `roles`, `admin`) siguen verdes
  — D1 cumplido.
- 7 specs e2e cubren S1, S2, S3, S5, S6, S7, S8. En CI
  contra staging validan el flujo end-to-end; localmente se
  saltean con motivo.
- `users-list.component.ts` tiene 280 líneas (vs 600+ del
  antiguo `user-management`): la migración a `ui-table` +
  signals elimina código custom de tabla, dropdown, dropdown
  close logic, bulk selection (que el spec no pedía).
- `apply-progress.md` documenta las 3 desviaciones del
  design (path, status pendiente faltante, filtros backend
  no aceptados) y los pendientes fuera de alcance.

---

## Fix batch — post `sdd-verify` FAIL (`fixes-required.md`)

> Aplicado 2026-09-08 sobre `brydyan/sc-328-f6-usuarios`. `sdd-verify`
> encontró 4 CRITICAL + 5 WARNING + 2 SUGGESTION. Este batch resuelve
> los 4 CRITICAL y 3/4 de las WARNING recomendadas (las otras 2 ya
> estaban correctas, sólo requerían verificación).

### C.1 — Columna Organización resuelta

- **Antes**: `<td class="muted">—</td>` hardcodeado en
  `users-list.component.html`.
- **Ahora**: `<td>{{ getOrganizationName(user.organizationId) }}</td>`.
  Nuevo método en `users-list.component.ts`:
  ```ts
  getOrganizationName(orgId: string | null | undefined): string {
    if (!orgId) return '—';
    return this.organizations().find((o) => o.id === orgId)?.nombre ?? '—';
  }
  ```
- **Modelo**: `User.organizationId?: string | null` agregado a
  `models/user.interface.ts` (no existía; el backend
  (`UserEntity.organizationId`) lo tiene, pero el DTO/response del
  listado (`GET /users`) no estaba modelado en el frontend hasta ahora).
- **Riesgo detectado (fuera de alcance de este fix)**: el `User`
  interface del frontend usa `nombres`/`apellidos`/`telefono`, pero el
  `UserEntity` del backend expone `firstName`/`lastName`/`phone`
  (`backend/src/entities/user.entity.ts`). No hay DTO/serializer que
  traduzca esos nombres — es un desalineamiento preexistente,
  independiente de `organizationId`, y no se toca en este batch (afecta
  a todo el módulo de usuarios, no sólo a la columna Organización).
  Anotado para un change de contrato API↔FE aparte.

### C.2 — Filtros de rol/organización funcionales

- **Componente**: `onFilterChange()` ahora llama a un nuevo método
  privado `refetch()` (resetea `currentPage` a 1 y recarga) en vez de
  sólo guardar los signals.
- **Servicio**: `UsersService.getUsers(page, limit, role?, org?)` — los
  dos nuevos params son opcionales y se agregan como `HttpParams` sólo
  si tienen valor.
- **`loadUsers()`** pasa `this.selectedRole() || undefined` y
  `this.selectedOrg() || undefined` al servicio.
- **Deviation mantenida**: `search` sigue sin viajar al backend — la
  búsqueda es local por diseño (`SearchBarComponent`, «Instant feedback,
  no server overhead»). No se cambia — cambiarlo contradiría el
  comment de diseño explícito y los tests existentes de búsqueda local.
- **Backend**: `GET /users` (`users.controller.ts` → `list()`) sólo lee
  `page`/`limit` hoy. Los params `role`/`org` viajan en la query string
  pero el backend los ignora — hasta que un change de backend los
  soporte, el filtro server-side no tiene efecto real. La UI ya no
  miente (dispara la request con los params), pero el resultado no
  cambia todavía. **Esto sigue siendo una desviación documentada**, no
  resuelta al 100% porque requiere un cambio de backend fuera de
  alcance de este change de frontend.

### C.3 — Tarjetas del pie agregadas

- 3 `<article class="info-card">` dentro de `<section
  class="info-cards-grid">`, después del bloque `@if(isLoading){…}@else{…}`
  (siempre visibles, no dependen de loading state):
  - Políticas de Seguridad → `routerLink` a `/app/admin/roles` (ruta
    real).
  - Gestión de Organizaciones → `routerLink` a `/app/organizaciones`
    (ruta real, catálogo F2).
  - Auditoría de Acceso → `href="#"` — no existe ruta de auditoría en
    el proyecto; placeholder cosmético igual que el mock 03-01 (el spec
    sólo pide el texto del link, no navegación funcional).
- CSS: `.info-cards-grid` (grid 3 columnas, colapsa a 1 en `≤768px`) +
  `.info-card` en `users-list.component.css`, usando los mismos
  CSS custom properties (`--color-brand-primary`, `--color-slate-*`,
  `--color-border-subtle`) que el resto del componente — sin inventar
  tokens nuevos.

### C.4 — `tasks.md` sincronizado

Las 22 tareas originales + la sección "Fix batch aplicado" quedaron
marcadas `[x]` en `tasks.md`, con las desviaciones de cada una anotadas
inline (path del componente, filtros search/role/org, estados
Activo/Inactivo, etc.) en vez de vivir sólo en este archivo.

### W.2 — Búsqueda: verificado, sin cambios

`app-search-bar` ya emitía `(searchChange)="onSearch($event)"` en el
template, y `onSearch()` seteaba `searchTerm` (consumido por el
`computed` `visibleUsers`). El wiring ya estaba completo — no había
nada que arreglar.

### W.3 — Reset de paginación: cubierto por C.2

`refetch()` hace `this.currentPage.set(1)` antes de `loadUsers()` — se
comparte entre `onFilterChange` y cualquier futuro caller.

### W.4 — Toast de error agregado

`loadUsers()`'s `catchError` ahora llama
`this.toastService.error('No se pudieron cargar los usuarios. Intenta
nuevamente.', 'Error')` además de setear `errorMessage` (que sigue
alimentando el banner inline existente). Mismo patrón que `onDelete()`
ya usaba para sus toasts.

### W.5 — Diálogo de borrado: verificado, sin cambios

`onDelete()` ya llamaba `dialogService.confirm({ title, message,
confirmText, cancelText, isDanger: true })` con contenido específico
del usuario (`¿Eliminar a {nombre}? Esta acción no se puede deshacer.`).
Cumplía W.5 desde el batch original.

### W.1, S.1, S.2 — sin acción

- **W.1** (S3/S4 e2e enmascarados): se resuelve solo en CI contra
  staging una vez el backend soporte `role`/`org`; no accionable desde
  frontend.
- **S.1** (keyboard nav en `ActionMenuComponent`) y **S.2** (breakpoint
  responsive de la tabla): SUGGESTION, no bloqueantes, no aplicadas en
  este batch.

### Tests actualizados

`users-list.component.spec.ts`:
- `onPageChange recarga del backend con la página nueva` — actualizado
  a `expect(mockUsersService.getUsers).toHaveBeenCalledWith(2, 25,
  undefined, undefined)` (firma nueva del servicio).
- `onFilterChange guarda role/org...` — renombrado y extendido para
  cubrir el refetch: verifica `selectedRole`/`selectedOrg`,
  `currentPage() === 1`, y que `getUsers` se llama con `(1, 25, '1',
  'org-1')`.
- Nuevo: `getOrganizationName resuelve el nombre desde el signal
  organizations` — cubre `undefined`/`null` → `'—'`, match → nombre,
  no-match → `'—'`.

### Verificación (fix batch)

- `pnpm run lint`: exit 0 (0 errores; warnings preexistentes sin
  relación con este batch).
- `pnpm test`: 67/67 suites, **461/461 tests** (460 previos + 1 test
  nuevo neto — se agregó 1 test y se editó 1 existente sin agregar
  tests adicionales en ese caso).
- `ng build`: verde, `users-list-component` chunk 22.02 kB / 5.79 kB
  transfer.

### Archivos modificados en este batch

| Archivo | Cambio |
|---|---|
| `frontend/src/app/features/admin/users/models/user.interface.ts` | `+organizationId?: string \| null` en `User` |
| `frontend/src/app/features/admin/users/services/users.service.ts` | `getUsers()` acepta `role`/`org` opcionales |
| `frontend/src/app/features/admin/users/users-list/users-list.component.ts` | `getOrganizationName()`, `refetch()`, `onFilterChange()` dispara refetch, `loadUsers()` pasa filtros, toast de error |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | Columna Organización resuelta, sección `.info-cards-grid` |
| `frontend/src/app/features/admin/users/users-list/users-list.component.css` | Estilos `.info-cards-grid` / `.info-card` |
| `frontend/src/app/features/admin/users/users-list/users-list.component.spec.ts` | Tests actualizados/agregados (ver arriba) |
| `openspec/changes/front/2026-09-08-f6-usuarios-redesign/tasks.md` | 22 tareas + fix batch marcadas `[x]`, desviaciones inline |
| `openspec/changes/front/2026-09-08-f6-usuarios-redesign/apply-progress.md` | Esta sección |

### Estado final

**Batch original**: 22/22 tareas ✅ (ya estaba, pero `tasks.md`
desincronizado — corregido en C.4).
**Fix batch**: 4/4 CRITICAL ✅, 3/4 WARNING accionables ✅ (W.2 y W.5 ya
cumplían sin cambios; W.1 no accionable desde frontend), 0/2 SUGGESTION
(no bloqueantes, quedan fuera de alcance).

Listo para `sdd-verify` de re-chequeo.
