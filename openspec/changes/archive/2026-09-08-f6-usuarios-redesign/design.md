# Design: F6 Usuarios Redesign

## Components

```
UsersListComponent (container)
├── SearchBarComponent (search input)
├── FilterBarComponent (role + org dropdowns)
├── UiTableComponent (reusable table)
│   ├── TableHeader (columns)
│   └── TableBody (rows + status badges)
├── PaginationComponent (numbered pages)
└── ActionMenuComponent (eye, delete, edit)
```

## Service Integration

**UserService**:
- `getUsers(page, limit, search, role, org)` → GET `/users?...`
- `deleteUser(id)` → DELETE `/users/{id}`
- `getUserRoles()` → GET `/roles` (for dropdown)
- `getOrganizations()` → GET `/organizations` (for dropdown)

## Data Models

```typescript
interface User {
  id: string
  photo?: string
  firstName: string
  lastName: string
  email: string
  role: string
  organization: string
  status: 'activo' | 'pendiente' | 'inactivo'
}

interface UsersResponse {
  users: User[]
  total: number
  page: number
  limit: number
}
```

## Decisions

| Decision | Rationale | Alternative |
|----------|-----------|-------------|
| **Local search** | Instant feedback, no server overhead | Server-side search (slower) |
| **NO *hasPermission on list** | D7: show all buttons, let backend 403 | Hide buttons (confusing) |
| ***hasPermission in form only** | D7: user sees button, tries, gets friendly error | Never show button |
| **Backend pagination** | Handles 25+ users efficiently | Client-side (loads all) |
| **Reusable ui-table** | Roles & Usuarios both use it | Separate tables (duplication) |

## Key Point: D7 Permission Handling

The design explicitly says operador_org sees buttons but gets 403 on click. This is **intentional**:

1. UI shows action buttons for ALL users (regardless of role)
2. User clicks "Edit" on someone else's account
3. Backend returns 403: "INSUFFICIENT_PERMISSIONS"
4. Toast shows: "No tienes permiso para modificar este usuario"
5. User learns the boundary at runtime

**Why**: D1 requires "specs pass unchanged" — old specs don't mention *hasPermission in the list. Adding it would be a spec change, violating D1.

## Endpoints (Consumed)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users?page=1&limit=25&search=&role=&org=` | GET | List with filters |
| `/users/{id}` | GET | Single user (if needed for edit form) |
| `/users/{id}` | PATCH | Update user (form, future phase) |
| `/users/{id}` | DELETE | Delete (calls GET after to refresh) |
| `/roles` | GET | Dropdown options |
| `/organizations` | GET | Dropdown options |

## Testing

### Unit
- `users-list.component.spec.ts`: Signals, filter logic, pagination
- `search-bar.component.spec.ts`: Input binding, debounce
- `filter-bar.component.spec.ts`: Dropdown changes, reset

### E2E
- Load list, render 7 users
- Search filters local
- Dropdowns trigger API call
- Pagination works
- Delete button calls endpoint, refreshes list
