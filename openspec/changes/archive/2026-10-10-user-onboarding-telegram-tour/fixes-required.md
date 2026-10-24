# Fixes Required — back/2026-10-10-user-onboarding-telegram-tour

**Verdict**: FAIL
**Date**: 2026-10-10
**Verifier**: sdd-verify

---

## CRITICAL-1 — E2E regression: admin-create-user-roles.e2e-spec.ts

**File**: `backend/test/e2e/admin-create-user-roles.e2e-spec.ts`
**Line**: 93 (`expect(res.status).toBe(201)`)
**Symptom**: Returns 400 instead of 201 after the D1 validation was added.

**Root Cause**: The test sends `POST /api/users` with `role_id = admin_org` and no `organization_id`/`department_id`. This was valid before D1. After D1, sectional roles require both fields.

**Fix Options** (pick one):

**Option A** — Switch the target role to a global role (simpler):
```typescript
// Replace `admin_org` lookup with `operador_sistema`
const { rows: roleRows } = await env.pg.query<{ id: string }>(
  `SELECT id FROM roles WHERE name = 'operador_sistema' AND deleted_at IS NULL LIMIT 1`,
);
// No organization_id / department_id needed — global role strips them.
```

**Option B** — Keep `admin_org` and supply a real org + dept in the payload:
```typescript
// After role lookup, also provision an org and dept:
const { rows: orgRows } = await env.pg.query<{ id: string }>(
  `SELECT id FROM organizations WHERE deleted_at IS NULL LIMIT 1`,
);
const orgId = orgRows[0].id;
const { rows: deptRows } = await env.pg.query<{ id: string }>(
  `SELECT id FROM departments WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
  [orgId],
);
const deptId = deptRows[0].id;
// Then add to .send({ ..., organization_id: orgId, department_id: deptId })
```

Option A is lower risk — the test's intent (prove `master` can call `POST /api/users`) is orthogonal to which role is assigned.

---

## CRITICAL-2 — Missing TDD Cycle Evidence table in apply-progress

**File**: `openspec/changes/back/2026-10-10-user-onboarding-telegram-tour/apply-progress.md`

**Fix**: Add a `TDD Cycle Evidence` section after the CI gate results:

```markdown
## TDD Cycle Evidence

| Task | RED | GREEN | TRIANGULATE | SAFETY NET | REFACTOR |
|------|-----|-------|-------------|------------|---------|
| 1.1–1.5 users role policy | ✅ Written (users.service.spec.ts) | ✅ Passed | ✅ 7 cases (master/operador_sistema/admin_org/operador_org/cross-row/soft-deleted/reporter) | ✅ 33/33 existing tests pass | ✅ Done |
| 2.1–2.5 TelegramLinkService | ✅ Written (telegram-link.service.spec.ts) | ✅ Passed | ✅ 5 cases (issueFor, consume×3, composeDeepLink×2) | N/A (new file) | ✅ Done |
| 2.1–2.5 TelegramBotController | ✅ Written (telegram-bot.controller.spec.ts) | ✅ Passed | ✅ 6 cases (security×4, flow×2) | N/A (new file) | ✅ Done |
| 3.1–3.3 InvitationsService | ✅ Written (invitations.service.spec.ts extended) | ✅ Passed | ➖ 1 case extended (happy path asserts telegramLink + roleGuide) | ✅ 12/12 existing tests pass | ✅ Done |
```

---

## WARNING-1 — getFormData departments field not tested

**File**: `backend/src/modules/users/users.service.form-data.spec.ts`

Add one test:
```typescript
it('F7: returns departments list from dataSource query', async () => {
  roleRepo.find.mockResolvedValueOnce([{ id: 'r1', name: 'master' }] as never);
  orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);
  dataSource.query.mockResolvedValueOnce([
    { id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' },
  ]);

  const res = await service.getFormData(SYSTEM_ADMIN_ACTOR);

  expect(res.departments).toHaveLength(1);
  expect(res.departments[0]).toEqual({ id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' });
});
```

---

## WARNING-2 — Mail template fields not unit-tested

Add a test to `mail-templates.spec.ts` (or a new file) that calls the `invitation` template renderer with a `telegramLink` and `roleGuide` in the data and asserts the output HTML contains the Telegram button URL and the role guide text.

---

## Priority Order

1. CRITICAL-1 — fixes test:e2e CI gate (blocking)
2. CRITICAL-2 — satisfies Strict TDD protocol requirement (blocking)
3. WARNING-1 — low risk, quick to add
4. WARNING-2 — low risk, quick to add
