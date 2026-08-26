# Design: T5.4 Map UI Support — Map Filters + Users Form-Data

Source: `proposal.md`. No new migrations.

## Architecture Overview

```
GET /api/map/filters
       │
MapController (new, in MapModule)
  JwtAuthGuard only — no permission gate
       ▼
MapSupportService
  → SELECT id, name FROM incident_categories ORDER BY name

GET /api/users/form-data
       │
UsersController (existing, extended)
  @RequirePermissions('READ users')
       ▼
UsersService.getFormData(currentUser)
  → roles query (filtered for non-system-admins)
  → organizations query (filtered for non-system-admins)
```

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | `MapModule` imports `TypeOrmModule.forFeature([IncidentCategoryEntity])` directly, not `IncidentCategoriesModule`. | Importing the full `IncidentCategoriesModule` would pull in its controller and permission-gated service. A single repository registration is cleaner. |
| **D2** | Map filters have NO org scope. | `incident_categories` is a global catalog in NestJS (not org-scoped in the schema). Mirrors GeoReporta's `MapFilterController` which also has no org scope. |
| **D3** | `getFormData` is added to `UsersService` (not a new service). | Single responsibility is preserved: form-data is user-management support, owned by `UsersService`. The method is small enough not to justify a new service class. |
| **D4** | System-only role exclusion uses a constant array `SYSTEM_ONLY_ROLES = ['admin_sistema', 'operador_sistema', 'admin_legacy']`. | Mirrors GeoReporta's `UserRole` enum exclusion list. String constants avoid coupling to an enum that may not exist yet. |
| **D5** | No Redis caching for these endpoints. | Reference data is small (< 50 rows) and rarely changes. A simple DB query per request is negligible. Caching adds invalidation complexity for no measurable gain. |

## TypeScript Contracts

```typescript
// Map filters

export interface CategoryDto {
  id: string;
  name: string;
}

export interface MapFiltersResponseDto {
  data: {
    categories: CategoryDto[];
  };
}

// Users form-data

export interface RoleDto {
  id: string;
  name: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
}

export interface FormDataResponseDto {
  roles: RoleDto[];
  organizations: OrganizationDto[];
}

// Constants

export const SYSTEM_ONLY_ROLES = [
  'admin_sistema',
  'operador_sistema',
  'admin_legacy',
] as const;

// UsersService additive method

interface IUsersService {
  // (existing methods omitted)
  getFormData(currentUser: UserEntity): Promise<FormDataResponseDto>;
}
```

## SQL Queries

```typescript
// MapSupportService.getMapFilters()
const categories = await this.incidentCategoryRepository.find({
  select: ['id', 'name'],
  order: { name: 'ASC' },
});

// UsersService.getFormData(user)
const isSystemAdmin = /* check role name or role_id against SYSTEM_ADMIN_ROLE_ID */;

const rolesQb = this.rolesRepository.createQueryBuilder('r')
  .select(['r.id', 'r.name'])
  .orderBy('r.name', 'ASC');

if (!isSystemAdmin) {
  rolesQb.andWhere('r.name NOT IN (:...excluded)', { excluded: SYSTEM_ONLY_ROLES });
}

const orgsQb = this.organizationsRepository.createQueryBuilder('o')
  .select(['o.id', 'o.name'])
  .orderBy('o.name', 'ASC');

if (!isSystemAdmin) {
  orgsQb.andWhere('o.id = :orgId', { orgId: user.organizationId });
}
```

## Module Registration

```typescript
// MapModule (new)
@Module({
  imports: [
    TypeOrmModule.forFeature([IncidentCategoryEntity]),
    JwtModule, // for JwtAuthGuard
  ],
  controllers: [MapController],
  providers: [MapSupportService],
})
export class MapModule {}

// AppModule — add MapModule to imports array
```

## Deviations from Legacy

| Legacy behavior | NestJS design | Reason |
|---|---|---|
| GeoReporta `MapFilterController` returns `int` IDs | NestJS returns UUID strings | NestJS schema uses UUIDs for all PKs |
| GeoReporta `formData()` returns `Role` Eloquent model with extra attributes | NestJS returns `{id, name}` slim shape only | Follows project convention for catalog endpoints |
| Laravel `$this->authorize('viewAny', User::class)` for form-data | `@RequirePermissions('READ users')` | Direct NestJS RBAC equivalent |
