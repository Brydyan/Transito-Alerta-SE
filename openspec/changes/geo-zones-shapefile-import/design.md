# Design: Geo-Zones Shapefile Bulk Import + Map Zone Filters

## Technical Approach

Four capabilities across backend (bulk import endpoint) and frontend (upload UI, cascading map filters, zone highlight). Backend parses shapefiles with `shpjs`, validates per-feature, inserts via existing `repo.create()` in a transaction. Frontend adds `shpjs` browser-side for preview, three cascading dropdowns to `MapFiltersComponent`, and a highlight layer to `MapComponent`. No migrations needed -- reuses existing `geo_zones` table and `CREATE` permission.

## Architecture Decisions

### D1: Parse Shapefile Server-Side (Import) + Client-Side (Preview)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Server-only parse | Simpler frontend; no preview before submit | **Rejected** -- user cannot verify column mapping or geometry before import |
| Client-only parse, send GeoJSON array | Backend never touches `.zip`; large JSON payload | **Rejected** -- 10 MB zip expands to much larger GeoJSON; multipart `.zip` is more efficient |
| **Dual parse** | `shpjs` in both; client for preview, server for authoritative import | **Chosen** -- best UX (instant preview) + server is authority for validation |

### D2: Transaction Strategy for Bulk Import

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `dataSource.transaction()` wrapping per-feature `repo.create()` | Follows existing `IncidentApprovalService` pattern; all-or-nothing on DB errors | **Chosen** |
| Individual inserts, no transaction | Partial imports possible; inconsistent state | **Rejected** -- spec requires atomic rollback on DB error |
| Per-feature validation errors skip (no rollback) | Spec says invalid features go to `errors[]`, NOT rollback | Combined: validation failures skip; DB constraint failures rollback all |

Implementation: `GeoZonesService.importShapefile()` creates a `QueryRunner`, starts transaction, iterates features. Validation failures (geometry, bounds, name) add to `errors[]` and skip. Successful features call a transactional variant of `repo.create()` that accepts the `QueryRunner`. After loop, commit. If `QueryRunner` throws (constraint violation), catch + rollback + return 500.

### D3: Parent Resolution Order

| Step | Method | Fallback |
|------|--------|----------|
| 1 | `parent_code` attribute in shapefile -> `findByCode()` lookup | Step 2 |
| 2 | `ST_Contains(parent.polygon, ST_Centroid(feature.polygon))` against parent-level zones | Insert with `parent_id = NULL` + warning |

New repository method: `findParentByCodeOrContainment(code: string | null, centroid: unknown, parentLevel: GeoZoneLevel)`.

### D4: Frontend Import Flow -- Modal in LocationList, Not LocationForm

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add to LocationForm (edit/create form) | Mixes single-zone CRUD with bulk import; form already complex | **Rejected** |
| **Standalone action in LocationList** | "Import Shapefile" button next to "New Zone"; opens dialog | **Chosen** -- cleaner separation; bulk != single-zone form |

### D5: `shpjs` on Backend -- Buffer API

`shpjs` accepts `ArrayBuffer`. Multer gives `Express.Multer.File` with `file.buffer` (Buffer). `Buffer` is a subclass of `Uint8Array`; pass `file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength)` to get a clean `ArrayBuffer`.

## Data Flow

### Import Flow

    Browser                      Backend
    -------                      -------
    .zip file
      |
      +--(shpjs parse)-->  preview modal (Leaflet mini-map)
      |                    user maps columns, selects level
      |
      +--(POST /geo-zones/import, multipart)--> GeoZonesController.import()
                                                   |
                                         GeoZonesService.importShapefile()
                                                   |
                                         shpjs parse .zip -> FeatureCollection
                                                   |
                                         for each feature:
                                           validate geometry (repo.validateGeometry)
                                           resolve parent (code or ST_Contains)
                                           check duplicate (code exists? skip)
                                           repo.createInTransaction(queryRunner, input)
                                                   |
                                         commit transaction
                                                   |
                                         return { imported, skipped, errors, warnings }

### Map Filter Flow

    MapFiltersComponent                    MapComponent
    -------------------                    ------------
    provincia dropdown change
      |-> GET /geo-zones?level=canton&parent_id=X
      |-> canton dropdown enabled
      |-> canton change -> GET /geo-zones?level=parroquia&parent_id=Y
      |-> emit filtersChange({ ...existing, zone_id: Z })
                                              |
                                     geoZoneService.getById(Z)
                                              |
                                     render highlight layer (red, weight 3)
                                     map.fitBounds()
                                     filter incidents client-side (point-in-polygon)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/modules/geo-zones/geo-zones.controller.ts` | Modify | Add `POST import` route with `FileInterceptor`, `@RequirePermission('CREATE')` |
| `backend/src/modules/geo-zones/geo-zones.service.ts` | Modify | Add `importShapefile()` method with transaction, per-feature validation loop |
| `backend/src/modules/geo-zones/geo-zones.repository.ts` | Modify | Add `createInTransaction()` (accepts QueryRunner), `findByCode()`, `findParentBySpatialContainment()` |
| `backend/src/modules/geo-zones/dto/import-geo-zone.dto.ts` | Create | `ImportGeoZoneQueryDto` (level, auto_parent, name_column, code_column) |
| `backend/src/modules/geo-zones/dto/import-geo-zone-response.dto.ts` | Create | `ImportGeoZoneResponseDto` interface |
| `backend/package.json` | Modify | Add `shpjs` dependency |
| `frontend/src/app/features/catalogs/locations/services/geo-zone.service.ts` | Modify | Add `importShapefile(file, params)` method using `FormData` + `HttpService.post()` |
| `frontend/src/app/features/catalogs/locations/interfaces/igeo-zone.interface.ts` | Modify | Add `IImportGeoZoneResponse` interface |
| `frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts` | Modify | Add "Import" button, open dialog |
| `frontend/src/app/features/catalogs/locations/components/shapefile-import-dialog/` | Create | Dialog component: file input, shpjs parse, column mapping, preview map, submit |
| `frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.ts` | Modify | Add provincia/canton/parroquia dropdowns, cascading logic |
| `frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.html` | Modify | Add three `<select>` elements for zone hierarchy |
| `frontend/src/app/features/citizen/map/services/map-data.service.ts` | Modify | Add `zone_id` to `MapActiveFilters` |
| `frontend/src/app/features/citizen/map/map.component.ts` | Modify | Add highlight layer, `fitBounds()`, client-side point-in-polygon filter |
| `frontend/package.json` | Modify | Add `shpjs` dependency |

## Interfaces / Contracts

```typescript
// backend/src/modules/geo-zones/dto/import-geo-zone.dto.ts
export class ImportGeoZoneQueryDto {
  @IsIn(GEO_ZONE_LEVELS) level: GeoZoneLevel;
  @IsOptional() @IsBoolean() auto_parent?: boolean;  // default true
  @IsOptional() @IsString() name_column?: string;     // default 'NAME'
  @IsOptional() @IsString() code_column?: string;     // default 'CODE'
}

// Response shape (not a class — returned directly)
export interface ImportGeoZoneResponse {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; reason: string }>;
  warnings: string[];
}
```

```typescript
// Controller signature
@Post('import')
@RequirePermission('CREATE')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
@HttpCode(HttpStatus.OK)
async importShapefile(
  @UploadedFile() file: Express.Multer.File,
  @Query() query: ImportGeoZoneQueryDto,
): Promise<ImportGeoZoneResponse>
```

```typescript
// Repository — new transactional create
async createInTransaction(
  runner: QueryRunner,
  input: CreateZoneInput,
): Promise<GeoZoneDetailRow>

// Repository — parent spatial lookup
async findParentBySpatialContainment(
  geometry: unknown,
  parentLevel: GeoZoneLevel,
): Promise<string | null>  // returns parent zone id or null
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `importShapefile()` validation loop (geometry, duplicates, parent resolution) | Jest mocks for repo; fixture GeoJSON features |
| Unit | `createInTransaction()` runs INSERT on given QueryRunner | Jest mock QueryRunner |
| Unit | `ImportGeoZoneQueryDto` validation | class-validator `validate()` |
| Integration | `POST /geo-zones/import` with real DB | Testcontainers; upload fixture `.zip` |
| Integration | Parent spatial containment query | Testcontainers; seed parent province, import canton |
| Component | `ShapefileImportDialogComponent` preview + column mapping | TestBed; mock shpjs |
| Component | `MapFiltersComponent` cascading dropdowns | TestBed; mock GeoZoneService |
| E2E | Upload 3-canton shapefile -> verify DB rows + response | jest-e2e; real `.zip` fixture |

## Threat Matrix

N/A -- no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Uses existing `geo_zones` table (migrations 0002/0013/0035). `shpjs` is the only new dependency. Rollback: remove import route + frontend dialog + shpjs from both package.json files.

## Open Questions

- [ ] Should the frontend preview use Leaflet (already a dependency) or a lightweight canvas renderer? **Recommendation**: Leaflet -- already loaded, no new dependency.
- [ ] Column mapping defaults (`NAME`, `CODE`) -- should we auto-detect from shapefile DBF headers? **Recommendation**: Show all DBF columns in dropdowns, default to first matching `name`/`nombre`/`NAME` and `code`/`codigo`/`CODE`.
