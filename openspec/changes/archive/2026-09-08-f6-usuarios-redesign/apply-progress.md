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

## Fix batch — post `sdd-verify` FAIL (`fixes-required.md`)

Aplicado 2026-09-08 sobre `brydyan/sc-328-f6-usuarios`. `sdd-verify`
encontró 4 CRITICAL + 5 WARNING + 2 SUGGESTION. Este batch resuelve
los 4 CRITICAL y 3/4 de las WARNING recomendadas.

### C.1 — Columna Organización resuelta
- **Ahora**: `<td>{{ getOrganizationName(user.organizationId) }}</td>`
- Modelo: `User.organizationId?: string | null` agregado

### C.2 — Filtros de rol/organización funcionales
- Componente: `onFilterChange()` ahora llama `refetch()`
- Servicio: `UsersService.getUsers(page, limit, role?, org?)` acepta filtros

### C.3 — Tarjetas del pie agregadas
- 3 `<article class="info-card">` con Políticas, Organizaciones, Auditoría
- CSS: `.info-cards-grid` (3 columnas) + `.info-card` styles

### C.4 — `tasks.md` sincronizado
- 22 tareas + fix batch marcadas `[x]`, desviaciones anotadas inline

## Tests actualizados
- `pnpm run lint`: exit 0 (0 errores)
- `pnpm test`: 67/67 suites, 461/461 tests (460 + 1 nuevo)
- `ng build`: verde, chunk 22.02 kB

---

**Estado final**: 4/4 CRITICAL resueltos ✅, 3/4 WARNING accionables resueltos ✅
