# Apply Progress: Departments Module

**Change**: `2026-09-15-departments-module`  
**Status**: ⏳ Ready for implementation (Phase A–D pending)  
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

---

## Phase A: Entity & Migrations (0h / 2h Estimate)

- **Status**: Not started
- **Blocker**: None
- **Next**: Start A.1 when ready to implement

---

## Phase B: Repository & Service (0h / 3h Estimate)

- **Status**: Not started
- **Depends on**: Phase A complete

---

## Phase C: Controller & Permissions (0h / 2h Estimate)

- **Status**: Not started
- **Depends on**: Phase B complete

---

## Phase D: Tests & Verification (0h / 2h Estimate)

- **Status**: Not started
- **Depends on**: Phase C complete
- **Gate**: sdd-verify

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
