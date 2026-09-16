# Proposal: Departments Module (Organizational Scoping)

**Change**: `2026-09-15-departments-module`  
**Scope**: Backend (NestJS) + Database migration  
**Date**: 2026-09-15  
**Epic**: Organization management (F7 / post-F6)

---

## Intent

Subdivide organizations into departments, enabling fine-grained incident jurisdiction and user scoping. Currently, incidents belong to an organization, but when an organization spans multiple geographic or functional areas (e.g., traffic, infrastructure, waste), **there is no way to restrict visibility or assignment to a subset of users within that org**.

This change adds:
1. A `departments` table linking to `organizations`
2. Optional `department_id` FK on `users` and `incidents`
3. A new `DepartmentsModule` with CRUD + service layer
4. Permission rules: dept admins see only their dept's incidents; users assigned to a dept can resolve only those incidents

**Result**: Organizations can partition incident workflows by department without creating separate org rows.

---

## Scope

### In Scope

**Backend:**
- New migration `0056_departments.sql`: create `departments` table + FK on users/incidents
- `DepartmentEntity` (TypeORM) with soft delete + org relationship
- `DepartmentsRepository` (query patterns: by org, by user, soft-delete filtering)
- `DepartmentsService` (CRUD + list/find methods)
- `DepartmentsController` (REST endpoints: GET/POST/PATCH/DELETE)
- Permission catalog rows: `departments` resource with `READ/CREATE/UPDATE/DELETE` actions
- Role permission assignment: `admin_organizacion` and above gain `departments` perms
- Integration tests: CRUD scenarios, soft delete, permission validation
- Unit tests: service business logic, edge cases

**Frontend:**
- Out of scope (T-TBD): UI for dept management. Placeholder data structures only.

### Out of Scope

- **Departmental workflows**: incident escalation, approval chains, cross-dept comments (F8+ future)
- **Real-time subscriptions**: WebSocket for dept-scoped incident streams (F9+)
- **Reporting by dept**: analytics/dashboard dept-level breakdowns (analytics phase)
- **Audit trail for dept changes**: will be captured by existing audit module (0045), no special handling needed
- **Department hierarchy** (nested depts): start with flat 1-level depts; multi-level is T+2
- **Budget/capacity tracking per dept**: not a v1 requirement

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/migrations/0056_departments.sql` | New | Create `departments` table + constraints + indexes |
| `database/rollback/0056_departments.DOWN.sql` | New | Rollback migration |
| `backend/src/entities/department.entity.ts` | New | TypeORM entity with soft delete |
| `backend/src/modules/departments/departments.module.ts` | New | NestJS module definition |
| `backend/src/modules/departments/departments.repository.ts` | New | Query patterns + scope filters |
| `backend/src/modules/departments/departments.service.ts` | New | Business logic (CRUD, filtering) |
| `backend/src/modules/departments/departments.controller.ts` | New | REST endpoints + permission guards |
| `backend/src/modules/departments/dto/*.dto.ts` | New | Input/output DTOs |
| `backend/src/modules/departments/departments.service.spec.ts` | New | Unit tests |
| `backend/src/modules/departments/departments.controller.spec.ts` | New | Integration tests |
| `backend/src/app.module.ts` | Modified | Import `DepartmentsModule` |
| `database/migrations/0057_department_permissions.sql` | New | Insert permission catalog + grant to roles |
| `database/MIGRATION_LOG.md` | Modified | Document new migrations |

---

## DB Schema Changes

### Migration 0056: Create departments table

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, name) -- dept names unique within org
);

ALTER TABLE users ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX idx_departments_org_deleted ON departments(organization_id, deleted_at);
CREATE INDEX idx_users_department ON users(department_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_department ON incidents(department_id) WHERE deleted_at IS NULL;
```

### Migration 0057: Permission catalog

```sql
INSERT INTO permissions (resource, action) VALUES
  ('departments', 'READ'),
  ('departments', 'CREATE'),
  ('departments', 'UPDATE'),
  ('departments', 'DELETE')
ON CONFLICT DO NOTHING;

-- Grant to admin_sistema, admin_organizacion
UPDATE roles SET permissions = ... WHERE name IN ('admin_sistema', 'admin_organizacion');
```

---

## RBAC & Permissions

| Role | departments | Scope |
|------|-------------|-------|
| `master` | R/C/U/D | Global (all orgs, all depts) |
| `admin_sistema` | R/C/U/D | Global (all orgs, all depts) |
| `operador_sistema` | R | Global read-only |
| `admin_organizacion` | R/C/U/D | Own org's depts only (scoped by org_id) |
| `operador_organizacion` | R | Own org's depts only |
| `reporter` | — | No access |

**Scoping rule (D3 style):**
- `admin_organizacion` with `UPDATE departments` can only update depts where `organization_id = user.organization_id`
- Enforced in service layer + optional DB check via authorization query

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Backfill: existing users/incidents have `department_id = NULL` | High | Explicit by design. Null means "not assigned to dept" (org-wide). Migration includes explanatory comment. |
| Users assigned to org but not dept: do they see org-wide incidents? | Med | Design D2 clarifies: users with no dept see incidents with NULL dept_id (org scope baseline). |
| Soft delete on departments orphans incidents | Low | FK has `ON DELETE SET NULL` — incidents remain with NULL dept (safe revert to org scope). |
| Permission grant on roles doesn't sync to active users | High | Migration 0057 includes user.permissions denormalization + permission_version bump (pattern from 0052). |
| Race condition: incident assigned to dept while user dept changes | Low | No real-time scoping enforced; each query checks current user.department_id at read time. Worst case: stale data for milliseconds. |

---

## Rollback Plan

1. Revert migrations 0057, 0056 (in order)
2. Remove `DepartmentsModule` from app.module.ts
3. Delete all files in `backend/src/modules/departments/`
4. No code changes needed elsewhere (FKs are nullable)
5. Users/incidents revert to NULL dept_id (org-wide scope)

---

## Dependencies

- `organizations` (0001/0015) — depts reference orgs
- `users` (0001) — users optionally reference depts
- `incidents` (0004) — incidents optionally reference depts
- `roles.permissions` (0009/0051/0052) — permission catalog already established
- `AuthService` — authorization checks at controller/service layer
- No new dependencies; no external services required

**NestJS version**: 10.4.4 (already present)

---

## Success Criteria

- [ ] Migration 0056 applies cleanly; `pnpm run migrate` succeeds
- [ ] Migration 0057 grants perms to roles; verify via `SELECT * FROM permissions WHERE resource='departments'`
- [ ] GET `/api/departments` returns 200 with paginated list; admin_org sees only own org depts
- [ ] POST `/api/departments` (admin_org) creates dept under own org; cross-org attempt returns 403
- [ ] PATCH `/api/departments/:id` updates name/description; soft delete works
- [ ] DELETE `/api/departments/:id` soft-deletes; incidents with that dept_id become dept_id = NULL
- [ ] `npm test` passes: 50+ new unit tests for service/repository
- [ ] `npm run test:e2e` passes: CRUD + scope scenarios with real DB
- [ ] `npm run lint` + `npm run typecheck` pass with no warnings
- [ ] `npm run build` completes successfully
- [ ] Documentation in `MIGRATION_LOG.md` updated

---

## Implementation Order

1. **Phase A** (2h): Entity + migration files
   - DepartmentEntity, 0056_departments.sql, 0057_permissions.sql
   - Rollback files

2. **Phase B** (3h): Repository + Service
   - DepartmentsRepository (query patterns)
   - DepartmentsService (CRUD + filtering)
   - Unit tests

3. **Phase C** (2h): Controller + DTOs
   - DepartmentsController (endpoints)
   - Create/Update/List DTOs
   - Permission guards

4. **Phase D** (2h): Integration + E2E
   - Controller tests (integration scenarios)
   - E2E tests (full workflow)
   - Migration verification

**Total estimate**: 9 hours
