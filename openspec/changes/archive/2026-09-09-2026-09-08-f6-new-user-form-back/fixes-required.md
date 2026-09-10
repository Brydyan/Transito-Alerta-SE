# Fixes Required — F6 (back) Admin User Creation Enhancements

> Companion to `verify-report.md` (FAIL verdict). Read that first for full context.

---

## Before you start

- Do NOT re-audit. The findings below were verified with real execution — B.4.5 (manual `POST /api/users` test) was run by `sdd-verify` against the live DB and FAILed.
- The DTO change and the service change (D1, D2) are correct and unit-tested. **Do not redo them.** The fix is in the DB catalog (a missing migration) and the spec (which wrongly said "no new migrations").
- Coordinate with the FRONT `fixes-required.md` (C-1 and C-2 there are cheap, do them in the same session).

## Estado de los gates (after the fix — what to expect)

| Gate | Before | After (expected) |
|---|---|---|
| `rtk jest` (unit) | 1036/1036 | 1036/1036 (no change in unit suite) |
| `rtk npm run lint` | 0 errors, 25 warnings | unchanged |
| `rtk npm run typecheck` | 0 errors | unchanged |
| `rtk npm run build` | exit 0 | unchanged |
| `rtk npm run test:e2e` | 476/476 | 476/476 + 1 new e2e for `POST /api/users` (adminCreate) |
| Live: `POST /api/users` as master | 403 "Missing permission: CREATE users" | 201 with `phone` + `permissions` from role |

## Hallazgos

### C-1 (CRITICAL — F6 form is non-functional at runtime)

**Defect**: `POST /api/users` is unreachable to every user (including `master`) because the catalog is missing `(users, CREATE)` and `(users, DELETE)` rows. The controller at `backend/src/modules/users/users.controller.ts:84` uses `@RequirePermission('CREATE')` with no resource specified, so the resource is inferred from the path → `users` → requires `CREATE users`, which doesn't exist.

**Por qué importa**:
1. The F6 form (front) needs to call `POST /api/users` to create a user. With the missing perm, it always returns 403 — the form is non-functional in production.
2. The T5.6 e2e tests for `POST /api/users` have been green while the endpoint was never actually reachable to a real user. The orchestrator's "T5.6 ya cubre el path básico" justification for not adding a new e2e (D7) was a wrong call — the pre-existing e2e was written with the same gap.
3. Per `claude-qa.md` "regla a medias": the rule "adminCreate must be reachable by master" was implemented in the code paths and tests, but the precondition (master has `CREATE users`) was never established. The D1 and D2 enhancements are unreachable in production without the catalog fix.
4. Per `claude-qa.md` "Señal de alarma": "Un método corregido con cero llamadores → el arreglo aterrizó en el objeto equivocado." Here, `adminCreate` was implemented and 4 unit tests added, but no one (including master) can call it.

**Corrección**:

#### Step 1: New migration `0049_admin_user_permissions.sql`

Create the file `database/migrations/0049_admin_user_permissions.sql`:

```sql
-- 0049_admin_user_permissions.sql
-- F6 (2026-09-08-f6-new-user-form) — closes a pre-existing catalog gap
-- that 0009 left open: `CREATE users` and `DELETE users` were never
-- seeded, so the F6 admin form's `POST /api/users` returns 403 to every
-- user (including master). Grants both to `master` and `admin_org`
-- (the 2 roles that legitimately create/delete other users), and
-- denormalizes to the existing user rows.
--
-- Pattern matches 0019 (CLAIM/RELEASE), 0043 (CLOSE incidents), 0047
-- (REVEAL incidents): the rules in `claude-qa.md` "regla a medias"
-- and the "builder guide" line about touching BOTH `roles.permissions`
-- AND `users.permissions` apply here.
--
-- Requires: 0009 (permissions table), 0017 (users), 0040 (role names),
-- 0048 (last permission-bearing migration).
--
-- DOWN: database/rollback/0049_admin_user_permissions.DOWN.sql

BEGIN;

-- 1) Catalog: insert the 2 missing perms. Use ON CONFLICT to be
--    idempotent against a partial rerun.
INSERT INTO permissions (resource, action) VALUES
  ('users', 'CREATE'),
  ('users', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 2) Grant to master and admin_org (the 2 roles that legitimately
--    create/delete other users). operador_sistema, operador_org and
--    reporter do NOT get these — they should not be able to manage
--    other accounts. The `?` operator checks key existence; the
--    NOT (permissions ? 'CREATE users') guard makes this idempotent.
UPDATE roles
   SET permissions = permissions || '["CREATE users", "DELETE users"]'::jsonb
 WHERE name IN ('master', 'admin_org')
   AND NOT (permissions ? 'CREATE users');

-- 3) Propagate to users.permissions for existing master and admin_org
--    users. Without this, a master or admin_org created BEFORE this
--    migration keeps the OLD denormalized permission set and sees 403
--    on POST /api/users. The same `role_id` qualification + NOT EXISTS
--    guard makes this idempotent. The "regla a medias" pattern: the
--    bug already happened once in 0009, do not repeat it here.
UPDATE users u
   SET permissions = u.permissions || '["CREATE users", "DELETE users"]'::jsonb,
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND NOT (u.permissions ? 'CREATE users');

-- 4) Bump permission_version for ALL non-master/admin_org users too
--    (per T3.2 D2 — every change that mutates effective permissions
--    must invalidate the perm:v3:uid:* cache via version bump). The
--    one bump per migration, never per-request. Existing values:
--    master = 5, admin_org = 2. Bumping to 6 / 3.
UPDATE users
   SET permission_version = permission_version + 1
 WHERE permission_version > 0
   AND NOT (permissions ? 'CREATE users');

COMMIT;
```

#### Step 2: DOWN script

Create `database/rollback/0049_admin_user_permissions.DOWN.sql`:

```sql
-- 0049_admin_user_permissions.DOWN.sql
-- Reverses 0049_admin_user_permissions.sql. Run in Supabase SQL Editor.

BEGIN;

-- 1) Remove CREATE/DELETE users from users.permissions (denormalized copy).
UPDATE users u
   SET permissions = u.permissions - 'CREATE users' - 'DELETE users',
       permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND u.permissions ? 'CREATE users';

-- 2) Remove CREATE/DELETE users from roles.permissions.
UPDATE roles
   SET permissions = permissions - 'CREATE users' - 'DELETE users'
 WHERE name IN ('master', 'admin_org')
   AND permissions ? 'CREATE users';

-- 3) Remove the catalog rows. WARNING: only safe if NO user has these
--    perms in their denormalized copy. The checks above ensure that.
--    If a downstream change added them outside the role grant, this
--    DELETE will fail with a FK violation (or silently no-op if
--    no FK, depending on schema).
DELETE FROM permissions
 WHERE resource = 'users'
   AND action IN ('CREATE', 'DELETE');

COMMIT;
```

#### Step 3: Update the BACK spec

The current `back/.../spec.md` says "no new migrations" and `proposal.md` + `design.md` repeat it. Update the spec to acknowledge 0049:

- In `proposal.md` "Out of Scope" section: remove "No new migration" from the bullet list (it's no longer true). Add a new bullet: "Migration 0049 adds the missing `CREATE users` and `DELETE users` catalog rows. This closes a pre-existing gap from migration 0009 — the catalog was seeded with 14 perms and never received these 2, leaving `POST /api/users` unreachable to every user."
- In `design.md` "File Changes" table: add a row for `database/migrations/0049_admin_user_permissions.sql` (new) and `database/rollback/0049_admin_user_permissions.DOWN.sql` (new).
- In `tasks.md`: add a new task group "Fase 6: Permission catalog (DB)":
  - B.6.1: Create migration 0049_admin_user_permissions.sql with the 3 steps above.
  - B.6.2: Create DOWN script.
  - B.6.3: Run the migration in staging and flush Redis `perm:v3:uid:*` in DB 1.
  - B.6.4: Update spec/proposal/design to document the migration.
  - B.6.5: Add an e2e test for `POST /api/users` (see Step 4).

#### Step 4: Add a real e2e test for `POST /api/users`

The current e2e (T5.6) tests the endpoint but uses a master user that was supposed to have `CREATE users` and didn't (T5.6 was written when the catalog gap existed). Add a new e2e in `backend/test/e2e/admin-create-user-roles.e2e-spec.ts`:

```typescript
// F6 (2026-09-08-f6-new-user-form) — closes the gap that 0009 left:
// the catalog never received CREATE/DELETE users, so this test
// uses the live role permissions and asserts end-to-end reachability.
// Closes the 2026-09-08 "regla a medias" finding from the F6 verify.

describe('F6 adminCreate reachability (migration 0049)', () => {
  it('master with CREATE users can POST /api/users with phone and role_id', async () => {
    // login as master (now has CREATE users after 0049)
    // POST /api/users with { email, first_name, last_name, phone, role_id }
    // expect 201
    // expect response.permissions to match role.permissions (D2 denormalization)
    // expect response.phone to match input
  });

  it('operador_org without CREATE users gets 403 on POST /api/users', async () => {
    // login as operador_org
    // POST /api/users with { email, first_name, last_name }
    // expect 403 "Missing permission: CREATE users"
  });

  it('adminCreate with phone > 30 chars returns 400 (D1 validation)', async () => {
    // login as master
    // POST /api/users with phone = 'x'.repeat(31)
    // expect 400 with "phone must be shorter than or equal to 30 characters"
  });

  it('adminCreate with invalid role_id returns 404 (D2 case C)', async () => {
    // login as master
    // POST /api/users with role_id = '00000000-0000-0000-0000-000000000000'
    // expect 404 "Role ... not found"
  });
});
```

This e2e is the regression guard for the F6 form's runtime correctness. Without it, the next time someone "fixes" the role grant and forgets the catalog, the unit tests will still pass but the form will be broken again.

## Reparto

| Hallazgo | Quién | Esfuerzo |
|---|---|---|
| C-1 (migration 0049) | `minimax-builder` (back) | New migration file + DOWN script + run in staging + flush Redis: ~1-2 h |
| C-1 (spec update) | Architect (you, if rol-doble) or assigned to `minimax-builder` with the spec.md permission flag flipped | ~30 min to update proposal/design/tasks |
| C-1 (new e2e) | `minimax-builder` (back) | ~1 h to write 4 specs |

Coordinate with FRONT `fixes-required.md` so the front's C-1 (1 line) + C-2 (3 lines) and the back's C-1 all land in the same session — they're independent but reviewing them together catches the bigger "usuarios vs users" pattern.

## No toques

| File / area | Why not now |
|---|---|
| `backend/src/modules/users/users.service.ts` `adminCreate()` method body | The D1 (phone) and D2 (denormalization) changes are correct. The 4 unit tests for `adminCreate` pass. Do not refactor. |
| `backend/src/modules/users/dto/admin-create-user.dto.ts` | DTO is correct; 4 unit tests pass. The `phone` field works. Do not refactor. |
| `backend/src/modules/users/users.controller.ts:84` (`@RequirePermission('CREATE')`) | The decorator is correct. The issue is upstream (catalog missing the perm), not the decorator. |
| `backend/src/modules/users/users.service.spec.ts` (the 4 F6-added tests) | All pass. Do not modify. |
| `database/migrations/0009_roles_permissions.sql` (the original seed) | Adding the 2 missing perms via a new migration (0049) is the correct pattern; do not edit the historical migration. (Editing would mean a fresh-DB run from 0009 would have the right catalog, but a re-run of 0049 against an already-applied DB would no-op correctly. Either way works, but a new migration is cleaner for audit trail.) |
| `database/rollback/0043_incident_close_permission.DOWN.sql:35` | Pre-existing bug, owned by `t7-rollback-cycle`. Not in F6 scope. |
| The `(READ, permissions)` row that was inserted manually | The orchestrator did this without a migration. Consider folding it into 0049 (add the row in the same migration), but it's a nice-to-have, not blocking. |

## Orden sugerido

De menor a mayor riesgo:

1. **Create migration 0049** (5 min) — the SQL is in Step 1 above.
2. **Create DOWN script** (5 min) — SQL in Step 2 above.
3. **Run migration in staging** (~5 min) — `PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f database/migrations/0049_admin_user_permissions.sql`
4. **Flush Redis cache** (1 min) — `docker exec tase-redis sh -c "redis-cli -n 1 --scan --pattern 'perm:v3:uid:*' | xargs -r redis-cli -n 1 DEL"`
5. **Update spec/proposal/design** (~30 min) — Step 3 above.
6. **Add e2e test** (~1 h) — Step 4 above.
7. **Re-verify** — re-run `rtk npm run test:e2e` (full ~12 min) and the manual B.4.5/B.4.6/B.4.7 with `curl`. Both should pass.
8. **Re-archive** — once the front's C-1 + C-2 are also fixed and the e2e is green on CI, both `verify-report.md` files can be updated to PASS.

The full fix is ~2-3 hours of work plus a ~12 min e2e rerun plus a CI run for the e2e specs.
