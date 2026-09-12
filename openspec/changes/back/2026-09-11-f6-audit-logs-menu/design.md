# Design: F6 — Auditoría de Acceso Menu Entry

**Change**: `2026-09-11-f6-audit-logs-menu`
**Scope**: MENU_MAP static configuration
**Date**: 2026-09-11

---

## Architecture Decisions

### D1: Icon Choice — `file-text`

**Decision**: Use Lucide icon `file-text` (not `history`, not `log`).

**Rationale**:
- `file-text`: Evokes "report" + "document" — audit logs = written records of access.
- `history`: Also valid (timeline semantics), but less immediately clear.
- `log`: Not a valid Lucide icon; confusion with technical logging.

**Trade-off**: `history` would be slightly more "timeline" intuitive, but `file-text` is more "report/compliance" oriented. Audit logs are primarily for compliance + discovery (report view) rather than real-time timeline.

**Alternatives rejected**:
- `shield`: Already used by Roles; would confuse RBAC roles with audit.
- `eye`: Vigilance/oversight is valid but less "actionable" (file-text says "here's a document").

---

### D2: Group — `GESTIÓN`

**Decision**: Place under group "GESTIÓN" (not "CATÁLOGOS" or new group).

**Rationale**:
- GESTIÓN (Administration): Usuarios (60), Roles (70), Auditoría (75), Organizaciones (80).
- CATÁLOGOS: Categorías, Ubicaciones — reference data, not operational control.
- Audit is operational control (who accessed what) → belongs with user/role/org management.
- Semantically: Auditoría is **tool for managing** users/roles/orgs, not a catalog of reference data.

**Alternatives rejected**:
- New group "SEGURIDAD": Too narrow; audit is broader than security (compliance, discovery, troubleshooting).
- CATÁLOGOS: Wrong — audit is not reference data.

---

### D3: Order — 85

**Decision**: Place AFTER Organizaciones (80), order=85.

**Rationale**:
- Natural flow: manage users → assign roles → manage orgs → **audit changes** ← ancillary, not core GESTIÓN work
- Grouping: Auditoría is a **read-only inspection tool** for change tracking, not an operational workflow like user/role/org CRUD
- Sequence: 60 (Usuarios) < 70 (Roles) < 80 (Organizaciones) < 85 (Auditoría) ✓
- Ascending order: Required by test; validated automatically

**Alternatives rejected**:
- Order 75: Would suggest audit sits in core admin flow, but it's ancillary (read-only, compliance-driven).
- New group "SEGURIDAD": Audit is not security-specific; it's change tracking for operational + compliance reasons.

**Alternatives rejected**:
- Order 65 (after Usuarios): Roles are parent of audit scope; should come after.
- Order 85 (after Organizaciones): Org management is separate structure; audit should come first.

---

### D4: Permission Filtering — No Code Change

**Decision**: Rely on existing `MenusService.getMenuForUser()` filtering logic. No changes needed.

**Rationale**:
- `MenusService` line 62 already iterates MENU_MAP and filters by permission.
- `PermissionLookupService.getUuid()` resolves "READ audit-logs" to permission uuid.
- If user has uuid in `user.permissions` array, entry appears; else omitted.
- Requires: permission "READ audit-logs" must exist in `permissions` table (migration 0053 responsibility).

**Implementation**:
- MENU_MAP entry only needs `requires: 'READ audit-logs'` string.
- Format: "ACTION resource" (same as all other entries).
- MenusService does the rest (no modification).

**Alternatives rejected**:
- Hard-coded role check (e.g., `requires: 'master_only'`): Would break dynamic RBAC. Permissions are the source of truth.
- Custom filtering logic in MenusService: Unnecessary; existing pattern works.

---

## File Changes Matrix

| File | Change | Why |
|------|--------|-----|
| `backend/src/modules/menus/menu-map.ts` | Add 1 entry to MENU_MAP Record | Main change |
| `backend/src/modules/menus/menu-map.spec.ts` | None | Existing tests cover automatically |
| `backend/src/modules/menus/menus.service.ts` | None | Filtering logic unchanged |

---

## Constraints

- Icon must be valid Lucide pattern: `^[a-z][a-z0-9-]*$` (enforced by test).
- Order must be unique and ascending (enforced by test).
- Route `/admin/audit-logs` must exist in frontend app.routes.ts (validated by CRITICAL-2 test).
- Permission "READ audit-logs" must exist in `permissions` table (migration 0053 prerequisite).

---

## Testing Strategy

- **Unit**: menu-map.spec.ts (existing) covers all 5 requirements automatically.
- **Integration**: MenusService.getMenuForUser() tested with mock user having/lacking permission.
- **Manual**: master sees entry; non-master doesn't.
- **CI**: `npm test` must pass; `npm run typecheck` clean.

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migration 0053 not executed; entry invisible | Medium | Document as prerequisite; add task checklist |
| Icon invalid | Low | Test suite rejects immediately |
| Route doesn't exist in frontend | Medium | CRITICAL-2 test validates; CI blocks |
| Order breaks ascending sequence | None | Test validates automatically |
