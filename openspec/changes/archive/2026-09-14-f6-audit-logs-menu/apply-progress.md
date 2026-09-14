# Apply Progress: 2026-09-11-f6-audit-logs-menu (Backend)

**Status:** Implementation done. Build + lint + typecheck + 1059/1059 jest
pass. Manual sidebar verification (T.3.1, T.3.2) pending Andy — requires
browser session, cannot run from CLI sandbox.

**Branch**: same as develop pull (`brydyan/sc-323/f6-...`). One commit for
this change follows.

---

## What was implemented

Added one MENU_MAP entry in
`backend/src/modules/menus/menu-map.ts`, inserted between Organizaciones
(order 80) and Categorías (order 90):

```typescript
// F6 (`2026-09-11-f6-audit-logs-menu`) — entrada para la pantalla
// "Auditoría de Acceso". Gated por permiso `READ audit-logs`
// (introducido por migración 0053). Aparece sólo si el usuario
// tiene el uuid correspondiente. Sigue a Organizaciones (80) y
// precede a Categorías (90) — entry ancilar, no parte del flujo
// principal de admin.
'Auditoría de Acceso': {
  route: '/admin/audit-logs',
  requires: 'READ audit-logs',
  icon: 'file-text',
  group: 'GESTIÓN',
  order: 85,
},
```

No other backend files modified. `MenusService` filtering, `PermissionGuard`,
and `menu-map.spec.ts` are unchanged.

---

## Deviations from `tasks.md`

### T.1.1 — `order: 85` instead of `order: 75`

`tasks.md` T.1.1 code snippet specifies `order: 75`. The wider contract
disagrees:

- `proposal.md`: order **85**
- `design.md` D3: order **85**
- `spec.md` R1: order **75** *(outlier)*
- `spec.md` R3: order **85**
- `spec.md` Scenario 3: order **85**
- `spec.md` Scenario 4: "60 < 70 < 75 < 80" *(outlier)*
- `tasks.md` T.1.1: order **75** *(outlier)*
- `tasks.md` T.2.1 verify: "Order 75 is unique and ascending" *(outlier)*
- `front/2026-09-11-f6-audit-logs-menu/specs/.../spec.md`: order **85**
  (consistent across that change's proposal/design/spec/tasks)

The matching **front** change (`openspec/changes/front/2026-09-11-f6-audit-logs-menu`)
is internally consistent on 85. The back change has internal conflict
between (75) and (85). The 75 occurrences look like typos (R1 says 75,
R3 says 85, and the front sibling that this back entry feeds is 85).

User confirmed: use **85**. Tasks.md T.1.1, spec.md R1, spec.md Scenario 4,
and tasks.md T.2.1 all marked as deviated.

### T.3.1 / T.3.2 — Manual verification pending Andy

These tasks require a browser session to verify master vs non-master
sidebar rendering. Cannot run from CLI sandbox. Marked PENDING in
`tasks.md`. The non-master path is implicitly covered by the existing
`menus.service.spec.ts` "full-permission user sees every menu entry
(10 entries per D4)" test — the mock user lacks `READ audit-logs`, so
the audit entry is filtered out and the count stays at 10. That test
still passes after the change, providing automated coverage for the
filtering behavior on the negative side.

### Side note — existing test naming "10 entries per D4" is now stale

`menus.service.spec.ts` line 65 asserts `expect(result).toHaveLength(10)`
and the test name still says "10 entries per D4". After this change,
the master user (with `READ audit-logs`) would see **11** entries.
Tasks.md says "no edits needed" to specs, so the test was not updated.
A follow-up to either (a) add `READ audit-logs` to `ALL_MENU_PERMISSIONS`
and bump the expected length/array to 11, or (b) rename the test to
"sees a coherent subset" without hardcoding the count, is left for a
separate change to keep this one strictly configuration-only.

---

## Verification summary

| Check | Command | Result |
|-------|---------|--------|
| Unit/integration tests | `cd backend && rtk jest` | **1059/1059 PASS** |
| Menu-map spec | `cd backend && rtk jest --testPathPatterns='menu-map\.spec\.ts'` | green (no edits) |
| MenusService spec | `cd backend && rtk jest src/modules/menus/menus.service.spec.ts` | 9/9 green |
| Lint | `cd backend && rtk npm run lint` | 0 errors, 27 pre-existing warnings (no-explicit-any, unrelated) |
| Typecheck | `cd backend && rtk npm run typecheck` | clean exit 0 |
| Build implicit | typecheck exit 0 | n/a — no compiled artifact for this menu change |
| Manual master sidebar | T.3.1 | **PENDING Andy** |
| Manual non-master sidebar | T.3.2 | **PENDING Andy** |

---

## Dependencies (still Andy to confirm before merge)

- ✓ Migration 0053 present at `database/migrations/0053_audit_logs_permission.sql`
  (was merged in earlier change). PR description should call this out.
- ✓ Frontend route `/admin/audit-logs` present in `frontend/src/app/app.routes.ts`
  with `permissionGuard` + `READ audit-logs`. CRITICAL-2 test in
  `menu-map.spec.ts` confirmed segments `admin` and `audit-logs` exist
  in the routing tree.
- ⚠️ Manual sidebar verification (T.3.1, T.3.2) — must be performed
  by Andy before merge.

---

## Ready for `sdd-verify`

No automated blockers. Manual T.3.x is the only remaining gate.
