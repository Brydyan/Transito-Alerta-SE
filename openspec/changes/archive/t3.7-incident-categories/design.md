# Design: T3.7 IncidentCategories

Source: `sdd/t3.7-incident-categories/proposal` (4 locked decisions). Artifact store: hybrid.

## Technical Approach

Adjacency-list table + **split persistence**: `@InjectRepository(IncidentCategoryEntity)` in the service for flat CRUD (the majority pattern — Comments/Users/Roles/Notifications), and a thin `IncidentCategoriesRepository` with `@InjectDataSource().query()` for the ONE thing TypeORM can't express cleanly: the recursive CTE subtree (the `IncidentsRepository`/`GeofencingRepository` precedent). Tree assembly happens in memory from a flat CTE result, so no TypeORM tree entities and no N+1.

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| D1 | Persistence split | TypeORM repo for CRUD + raw CTE repo for tree | (a) all-raw like Incidents; (b) all-TypeORM w/ `@Tree('closure-table')` | (a) discards validation/typing for trivial CRUD; (b) closure-table needs a synchronize-managed table — forbidden by CC3 (manual SQL migrations only) |
| D2 | Entity shape | Flat columns, camelCase props + `name:` snake_case mapping, **no** `@ManyToOne`/`@OneToMany` self-relation | Self-referencing relations | 8 of 9 entities in `backend/src/entities/` are flat; self-relations would tempt lazy-load N+1 and duplicate what the CTE already returns |
| D3 | Tree assembly | Client-side `Map`-based link pass over flat CTE rows, `depth` cap 1000 | Recursive SQL JSON aggregation | Simpler to unit-test without a DB; depth cap is the backstop against a cycle that slipped past the guard |
| D4 | Cycle guard | Ancestor walk from candidate `parent_id`, inside the same transaction as the write | DB `CHECK`/trigger | Portable, unit-testable, returns a domain 400; also catches self-parent |
| D5 | Permission resource | Path-inferred → literal string **`incident-categories`** (hyphen) | Explicit `@RequirePermission('READ','incident_categories')` | Every existing controller relies on `inferResourceFromPath`; with `setGlobalPrefix('api')` the inferred segment is `incident-categories`. Seeds MUST use that exact hyphenated string or the guard denies everything |
| D6 | Delete conflict | Catch PG `23503` → `ConflictException` (409) | Pre-count referencing incidents | Pre-count races; the FK is the real invariant |
| D7 | Response shape | Return rows/entities directly (no `{data}` envelope) | `{ data: ... }` | Matches all 8 existing controllers; `SnakeCaseResponseInterceptor` already snake_cases output globally |

## Data Flow

    POST/PATCH ─→ Controller ─→ Service ─→ cycle guard (ancestor walk)
                  (JwtAuthGuard,             │
                   PermissionGuard)          └─→ TypeORM repo ─→ incident_categories

    GET /tree ──→ Service ─→ CategoriesRepository.getSubtree(null)
                                  │ recursive CTE (flat rows + depth)
                                  └─→ buildTree() ─→ nested roots[]

## File Changes

| File | Action | Description |
|---|---|---|
| `database/migrations/0012_incident_categories.sql` | Create | Table, self-FK `ON DELETE SET NULL`, idx on `parent_id`, `ALTER incidents ADD category_id uuid NULL REFERENCES ... ON DELETE RESTRICT` + idx, permission catalog seeds |
| `database/rollback/0012_incident_categories.DOWN.sql` | Create | Drop column then table (note `.DOWN.sql` suffix — required naming) |
| `backend/src/entities/incident-category.entity.ts` | Create | `IncidentCategoryEntity` |
| `backend/src/entities/incident.entity.ts` | Modify | Add `@Column({name:'category_id',type:'uuid',nullable:true}) categoryId!: string \| null` |
| `backend/src/modules/incident-categories/{controller,service,repository,module}.ts` | Create | Module wiring |
| `backend/src/modules/incident-categories/dto/{create,update}-incident-category.dto.ts` | Create | class-validator DTOs, snake_case `parent_id` |
| `backend/src/app.module.ts` | Modify | Register `IncidentCategoriesModule` |
| `backend/test/e2e/incident-categories.e2e-spec.ts` | Create | Depth-3 tree, cycle 400, delete-RESTRICT 409 |

## Interfaces / Contracts

```ts
// Repository (raw CTE only)
getSubtree(rootId: string | null): Promise<CategoryNode[]>;   // nested
listFlat(): Promise<CategoryRow[]>;                            // depth-annotated
interface CategoryNode { id; name; parent_id: string|null; created_at: Date; children: CategoryNode[] }
```

Routes (all under `/api`, class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`):
`GET /incident-categories/tree` (READ) — declared **before** `GET /:id` or Nest matches `tree` as an id;
`GET /` (READ), `GET /:id` (READ, 404), `POST` (CREATE, 201), `PATCH /:id` (UPDATE), `DELETE /:id` (DELETE, 204).

## Testing Strategy (Strict TDD — `npm test`)

| Layer | What | How |
|---|---|---|
| Unit (service) | cycle rejection (self, direct, transitive), 404, 409 mapping from `23503` | mocked repos |
| Unit (repository) | `buildTree` flat→nested, depth cap | pure function, no DB |
| E2E | depth-≥3 tree, CRUD, parent delete → children become roots, delete referenced category → 409 | Testcontainers, migrations applied numerically |

## Migration / Rollout

Manual apply of `0012` (CC3: `synchronize`/`migrationsRun` stay false). `incidents.category_id` is nullable — existing rows unaffected, zero backfill. E2E harness picks up `0012` automatically via the numeric scan in `test/support/run-migrations.ts`.

## Open Questions

- [ ] Permission resource string ships as `incident-categories`; confirm no admin UI expects `incident_categories`.
