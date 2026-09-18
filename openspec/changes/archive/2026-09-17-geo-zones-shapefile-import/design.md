# Design: Geo-Zones Shapefile Bulk Import + Map Zone Filters

## Technical Approach

Four capabilities across backend (bulk import endpoint, form-data endpoint) and frontend (upload UI in location-list dialog, cascading map filters, zone highlight + color-by-level rendering). Backend parses shapefiles with `shpjs`, validates per-feature, inserts via transactional `repo.createInTransaction()`. Frontend adds `shpjs` browser-side for preview, three cascading zone dropdowns to `MapFiltersComponent` via `FormGroup`, and a color-coded level-based layer group to `MapComponent`. No migrations needed -- reuses existing `geo_zones` table, `polygon` column, and `CREATE` permission.

## Architecture Decisions

### D1: Form Layout -- Inline Right Panel in LocationFormComponent

| Option | Tradeoff | Decision |
|--------|----------|----------|
| 2-col grid in LocationForm (left: name/code/level/parent, right: upload+progress) | Mixes single-zone CRUD with bulk import; form already complex with tree selector | **Rejected** |
| Standalone dialog launched from LocationList | "Importar Shapefile" button next to "Nueva Zona"; opens modal with file input + preview + column mapping | **Evaluated** |
| **Inline right panel in LocationFormComponent** | Upload/import controls in a collapsible right sidebar within existing form layout; no new modal component needed; user can manage both single-zone and bulk operations in one screen | **Chosen** |

**Rationale**: After evaluating a standalone dialog, the team chose an inline panel approach for better UX continuity. The right panel integrates naturally with the existing LocationFormComponent 2-column layout (left: CRUD fields, right: import panel when toggled). This reduces component bloat, keeps the UI in one place, and eliminates the need for a separate `ShapefileImportDialogComponent`. The panel itself uses a vertical layout: file selection + level dropdown + column mapping at the top, mini Leaflet preview map below, import progress and results at the bottom.

### D2: Upload Strategy -- Native `<input type="file">` + HttpClient `reportProgress`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `ng-file-drop` directive | Extra dependency; drag-and-drop out of scope per proposal | **Rejected** |
| **Native `<input type="file" accept=".zip">` + `HttpClient`** | Zero new dependencies; `reportProgress: true` + `observe: 'events'` gives upload progress natively | **Chosen** |

Upload method in `GeoZoneService`:

```typescript
importShapefile(file: File, params: { level: string; auto_parent: boolean; name_column: string; code_column: string }): Observable<HttpEvent<IImportGeoZoneResponse>> {
  const formData = new FormData();
  formData.append('file', file);
  return this.http.getClient().post<IImportGeoZoneResponse>(
    `${environment.apiUrl}/geo-zones/import`,
    formData,
    { reportProgress: true, observe: 'events', params }
  );
}
```

The dialog component filters `HttpEventType.UploadProgress` events to update a `progress` signal (0-100), and `HttpEventType.Response` for the final envelope.

### D3: Map Polygon Rendering -- Leaflet LayerGroup with Color-by-Level

| Option | Tradeoff | Decision |
|--------|----------|----------|
| ECharts overlay | Different rendering engine; project uses Leaflet for map | **Rejected** |
| Single color for all zones (current: `#3b82f6`) | Cannot distinguish levels visually | **Rejected** |
| **Leaflet `L.geoJSON` per zone, color keyed by `level`** | Uses existing infrastructure; each level gets a distinct color | **Chosen** |

**Color palette for 4 zone levels** (chosen for colorblind accessibility and contrast on OSM tiles):

| Level | Stroke | Fill | Opacity | Hex |
|-------|--------|------|---------|-----|
| `provincia` | `#6366f1` (indigo-500) | `#6366f1` | 0.08 | Weight 2, dashed |
| `canton` | `#0891b2` (cyan-600) | `#0891b2` | 0.12 | Weight 2, solid |
| `parroquia` | `#059669` (emerald-600) | `#059669` | 0.15 | Weight 1.5, solid |
| `zona` | `#d97706` (amber-600) | `#d97706` | 0.10 | Weight 1, dotted |

Implementation: Replace the current single-style `loadZones()` in `MapComponent` with a `ZONE_STYLES` constant map keyed by `GeoZoneLevel`. Each zone's `L.geoJSON` call reads `z.level` to select stroke/fill/weight/dashArray. Polygon layers set `interactive: false` (spec: clicks must not block incident markers) except when the zone detail tooltip feature is active -- then `interactive: true` with `bubblingMouseEvents: true` so underlying markers still receive clicks.

Zone detail tooltip on polygon click:

```typescript
onEachFeature: (feature, layer) => {
  layer.bindPopup(`<b>${z.name}</b><br>Code: ${z.code ?? '---'}<br>Level: ${z.level}<br>Parent: ${z.parent_name ?? '---'}`);
}
```

This requires `parent_name` in the zone list response. New repository join: `LEFT JOIN geo_zones p ON g.parent_id = p.id` selecting `p.name AS parent_name`.

### D4: Filter Cascading -- FormGroup with `valueChanges` + Disable Logic

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Template-driven forms with `[(ngModel)]` | Inconsistent with existing `MapFiltersComponent` which uses `ReactiveFormsModule` | **Rejected** |
| **Extend existing `FormGroup` with 3 new controls** | Follows established pattern; `valueChanges` already wired for filter emission | **Chosen** |

Add three controls to the existing `FormGroup` in `MapFiltersComponent`:

```typescript
this.form = this.fb.group({
  status: [''],
  priority: [''],
  category_id: [''],
  provincia_id: [''],
  canton_id: [{ value: '', disabled: true }],
  parroquia_id: [{ value: '', disabled: true }],
});
```

Cascading logic via `valueChanges` on individual controls:

```typescript
this.form.get('provincia_id')!.valueChanges.subscribe(provinciaId => {
  this.form.get('canton_id')!.reset('');
  this.form.get('parroquia_id')!.reset('');
  if (provinciaId) {
    this.form.get('canton_id')!.enable();
    this.loadZonesByParent('canton', provinciaId);
  } else {
    this.form.get('canton_id')!.disable();
    this.form.get('parroquia_id')!.disable();
  }
});
```

Canton `valueChanges` mirrors for parroquia. `clearFilters()` resets all six controls, re-disables canton/parroquia. The most-specific selected zone id (`parroquia_id || canton_id || provincia_id`) is emitted as `zone_id` in `MapActiveFilters`.

Dropdown data signals: `provincias = signal<{id: string, name: string}[]>([])`, `cantones`, `parroquias`. Loaded from `GeoZoneService.list({ level, parent_id, active: true })`.

### D5: Import Endpoint -- Multipart with Query Params

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Metadata as JSON body alongside file | Multer cannot mix JSON body + file in same field | **Rejected** |
| **File as `multipart/form-data`, metadata as query params** | Clean separation; `@Query()` for typed DTO, `@UploadedFile()` for binary | **Chosen** |

Controller signature:

```typescript
@Post('import')
@RequirePermission('CREATE')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_485_760 } }))
@HttpCode(HttpStatus.OK)
async importShapefile(
  @UploadedFile() file: Express.Multer.File,
  @Query() query: ImportGeoZoneQueryDto,
): Promise<ImportGeoZoneResponse>
```

Route declared BEFORE `:id` (same ordering principle as `GET /tree`).

### D6: Shapefile Parsing -- shpjs Client + shpjs Server

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Client-only parse, send GeoJSON | 10 MB zip expands to ~50 MB GeoJSON; no server validation of raw shapefile | **Rejected** |
| Server-only parse (no preview) | User cannot verify column mapping or geometry before committing | **Rejected** |
| Client: `shapefile` npm (streaming) | Larger bundle; streaming API more complex for one-shot preview | **Rejected** |
| **Client: `shpjs` for preview, Server: `shpjs` for authoritative import** | Same lib both sides (~40 KB gzipped); client gives instant preview, server is authoritative | **Chosen** |

**Rationale**: `shpjs` accepts an `ArrayBuffer` and returns a GeoJSON `FeatureCollection` synchronously. On the client, `FileReader.readAsArrayBuffer()` feeds `shpjs` for immediate preview in the dialog's mini Leaflet map. The raw `.zip` is then POSTed to the server where `shpjs` parses again -- this ensures the server never trusts client-parsed geometry. Using the same library avoids parse divergence (different libs might interpret edge-case shapefiles differently). `shpjs` is MIT-licensed, ~40 KB gzipped, and already proven for this exact use case.

### D7: Per-Feature Validation Pipeline

```
parse .zip (shpjs) -> FeatureCollection
  |
  for each feature[i]:
    |-> extract name from properties[name_column]
    |-> extract code from properties[code_column]
    |-> name empty or > 255 chars?           -> errors.push({ index: i, reason })
    |-> code present and > 32 chars?         -> errors.push({ index: i, reason })
    |-> repo.validateGeometry(feature.geometry)
    |     ST_IsValid false?                  -> errors.push()
    |     centroid > 500km from Ecuador?     -> errors.push()
    |     not Polygon/MultiPolygon?          -> errors.push()
    |-> code already in DB or seen in batch? -> skipped++
    |-> auto_parent? resolve parent:
    |     1. parent_code attr -> findByCode()
    |     2. ST_Contains fallback
    |     3. null + warning
    |-> repo.createInTransaction(queryRunner, input)
  |
  commit transaction
  return { imported, skipped, errors, warnings }
```

### D8: Response Envelope

```typescript
export interface ImportGeoZoneResponse {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; reason: string }>;
  warnings: string[];
}
```

### D9: Geometry Storage

Existing `geo_zones.polygon` column (migration 0005) stores `geometry` type. Import converts each feature's GeoJSON to `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))` -- same pattern as `repo.create()`. No new index needed; existing spatial index covers queries.

### D10: GET /geo-zones/form-data

New controller method returning static `levels` array + dynamic `parents` query:

```typescript
@Get('form-data')
@RequirePermission('READ')
async getFormData(): Promise<{ levels: string[]; parents: Array<{ id: string; name: string; code: string | null; level: string }> }>
```

Declared before `:id` route. Repository query: `SELECT id, name, code, level FROM geo_zones WHERE active = true ORDER BY level, name`.

## Data Flow

### Import Flow

    Browser                         Backend
    -------                         -------
    .zip file
      |
      +--(FileReader + shpjs)-->  preview modal (mini Leaflet map)
      |                           user maps columns, selects level
      |
      +--(POST /geo-zones/import, multipart + query params)
                                    |
                           GeoZonesController.importShapefile()
                                    |
                           GeoZonesService.importShapefile(buffer, query)
                                    |
                           shpjs(arrayBuffer) -> FeatureCollection
                                    |
                           queryRunner.startTransaction()
                           for each feature:
                             validate -> skip/error OR
                             repo.createInTransaction(queryRunner)
                           queryRunner.commitTransaction()
                                    |
                           purgeGeoCaches()
                           return { imported, skipped, errors, warnings }

### Map Filter Flow

    MapFiltersComponent                      MapComponent
    -------------------                      ------------
    provincia_id change
      |-> GeoZoneService.list({level:'canton', parent_id})
      |-> cantones signal updated, canton_id enabled
    canton_id change
      |-> GeoZoneService.list({level:'parroquia', parent_id})
      |-> parroquias signal updated
      |-> emit filtersChange({ ...existing, zone_id })
                                                |
                                       highlightLayer.clearLayers()
                                       if (zone_id) {
                                         find zone in loaded zones
                                         L.geoJSON(polygon, {color:'#ef4444', weight:3})
                                         map.fitBounds(layer.getBounds())
                                         filter markers by point-in-bounds
                                       }

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/modules/geo-zones/geo-zones.controller.ts` | Modify | Add `POST /import` + `GET /form-data` routes before `:id` |
| `backend/src/modules/geo-zones/geo-zones.service.ts` | Modify | Add `importShapefile()` + `getFormData()` methods |
| `backend/src/modules/geo-zones/geo-zones.repository.ts` | Modify | Add `createInTransaction()`, `findByCode()`, `findParentBySpatialContainment()`, `getFormData()`, `parent_name` join in `findAll()` |
| `backend/src/modules/geo-zones/dto/import-geo-zone.dto.ts` | Create | `ImportGeoZoneQueryDto` (level, auto_parent, name_column, code_column) |
| `backend/src/modules/geo-zones/dto/import-geo-zone-response.dto.ts` | Create | `ImportGeoZoneResponse` interface |
| `backend/package.json` | Modify | Add `shpjs` + `@types/shpjs` |
| `frontend/.../locations/services/geo-zone.service.ts` | Modify | Add `importShapefile()` + `getFormData()` methods |
| `frontend/.../locations/interfaces/igeo-zone.interface.ts` | Modify | Add `IImportGeoZoneResponse`, `IFormData`, `parent_name` to `IGeoZone` |
| `frontend/.../locations/location-list/location-list.component.ts` | Modify | Add "Importar" button, open dialog |
| `frontend/.../locations/components/shapefile-import-dialog/` | Create | Dialog: file input, shpjs parse, column mapping dropdowns, mini Leaflet preview, submit |
| `frontend/.../map/components/map-filters/map-filters.component.ts` | Modify | Add 3 zone FormGroup controls, cascading logic, zone signals |
| `frontend/.../map/components/map-filters/map-filters.component.html` | Modify | Add 3 `<select>` elements for provincia/canton/parroquia |
| `frontend/.../map/services/map-data.service.ts` | Modify | Add `zone_id` to `MapActiveFilters` |
| `frontend/.../map/map.component.ts` | Modify | Color-by-level zone styles, highlight layer, `fitBounds()`, point-in-bounds filter, zone tooltip |
| `frontend/package.json` | Modify | Add `shpjs` |

## Interfaces / Contracts

```typescript
// backend DTO
export class ImportGeoZoneQueryDto {
  @IsIn(GEO_ZONE_LEVELS) level!: GeoZoneLevel;
  @IsOptional() @IsBoolean() @Transform(({value}) => value === 'true') auto_parent?: boolean; // default true
  @IsOptional() @IsString() name_column?: string;  // default 'NAME'
  @IsOptional() @IsString() code_column?: string;   // default 'CODE'
}

// Response (not a class -- returned directly)
export interface ImportGeoZoneResponse {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; reason: string }>;
  warnings: string[];
}

// MapActiveFilters (extended)
export interface MapActiveFilters {
  status?: string;
  priority?: string;
  incident_category_id?: string;
  zone_id?: string;
}

// Zone style constant
const ZONE_STYLES: Record<GeoZoneLevel, L.PathOptions> = {
  provincia: { color: '#6366f1', weight: 2, opacity: 0.8, fillColor: '#6366f1', fillOpacity: 0.08, dashArray: '5 5' },
  canton:    { color: '#0891b2', weight: 2, opacity: 0.8, fillColor: '#0891b2', fillOpacity: 0.12 },
  parroquia: { color: '#059669', weight: 1.5, opacity: 0.8, fillColor: '#059669', fillOpacity: 0.15 },
  zona:      { color: '#d97706', weight: 1, opacity: 0.8, fillColor: '#d97706', fillOpacity: 0.10, dashArray: '2 4' },
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `importShapefile()` validation pipeline (geometry, duplicates, parent resolution, intra-batch dedup) | Jest mocks for repo; fixture GeoJSON features |
| Unit | `createInTransaction()` runs INSERT on given QueryRunner | Jest mock QueryRunner |
| Unit | `ImportGeoZoneQueryDto` validation rules | class-validator `validate()` |
| Unit | `getFormData()` returns sorted parents | Jest mock repo |
| Integration | `POST /geo-zones/import` with real DB (valid, invalid, mixed) | Testcontainers; fixture `.zip` |
| Integration | Parent spatial containment query (`ST_Contains`) | Testcontainers; seed parent province, import canton |
| Integration | `GET /geo-zones/form-data` with real DB | Testcontainers |
| Component | `ShapefileImportDialogComponent` preview + column mapping | TestBed; mock shpjs |
| Component | `MapFiltersComponent` cascading disable/enable + zone loading | TestBed; mock GeoZoneService |
| E2E | Upload 3-canton shapefile -> verify DB rows + response envelope | jest-e2e; real `.zip` fixture |

## Threat Matrix

N/A -- no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Uses existing `geo_zones` table (migrations 0002/0005/0013/0035). `shpjs` is the only new dependency (both package.json files). Rollback: remove import route + frontend dialog + shpjs dependencies.

## Open Questions

- [x] Frontend preview renderer: **Leaflet** (already loaded, no new dependency).
- [x] Column mapping defaults: auto-detect from DBF headers matching `name`/`nombre`/`NAME` and `code`/`codigo`/`CODE`; show all columns in dropdowns.
- [ ] Should `GET /geo-zones` response include `parent_name` by default (join cost) or only when a query param requests it? **Recommendation**: always include -- the join is a single `LEFT JOIN` and all current consumers benefit (list view, map tooltip).
