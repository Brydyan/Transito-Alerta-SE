# Design: T5.3 Operator Tracking — GPS Location + Operator Dashboard

Source: `proposal.md`. No new DB migrations.

## Architecture Overview

```
POST /api/operator/location    → OperatorLocationService.record(userId, orgId, lat, lng)
GET  /api/operator/locations   → OperatorLocationService.activeFor(orgId, isSystemAdmin)
GET  /api/operator/dashboard   → OperatorDashboardService.forOperator(userId, filters)
       │
OperatorsController
  Role guard (explicit role-name check, not permission)
       │
OperatorLocationService ──── Redis (ioredis via existing connection)
OperatorDashboardService ─── DataSource (incidents + categories)
```

## Redis Key Design

```
operators:loc:{orgId}   →  Hash
  field: {userId}
  value: JSON { userId, lat, lng, updatedAt }
  TTL: 300 seconds (5 minutes) — reset on each ping

system_admin path: scan KEYS operators:loc:* — only used when caller is admin_sistema.
```

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | `HSET operators:loc:{orgId} {userId} {json}` + `EXPIRE operators:loc:{orgId} 300`. | Hash per org allows `HGETALL` for org-scoped queries in O(1). System admin scans by pattern. TTL reset on any org member ping. |
| **D2** | TTL is on the Hash key (per org), not individual fields. | Redis Hash does not support per-field TTL. The Hash expires when the last member's intended TTL elapses — acceptable; a lone operator in an org keeps the hash alive until they stop pinging. |
| **D3** | Role check is explicit: `['operador_organizacion', 'operador_sistema'].includes(user.roleName)` in the service, not a permission check. | Mirrors GeoReporta's `PING_ROLES`/`QUERY_ROLES` constants exactly. The endpoint is role-semantically bound — an admin shouldn't accidentally ping a location. |
| **D4** | Dashboard uses `claimed_by = :userId OR assigned_to = :userId` in the incidents query. | Operators may appear via either column depending on whether T5.1 claim or an admin assignment was used. |
| **D5** | `OperatorsModule` is a new module (not extending `UsersModule`). | Clean separation: users module handles identity; operators module handles operational state (Redis locations, dashboard). |

## TypeScript Contracts

```typescript
// DTOs

export class UpdateLocationDto {
  @IsNumber() @Min(-90) @Max(90)
  lat!: number;

  @IsNumber() @Min(-180) @Max(180)
  lng!: number;
}

export class LocationUpdateResponseDto {
  status!: 'ok';
}

export interface OperatorLocationEntry {
  userId: string;
  organizationId: string;
  lat: number;
  lng: number;
  updatedAt: string; // ISO string
}

export interface OperatorLocationsResponseDto {
  operators: OperatorLocationEntry[];
}

export class DashboardQueryDto {
  @IsOptional() @IsDateString() inicio?: string;
  @IsOptional() @IsDateString() fin?: string;
  @IsOptional() @IsUUID() location_id?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) per_page?: number;
}

export interface DashboardStatsDto {
  total_assigned: number;
  in_progress: number;
  resolved_today: number;
}

export interface DashboardIncidentDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimedBy: string | null;
  category: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorDashboardResponseDto {
  stats: DashboardStatsDto;
  incidents: DashboardIncidentDto[];
  pagination: PaginationMeta;
}

// Service interfaces

export interface IOperatorLocationService {
  record(userId: string, organizationId: string, lat: number, lng: number): Promise<void>;
  activeFor(organizationId: string | null, isSystemAdmin: boolean): Promise<OperatorLocationEntry[]>;
}

export interface IOperatorDashboardService {
  forOperator(userId: string, filters: DashboardQueryDto): Promise<OperatorDashboardResponseDto>;
}
```

## Redis Operations

```typescript
// record()
await redis.hset(`operators:loc:${orgId}`, userId, JSON.stringify({ userId, organizationId: orgId, lat, lng, updatedAt: new Date().toISOString() }));
await redis.expire(`operators:loc:${orgId}`, 300);

// activeFor() — org-scoped
const raw = await redis.hgetall(`operators:loc:${orgId}`);
return Object.values(raw ?? {}).map(v => JSON.parse(v) as OperatorLocationEntry);

// activeFor() — system admin
const keys = await redis.keys('operators:loc:*');
const all: OperatorLocationEntry[] = [];
for (const key of keys) {
  const raw = await redis.hgetall(key);
  all.push(...Object.values(raw ?? {}).map(v => JSON.parse(v) as OperatorLocationEntry));
}
return all;
```

## Dashboard SQL (summary)

```sql
-- stats (3 queries or 1 CASE aggregation)
SELECT
  COUNT(*) AS total_assigned,
  SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
  SUM(CASE WHEN status = 'resolved'
        AND DATE(resolution_date) = CURRENT_DATE THEN 1 ELSE 0 END) AS resolved_today
FROM incidents
WHERE (claimed_by = $1 OR assigned_to = $1)
  AND deleted_at IS NULL;

-- incident list (paginated)
SELECT i.*, ic.name AS category_name
FROM incidents i
LEFT JOIN incident_categories ic ON i.category_id = ic.id
WHERE (i.claimed_by = $1 OR i.assigned_to = $1)
  AND i.deleted_at IS NULL
  [AND i.created_at >= $inicio] [AND i.created_at <= $fin]
  [AND i.location_id = $location_id]
ORDER BY i.updated_at DESC
LIMIT $perPage OFFSET $offset;
```

## Deviations from Legacy

| Legacy behavior | NestJS design | Reason |
|---|---|---|
| GeoReporta uses `OperadorSistema` + `OperadorOrganizacion` PHP enums | Role names as string constants: `'operador_sistema'`, `'operador_organizacion'` | NestJS uses the same role name strings that are in the DB seed |
| Dashboard gate: `isOperator() && can('dashboard.view')` | Role check + `@RequirePermissions('READ dashboard')` | Equivalent check in NestJS pattern |
| `OperatorDashboardService::forOperator` returns `$filters` from request directly | `DashboardQueryDto` class-validated DTO | NestJS requires explicit DTO validation |
