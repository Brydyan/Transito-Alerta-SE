# Design: T5.2 Incident Analytics — Stats, Weekly-Stats, Feed, Export CSV

Source: `proposal.md`. No new migrations.

## Architecture Overview

```
GET /api/incidents/stats
GET /api/incidents/weekly-stats
GET /api/incidents/feed
GET /api/incidents/export
       │
IncidentsController (existing, extended)
       │  @RequirePermissions('READ dashboard')  [stats, weekly-stats, export]
       │  Dispatch on role                       [feed]
       ▼
IncidentAnalyticsService  ─── CacheManager (Redis, 1h TTL)
IncidentFeedService       ─── DataSource (staff) / Redis (citizen)
IncidentExportService     ─── DataSource (streaming)
       │
incidents + incident_categories + organizations + locations tables
```

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | Citizen feed falls back to a Postgres query if the Redis read model key is absent. | Prevents a cold-start outage. The Redis model is populated by an incident-write listener (T2.1's realtime module) — on first deploy it may be empty. |
| **D2** | All analytics services live in `IncidentsModule` (not a new `AnalyticsModule`). | Avoids a circular import chain: analytics needs `IncidentEntity` and related repos already owned by `IncidentsModule`. A dedicated module would import `IncidentsModule` anyway. |
| **D3** | Cache key: `stats:{orgScope}:{filterHash}` where `orgScope ∈ {system, org:{id}, user:{id}}`. | Matches GeoReporta's cache key convention. Ensures admin_sistema never sees a stale org-A response. |
| **D4** | Export is CSV-only in T5.2. XLSX deferred. | `exceljs` / `xlsx` not in current `package.json`. Shipping CSV now unblocks the dashboard export button. XLSX is a separate task. |
| **D5** | Export streams via a `Transform` stream pipeline, not `res.json()`. | Bounded memory regardless of dataset size. `StreamableFile` + NestJS `@Res()` raw passthrough is the pattern for streaming in NestJS. |
| **D6** | `trends` computation uses the same-length period ending just before `currentStart`. | Direct port of GeoReporta's `calculateTrends()`. No client-side delta math needed. |

## TypeScript Contracts

```typescript
// Stats DTOs

export interface StatsByKey {
  [key: string]: number; // zero-filled for all known enum values
}

export interface ResolutionTime {
  formatted: string;   // e.g. "2d 4h"
  days: number;
  hours: number;
  seconds: number;
}

export interface Trends {
  total_pct: number | null;
  pendientes_pct: number | null;
  resolution_rate_pct: number | null;
}

export interface TopCategory {
  name: string;
  total: number;
  resolved: number;
  pending: number;
}

export interface IncidentStatsResponseDto {
  total: number;
  by_status: StatsByKey;
  by_priority: StatsByKey;
  recent_count: number;
  locations_count: number;
  average_resolution_time: ResolutionTime | null;
  trends: Trends;
  top_categories: TopCategory[];
}

// Weekly stats DTOs

export interface DayDataPoint {
  date: string;         // YYYY-MM-DD
  label: string;        // 'Lun' | 'Mar' | 'Mié' | 'Jue' | 'Vie' | 'Sáb' | 'Dom'
  recibidas: number;
  resueltas: number;
}

export interface WeeklyStatsResponseDto {
  days: DayDataPoint[];
}

// Feed DTOs

export interface FeedItemDto {
  id: string;
  incident_category_id: string | null;
  organization_id: string | null;
  user_id: string;
  location_id: string | null;
  title: string;
  status: string;
  priority: string;
  resolution_date: Date | null;
  created_at: Date;
  updated_at: Date;
  geom: GeoJsonPoint | null;
  category: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  user: { id: string; name?: string } | null;
  location: { id: string; name: string } | null;
}

export interface FeedResponseDto {
  data: FeedItemDto[];
  meta: PaginationMeta;
}

// Query DTOs (class-validator)

export class StatsQueryDto {
  @IsOptional() @IsDateString() inicio?: string;
  @IsOptional() @IsDateString() fin?: string;
  @IsOptional() @IsUUID() tipo_id?: string;
  @IsOptional() @IsUUID() ciudad_id?: string;
  @IsOptional() @IsUUID() provincia_id?: string;
  @IsOptional() @IsUUID() pais_id?: string;
}

export class FeedQueryDto {
  @IsOptional() @IsString() bbox?: string;      // "lng1,lat1,lng2,lat2"
  @IsOptional() @IsInt() @Min(1) @Max(22) zoom?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsUUID() location_id?: string;
  @IsOptional() @IsUUID() incident_category_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) per_page?: number;
  @IsOptional() @IsInt() @Min(1) page?: number;
}

export class ExportQueryDto extends StatsQueryDto {
  // CSV only in T5.2; format param accepted but hardcoded to 'csv'
}
```

## Org Scoping Helper

```typescript
// Mirrors GeoReporta's ScopesIncidentQueries trait
function applyOrgScope(qb: SelectQueryBuilder<IncidentEntity>, user: UserEntity): SelectQueryBuilder<IncidentEntity> {
  if (user.roleId === SYSTEM_ADMIN_ROLE_ID) return qb; // sees all
  if (user.organizationId) {
    return qb.andWhere('incident.organization_id = :orgId', { orgId: user.organizationId });
  }
  return qb.andWhere('1 = 0'); // unknown org scope — return nothing
}
```

## Cache Key Design

```
stats:{orgScope}:{filterHash}
weekly-stats:{orgScope}:{filterHash}

where orgScope:
  admin_sistema → 'system'
  admin_organizacion | operador → 'org:{organizationId}'
  else → 'user:{userId}'

filterHash = sha256(JSON.stringify(sortedFilters)).slice(0, 16)
```

## CSV Export Pipeline

```typescript
// Stream pattern in NestJS (no temp file)
@Get('export')
async export(@Query() query: ExportQueryDto, @Res() res: Response, @AuthUser() user: UserEntity) {
  const filename = `incidencias-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const total = await this.exportService.countFiltered(query, user);
  const CAP = 5000;
  if (total > CAP) {
    res.setHeader('X-Report-Truncated', 'true');
    res.setHeader('X-Report-Original-Total', String(total));
    res.setHeader('X-Report-Exported', String(CAP));
  }

  const stream = await this.exportService.createCsvStream(query, user, CAP);
  stream.pipe(res);
}
```

## Deviations from Legacy

| Legacy behavior | NestJS design | Reason |
|---|---|---|
| GeoReporta stats uses `tipo_id` etc. as integer IDs (int FK) | NestJS uses UUID FKs | The NestJS schema uses UUIDs throughout; query params accepted as UUID strings |
| XLSX and PDF export supported via factory pattern | CSV only in T5.2 | No `exceljs` in stack; XLSX is a follow-up task |
| `dashboard.view` Laravel gate | `READ dashboard` RBAC permission | Standard NestJS RBAC permission pattern for this project |
| `location_id` filter in GeoReporta uses a join chain (ciudad → provincia → pais) | Simplified: `location_id` is a direct UUID filter | The NestJS incidents schema uses a simpler `location_id` FK; no multi-level geography hierarchy |
