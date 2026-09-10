# Design: F6 Roles Redesign

## Components

```
RolesListComponent (container)
├── SearchBarComponent (reuse from Users)
├── UiTableComponent (reuse from Users)
├── ActionMenuComponent (reuse from Users)
└── StatsCardsComponent (new)
```

## Service Integration

**RoleService**:
- `getRoles(page, limit, search)` → GET `/roles?...`
- `getRoleStats()` → GET `/roles/stats`
- `deleteRole(id)` → DELETE `/roles/{id}`

## Data Models

```typescript
interface Role {
  id: string
  name: string
  description?: string
  permissionCount: number
  isSystemRole?: boolean
}

interface RoleStats {
  totalPermissions: number
  protectedModules: number
  assignedUsers: number
}
```

## Decisions

| Decision | Rationale |
|----------|-----------|
| **Reuse ui-table** | Already built for Users, no duplication |
| **Search hybrid** (local + param) | Filtrado local sobre el array ya cargado (respuesta instantánea, sin round-trip) **+** `?search=` query param hacia el backend (compatibilidad con paginación server-side futura). El backend actual (`/roles`) acepta los params `page`/`limit` pero no `search`; la lista que se muestra es la del backend sin filtrar, y el cliente aplica el filtro local. Cuando el backend extienda `getRoles` con `search`, el filtrado будет en el servidor. |
| **Stats separate query** | El endpoint `/roles/stats` es independiente y puede no existir todavía en el backend — `getRoleStats()` cae a ceros (D5) si la respuesta no trae datos. |
| **No `forkJoin`** | La spec original lo menciona. La implementación llama a `loadRoles()` y `loadStats()` por separado en `ngOnInit`; cada uno con su propio `catchError`. Razón: con `forkJoin` un error en un endpoint cancela al otro (a menos que se envuelva en `catchError` por fuente). Dos `subscribe` separados reflejan la decisión de diseño (D5) con menos código. Misma resiliencia efectiva. |
| **No *hasPermission** | Viewing roles is universal for admins |
| **`RolesService` extendido, no `RoleService` nuevo** | El path `services/roles.service.ts` ya existía con `RolesService` (plural, usado por `RoleEditorComponent` y `roles.component.spec.ts`). Crear `RoleService` nuevo rompería la convención del codebase. Se extiende el existente. |

## Search Strategy (W.3)

Search is **hybrid**:
- **Local** filter on the loaded roles array — fast, no network round-trip, applied via the `visibleRoles` computed signal.
- **Backend** `?search=` query param sent on every `getRoles(page, limit, search?)` call — for forward compatibility with server-side filtering. The current backend (`/roles`) only reads `page`/`limit`; the extra param is ignored server-side until `getRoles` is extended.

When the user types, the local filter updates instantly. When the search term is cleared (or the page changes), `refetch()` is called and the backend is hit again with the current search term in the query string. This means: **the user sees the local-filtered result immediately**, and **the next refetch honors the term at the server too** (so if the backend starts supporting `search`, no client change is needed).

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/roles?page=1&limit=25&search=` | GET | List with search |
| `/roles/{id}` | GET | Single role details |
| `/roles/{id}` | DELETE | Delete role |
| `/roles/stats` | GET | Total perms, modules, users stats |

## Testing

### Unit
- `roles-list.component.spec.ts`
- `stats-cards.component.spec.ts`

### E2E
- Load list, 5 roles visible
- Search filters
- Permission badges display counts
- Stats cards show numbers
- Delete works, refreshes list
