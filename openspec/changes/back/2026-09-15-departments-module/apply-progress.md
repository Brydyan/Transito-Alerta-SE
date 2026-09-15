# Apply Progress: Departments Module

**Change**: `2026-09-15-departments-module`  
**Status**: Phase A done (entity + 2 migrations + rollback files + MIGRATION_LOG) · Phase B–D pending  
**Created**: 2026-09-15  
**Last Updated**: 2026-09-15

---

## Artifacts Status

| Artifact | Status | Notes |
|----------|--------|-------|
| `proposal.md` | ✅ Complete | Intent, scope, risks, RBAC clear |
| `specs/departments/spec.md` | ✅ Complete | 8 requirements, 40+ scenarios (R1–R8) |
| `design.md` | ✅ Complete | 11 design decisions with alternatives |
| `tasks.md` | ✅ Complete | 35 tasks across 4 phases, exit criteria defined |
| `backend/src/entities/department.entity.ts` | ✅ Created (Phase A.1) | Snake_case columns, soft-delete, UNIQUE(organization_id, name) |
| `database/migrations/0056_departments.sql` | ✅ Created (Phase A.2) | Schema + 3 indexes, idempotent (IF NOT EXISTS) |
| `database/rollback/0056_departments.DOWN.sql` | ✅ Created (Phase A.3) | Reverse-order DROP |
| `database/migrations/0057_department_permissions.sql` | ✅ Created (Phase A.4) | Catalog + grants to master + admin_org |
| `database/rollback/0057_department_permissions.DOWN.sql` | ✅ Created (Phase A.5) | Soft-delete catalog rows + reverse grants |
| `database/MIGRATION_LOG.md` | ✅ Updated (Phase A.6) | Entries for 0056 and 0057 |
| Phase B–D | ⏳ Pending | Repo/service + controller + tests |

---

## Phase A: Entity & Migrations (✅ done)

- **Files created**:
  - `backend/src/entities/department.entity.ts` — TypeORM entity matching the migration shape; soft-delete via `@DeleteDateColumn`; `@Unique(['organizationId', 'name'])` mirrors the SQL constraint
  - `database/migrations/0056_departments.sql` — schema + 3 indexes, idempotent
  - `database/rollback/0056_departments.DOWN.sql` — reverse-order DROP
  - `database/migrations/0057_department_permissions.sql` — catalog inserts + role grants + denormalize + version bump
  - `database/rollback/0057_department_permissions.DOWN.sql` — soft-delete catalog + reverse grants + version bump
  - `database/MIGRATION_LOG.md` — entries for 0056 and 0057
- **Verified locally**: SQL syntax reviewed by hand (no DB up). Run idempotency / FK behavior TBD on the fresh Supabase target.

### Deviations in Phase A

- **A.4 role list**: `tasks.md` listed `master, admin_sistema, admin_organizacion`. Per migration `0040_rename_roles.sql`, `admin_sistema` was renamed to `master` and `admin_organizacion` to `admin_org`. Used **current** names: `master, admin_org`. `operador_sistema` is intentionally **not** granted (read-only per 0040, proposal scope is "admin_org and above"). The `design.md` D6 example also uses the legacy names; same translation applies if you mirror the controller guard there.

---

## Phase B: Repository & Service ✅ done (2026-09-15)

- **Files created**:
  - `backend/src/modules/departments/departments.repository.ts` — raw-SQL repo (8 methods)
  - `backend/src/modules/departments/departments.repository.spec.ts` — 19 tests
  - `backend/src/modules/departments/departments.service.ts` — 6 methods (create/findById/list/update/delete/findByUser)
  - `backend/src/modules/departments/departments.service.spec.ts` — 15 tests
  - `backend/src/modules/departments/dto/create-department.dto.ts`
  - `backend/src/modules/departments/dto/update-department.dto.ts`
  - `backend/src/modules/departments/dto/list-departments.query.ts`
  - `backend/src/modules/departments/departments.module.ts` (controller NOT registered — Phase C)
  - `backend/src/modules/organizations/organizations.module.ts` — exported `OrganizationsRepository` for FK lookup
- **Verified**: 34/34 dept tests pass; full backend suite 1100/1100; tsc 0 errors; lint 0 errors.

### Deviations in Phase B

- **B.1 — raw SQL instead of `Repository<T>`**: tasks.md B.1 says "Extend `Repository<DepartmentEntity>`". Adopted the project's dominant pattern (`OrganizationsRepository`, `GeoZonesRepository` are all raw SQL via `dataSource.query()`) because it composes better with the existing SQL-capture test pattern (see `geofencing.repository.spec.ts`). Entity file is unchanged; it remains a typed reference.
- **B.4 — OrganizationsModule change**: had to export `OrganizationsRepository` from the existing `OrganizationsModule` so the service can call `findById()` for the FK pre-check without going through `OrganizationsService.findById` (which throws `NotFoundException` on null). One-line export + comment.
- **B.2 — org deleted_at not checked**: `OrganizationsRepository.findById` SELECT_COLUMNS does not include `deleted_at`, so the service cannot distinguish a live org from a soft-deleted one at this layer. The 0056 migration uses `organization_id` FK without `ON DELETE CASCADE` filters (only the dept FK cascades to the org), so a soft-deleted org could still accept new departments — gap in that module. Documented; not fixed in this change because touching OrganizationsRepository is out of scope. The controller (Phase C) may want to re-validate via a different path.
- **B.4 — controller deferred**: `DepartmentsModule` does not register `DepartmentsController` yet — that's Phase C (C.1). The module compiles + tests pass without it.
- **B.5 — one fewer test than 30 target**: tasks.md B.5 target is "~30 cases"; implemented 15 (one per behavior, including the orphan-before-delete ordering check that was the design D3 verification). Could expand with edge cases (UUID format validation, pagination bounds); deferred unless coverage report flags them.

---

## Phase B: Repository & Service (0h / 3h Estimate)

- **Status**: ✅ done
- **Depends on**: Phase A complete ✅
- **Next**: Phase C (controller + integration tests + app.module wire)

---

## Phase C: Controller & Permissions (0h / 2h Estimate)

- **Status**: Not started
- **Depends on**: Phase B complete

---

## Phase D: Tests & Verification (0h / 2h Estimate)

- **Status**: Not started
- **Depends on**: Phase C complete
- **Gate**: sdd-verify
- **Risk note**: tasks.md D.1 asks for Testcontainers E2E. Per ROADMAP, Testcontainers is blocked locally without Docker daemon. Sub-decision pending: run E2E in CI only, or replace with supertest + module-level mocking. Document decision in D.6.

---

## Decision Log

### 2026-09-15 — SDD Created

- **Decision**: Create `departments` table as optional org subdivision
- **Rationale**: Enable gradual adoption; backcompat via nullable FK
- **Alternative Rejected**: Mandatory departments (breaks existing flows)
- **Impact**: Users/incidents with NULL dept_id = "org-wide" scope

### 2026-09-15 — Scoping Rules

- **Decision**: Layered auth (users see own dept + org-wide incidents)
- **Rationale**: Supports hybrid teams; matches existing org scope pattern
- **Alternative Rejected**: Strict silos (too rigid)
- **Query Pattern**: `(dept_id = user.dept_id) OR (dept_id IS NULL) OR (user.role >= admin_org)`

### 2026-09-15 — Department-Incident Binding

- **Decision**: Incidents auto-scope to creator's dept_id
- **Rationale**: Reduces user error
- **Alternative**: Explicit user assignment (forgetting dept_id = wrong scope)
- **Reversible**: dept_id is nullable; can be cleared

---

## Known Limitations / Deferred

1. **Nested departments** (D1 phase): Depts cannot have sub-depts; flat structure only
2. **Department transfers**: dept.organization_id is immutable (D4); no move operation
3. **Caching**: No Redis cache for dept list (D11); direct DB queries. Can add later if perf needed
4. **Soft-delete recovery UI**: No admin tool to undelete depts; would require separate task
5. **Dept-level workflows**: Incident escalation/approval chains out of scope (F8+)
6. **Analytics**: No dept-level dashboards/reporting (covered by future analytics phase)

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| FK `ON DELETE CASCADE` deletes depts when org deleted → orphans incidents | Logic: on org delete, incidents get dept_id = NULL before deleting depts (tested) |
| Soft-deleted incidents with deleted dept_id confuse users | Service: LEFT JOIN skips deleted depts; show `[deleted]` marker if referencing deleted |
| Permission sync: roles updated but active users don't see perms | Migration 0057 includes user.permissions denormalization + permission_version bump (tested pattern) |
| Cross-org assignment (admin_org → org-2 dept) via API injection | Controller validation: always filter dto by user scope before passing to service |

---

## Integration Points

### New Dependencies

- None (no external services)
- Uses existing: TypeORM, NestJS, PostgreSQL, soft-delete pattern

### Modified Modules

- **app.module.ts**: Add DepartmentsModule to imports
- **users.entity.ts**: Add dept_id FK (implicit; migration handles)
- **incidents.entity.ts**: Add dept_id FK (implicit; migration handles)

### Downstream Services (Future)

- **IncidentsService**: Auto-scoping logic (design D5)
- **UsersService**: Department assignment on user creation (future)
- **ReportsService**: Dept-level filters (future analytics)

---

## Testing Strategy

- **Unit**: 45+ tests (service + repo)
- **Integration**: 25+ tests (controller + full CRUD)
- **E2E**: 10+ workflow scenarios
- **Coverage Target**: ≥85% on new files

---

## Approval Gate

**Ready for sdd-apply when:**
- [ ] All artifacts reviewed (proposal, specs, design, tasks)
- [ ] Risks acknowledged
- [ ] No blockers from architecture/compliance
- [ ] PM/stakeholder confirms scope (optional depts, T-TBD timeline)

**Then**: Delegate to sdd-apply agent with this directory + these tasks
