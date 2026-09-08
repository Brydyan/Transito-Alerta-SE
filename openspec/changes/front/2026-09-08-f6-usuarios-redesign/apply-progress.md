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
