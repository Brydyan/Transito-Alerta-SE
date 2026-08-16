# Tasks: T3.7 IncidentCategories

Source: `sdd/t3.7-incident-categories/spec` (obs #406), `sdd/t3.7-incident-categories/design` (obs #407). Strict TDD: write failing test first, then implement.

## Phase 1: Infrastructure (Migration + Entities)

- [ ] 1.1 Create `database/migrations/0012_incident_categories.sql`: `incident_categories` table (uuid PK, `name` varchar(255), `parent_id` uuid null self-FK `ON DELETE SET NULL`, `created_at`, `updated_at`), idx on `parent_id`; `ALTER incidents ADD category_id uuid NULL REFERENCES incident_categories(id) ON DELETE RESTRICT` + idx; seed permission catalog rows for `incident-categories` resource (CREATE/READ/UPDATE/DELETE, hyphenated per D5)
- [ ] 1.2 Create `database/rollback/0012_incident_categories.DOWN.sql`: drop `incidents.category_id` column, then drop `incident_categories` table, then remove seeded permissions
- [ ] 1.3 Create `backend/src/entities/incident-category.entity.ts`: flat columns only (`id`, `name`, `parentId` mapped to `parent_id`, `createdAt`, `updatedAt`) — NO `@ManyToOne`/`@OneToMany` self-relation (D2)
- [ ] 1.4 Modify `backend/src/entities/incident.entity.ts`: add `@Column({name:'category_id', type:'uuid', nullable:true}) categoryId!: string | null`

## Phase 2: Repository Layer (CRUD + Cycle Detection + CTE)

- [ ] 2.1 RED: write `backend/src/modules/incident-categories/incident-categories.repository.spec.ts` for `buildTree()` (pure fn: flat CTE rows -> nested `CategoryNode[]`, sorted by `name` ASC per level, depth cap 1000) — no DB
- [ ] 2.2 GREEN: implement `backend/src/modules/incident-categories/incident-categories.repository.ts` — `getSubtree(rootId: string | null): Promise<CategoryNode[]>` via `@InjectDataSource().query()` recursive CTE, `listFlat()`, and `buildTree()` map-based link pass
- [ ] 2.3 RED: write tests for ancestor-walk cycle guard (self-parent, direct A->B->A, transitive A->B->C->A) in same spec file
- [ ] 2.4 GREEN: implement `validateNoCycles(categoryId: string | null, proposedParentId: string | null)` in repository, called inside the write transaction (D4)

## Phase 3: Service Layer (Business Logic + Error Mapping)

- [ ] 3.1 RED: write `backend/src/modules/incident-categories/incident-categories.service.spec.ts` — `create()` calls cycle guard then TypeORM `@InjectRepository(IncidentCategoryEntity)` insert; `update()` same; `delete()` catches PG `23503` -> `ConflictException` (409); missing id -> `NotFoundException` (404); `getTree()` delegates to `IncidentCategoriesRepository.getSubtree(null)`
- [ ] 3.2 GREEN: implement `backend/src/modules/incident-categories/incident-categories.service.ts` per D1/D6: `create(dto)`, `update(id, dto)`, `delete(id)` (catch 23503 -> Conflict), `findById(id)` (404 if missing), `list(filters)` (search/parent_id/pagination), `getTree()`

## Phase 4: DTOs, Module, Controller

- [ ] 4.1 Create `backend/src/modules/incident-categories/dto/create-incident-category.dto.ts`: `name` (required, string, 1-255), `parent_id` (optional, uuid, snake_case per design)
- [ ] 4.2 Create `backend/src/modules/incident-categories/dto/update-incident-category.dto.ts`: same fields, both optional
- [ ] 4.3 Create `backend/src/modules/incident-categories/incident-categories.module.ts`: `TypeOrmModule.forFeature([IncidentCategoryEntity])`, providers/exports for service + repository
- [ ] 4.4 RED: write `backend/src/modules/incident-categories/incident-categories.controller.spec.ts` — routes return entities directly, NO `{data}` envelope (D7); route order `GET /tree` before `GET /:id`; permission guards on CREATE/UPDATE/DELETE
- [ ] 4.5 GREEN: implement `backend/src/modules/incident-categories/incident-categories.controller.ts`: class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`; `GET /tree` (declared first), `GET /`, `GET /:id` (`ParseUUIDPipe`, 404), `POST` (`@RequirePermission('CREATE')`, 201), `PATCH /:id` (`@RequirePermission('UPDATE')`), `DELETE /:id` (`@RequirePermission('DELETE')`, `@HttpCode(204)`)
- [ ] 4.6 Modify `backend/src/app.module.ts`: register `IncidentCategoriesModule`

## Phase 5: E2E Integration

- [ ] 5.1 Create `backend/test/e2e/incident-categories.e2e-spec.ts` covering TS-1..TS-10 from spec: root/child create, cycle rejection on create+update (400), depth>=3 tree, paginated+filtered list, delete-with-children (SET NULL, children become roots), delete referenced-by-incident (409), 404 on missing id, permission guard 403s. Use `TestEnvironment.start/reset/provisionUser()` pattern (roles.e2e-spec.ts precedent); wire CREATE/UPDATE/DELETE permissions into provisioned user; confirm 0012 migration auto-picked via numeric scan in `backend/test/support/run-migrations.ts`

## Implementation Order

Sequential, each phase gates the next: 1.1-1.4 (schema/entities) -> 2.1-2.4 (repo, TDD) -> 3.1-3.2 (service, TDD) -> 4.1-4.6 (DTOs/module/controller, TDD) -> 5.1 (e2e, all layers wired). Total 16 tasks, ~10h.
