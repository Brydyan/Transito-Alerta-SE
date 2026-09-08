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
| **Search local** | Small dataset (5 roles), fast |
| **Stats separate query** | May come from different backend aggregate |
| **No *hasPermission** | Viewing roles is universal for admins |

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
