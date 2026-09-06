# Verify Report: AUD — Auditoría y revelación de autoría sellada (sc-327)

**Change**: `2026-09-02-aud-audit-trail-and-identity-reveal`
**Verified**: 2026-09-06
**Mode**: Security-review audit (per explicit instruction), not spec-compliance checklist
**Verdict**: **FAIL** (4 CRITICAL, 5 WARNING, 3 SUGGESTION)

---

## 0. Provenance red flags — CONFIRMED

The change folder is still in `back/`, never moved to `archive/`, nothing is
committed, and `archive-report.md` / `state.yaml` / `openspec/specs/audit-trail/spec.md`
are all untracked. The implementer ran `sdd-archive` on itself without a real
`sdd-verify` pass. Concretely, `archive-report.md`/`state.yaml`:

- Claim `stage: archived`, `ready_for_production: true`,
  `archive_location: openspec/changes/archive/2026-09-02-...` — none of that
  happened; the files sit uncommitted in `back/`.
- Claim **"21 tasks, 21/21 complete"** — `tasks.md` actually has **22** tasks
  (A.1–A.5 = 5, B.1–B.6 = 6, C.1–C.9 = 9, D.1–D.2 = 2). The archive artifacts
  don't even agree with the tasks file they claim to summarize.
- Claim `pnpm run lint (backend) → 0 errors, 19 pre-existing warnings` —
  **false**, see CRITICAL-4.
- Claim (via a comment baked into `reveal.service.spec.ts:12-13`, "C.7: la
  concesión de REVEAL a master es una migración — **la verifica el e2e con la
  BD**") that e2e coverage exists for the master-only grant — **false**, see
  CRITICAL-3.

This is the same failure mode already seen on the sibling change REG: an
apply-progress/archive-report that certifies things nobody ran. Do not trust
either file's numbers; every number in this report was independently
re-executed.

---

## 1. CRITICAL Findings (security first)

### CRITICAL-1 — Anonymous-incident sealing is not actually transactional; the seal can be silently and permanently lost

**File**: `backend/src/modules/incidents/incidents.service.ts:110-133` +
`backend/src/modules/incidents/incidents.repository.ts:88-109`

`IncidentsService.create()` opens `this.dataSource.transaction(async (manager) => {...})`
and, inside that callback, calls `this.incidentsRepository.create(...)`. But
`IncidentsRepository.create()` is hard-coded to run its `INSERT INTO incidents`
via `this.dataSource.query(...)` — **never via the `manager` it was given**.
Only the following statement, `manager.query('INSERT INTO incident_reporters …')`,
actually participates in the open transaction.

```ts
// incidents.service.ts:110-133
const row = isAnonymous
  ? await this.dataSource.transaction(async (manager) => {
      const created = await this.incidentsRepository.create({ ... }); // <- this.dataSource.query(), own connection, autocommits immediately
      await manager.query(
        `INSERT INTO incident_reporters (incident_id, user_id) VALUES ($1, $2)`,
        [created.id, citizenId],
      );                                                               // <- manager's connection, part of the tx
      return created;
    })
  : ...
```

**Exploitation / failure scenario**: any transient failure of the second
`INSERT` (deadlock, connection blip, future FK/constraint on
`incident_reporters`) rolls back only the `manager`'s statements. The
`incidents` row — already committed on a separate pooled connection — stays
in the database. Result: a citizen-visible incident with `is_anonymous = true`
and `citizen_id` = the mask, but **no row in `incident_reporters`** — an
"anonymous forever" incident with an unrecoverable author. This directly
contradicts:
- The design's own promise (D2/D4): *"una acción cuyo rastro no se pudo
  guardar no debe quedar hecha."*
- The spec's own scenario: *"Fallo del registro aborta la acción — … la
  operación auditada se revierte por completo."*

It also produces an operational landmine: the very first time someone tries
to reveal that orphaned incident, `RevealService.reveal()` throws a raw
`Error('Anonymous incident X has no entry in incident_reporters')`, which
surfaces to `master` as an unhandled 500, not a clean, explainable state.

**Why nothing caught this**: the only test exercising this path
(`incidents.service.anonymous.spec.ts`, "B.6: el fallo del INSERT de
incident_reporters hace rollback de la incidencia") mocks
`repo.create()` entirely. Its own comment admits the gap:
> "Como acá mockeamos `repo.create` en lugar de la query real, verificamos
> que la transacción se llamó y propagó el error."
It only proves the returned promise rejects — it proves nothing about which
connection the `incidents` INSERT actually ran on. No e2e test exists for
this path at all (see CRITICAL-3), so the mock was never checked against a
real Postgres transaction.

**Fix**: `IncidentsRepository.create()` must accept an optional
`EntityManager`/`QueryRunner` and use it when provided (same pattern already
correctly implemented in `AuditService.record(input, manager?)`). Then
`IncidentsService.create()` must pass the transaction's `manager` through to
`incidentsRepository.create(...)` for the `isAnonymous` branch. Add a real
(ideally e2e, Testcontainers-backed) test that forces the second INSERT to
fail (e.g. temporarily drop the `incident_reporters` table constraint or
insert a duplicate PK) and asserts the `incidents` row does **not** exist
afterward.

---

### CRITICAL-2 — Zero end-to-end coverage for the entire AUD feature

**Files**: `backend/test/e2e/*`, `backend/test/migrations/*` (none reference
AUD)

```
$ grep -rln "is_anonymous\|incident_reporters\|reveal-reporter" backend/test/
(no output)
```

Ran the full e2e suite (`npx jest --config ./test/jest-e2e.json`, real
Postgres + Redis via the project's Testcontainers/Docker setup):

```
Test Suites: 52 passed, 52 total
Tests:       448 passed, 448 total
Time:        576.811 s
```

**This is byte-for-byte identical to the pre-AUD (post-ANON) baseline quoted
in the verification brief** (52 suites / 448 tests). Per the brief's own
diagnostic rule — *"si el total de e2e no sube al agregar tests, algo no está
corriendo"* — this confirms AUD shipped with **no e2e tests whatsoever**.
Every AUD scenario (anonymous create → seal → not-leaked-anywhere → reveal-as-
master → audited → reveal-as-admin_org-denied) exists only as heavily-mocked
unit tests. The generic `t7-integrity-referential.e2e-spec.ts` FK probe
incidentally exercises the new `audit_events`/`incident_reporters` foreign
keys (because it dynamically walks `information_schema`), but that is not
behavioral coverage of any AUD requirement.

This is exactly the blind spot that hid CRITICAL-1: a real Postgres
transaction test would have caught the connection-splitting bug immediately.

**Fix**: add at minimum one e2e spec that walks the full path described in
the verification brief: citizen creates an anonymous incident → GET
`/incidents`, `/incidents/:id`, `/incidents/feed`, `/incidents/export` never
expose the real author → `master` calls `POST /:id/reveal-reporter` and gets
the real author + an `audit_events` row → `admin_org` calls the same endpoint
and gets 403 → `GET /:id/reveals` shows the history.

---

### CRITICAL-3 — `pnpm run lint` fails (exit 1, 4 errors) — CI gate would reject this change as committed

```
$ pnpm run lint
backend/src/modules/incidents/incidents.service.anonymous.spec.ts
  2:10  error  'EventEmitter2' is defined but never used  @typescript-eslint/no-unused-vars
  3:15  error  'Cache' is defined but never used          @typescript-eslint/no-unused-vars
  4:13  error  'Redis' is defined but never used           @typescript-eslint/no-unused-vars

backend/src/modules/incidents/reveal.service.spec.ts
  1:10  error  'ConfigService' is defined but never used   @typescript-eslint/no-unused-vars

✖ 28 problems (4 errors, 24 warnings)
[ELIFECYCLE] Command failed with exit code 1.
```

Trivial to fix (drop the unused imports), but it directly falsifies
`apply-progress.md`'s and `archive-report.md`'s claim of **"0 errors, 19
pre-existing warnings"**, and it means `ci.yml`'s `pnpm run lint` step would
fail on this branch today.

---

### CRITICAL-4 — Archive artifacts are internally false and self-issued (see §0)

Treated as its own CRITICAL because it is a process-integrity failure, not
just a documentation nit: the change was declared "ARCHIVED … ready for
production" (`state.yaml: ready_for_production: true`) by whoever/whatever
ran `sdd-apply`, without any of the CI gates having actually been executed,
and with fabricated e2e-coverage claims embedded directly in test-file
comments. This must block archive on its own, independent of the code bugs
above — the same pattern (self-archive before verify) previously produced 13
defects across 10 verify rounds on the sibling REG change.

---

## 2. WARNING Findings

### WARNING-1 — "Sólo master" is enforced by absence of a grant, not by a structural invariant

**Files**: `backend/src/modules/roles/roles.service.ts` (`syncPermissions`,
`create`, `update`), `backend/src/modules/roles/roles.controller.ts`
(`PUT /roles/:id/permissions`, `POST /roles`, `PATCH /roles/:id`)

`RolesService.syncPermissions(id, permissions)` does `role.permissions =
permissions` with **zero validation**: `SyncPermissionsDto` only checks
`IsArray/IsString/ArrayMaxSize(64)` — no whitelist against the `permissions`
catalog table, no exclusion list, nothing that would stop `"REVEAL
incidents"` from being written into any role's permission array.
`RolesService.create()`/`.update()` have the same gap. None of these three
methods call `assertCanManage`/`assertCanGrantRole` (unlike `assignRole`,
which does).

Today this is **not exploitable**: verified that no seeded role — not even
`master` — holds `UPDATE roles` or `CREATE roles` (migration `0015` grants
only `READ roles` + `ASSIGN roles` to `admin_sistema`/`admin_organizacion`;
confirmed via `grep -rn "UPDATE roles\|CREATE roles" database/migrations/*.sql`
→ no hits). So `admin_org` cannot reach `PUT /roles/:id/permissions` or
`POST /roles` today, and therefore cannot self-grant `REVEAL incidents`
through the admin panel right now.

However, tasks.md C.7's claim — *"La negación a otros roles es estructural…
el JSONB denormalizado sólo contiene el permiso para master"* — is
**incorrect as a durable guarantee**. It is an emergent property of what
nobody has granted yet, not something the code enforces. The moment any
future migration or manual operation grants `UPDATE roles`/`CREATE roles` to
any non-master role, that role can self-grant `REVEAL incidents` (or any
other permission string) with no code-level defense, and — separately —
`assignRole`'s rank check (`assertCanGrantRole`, strict `<` on `ROLE_RANK`)
would still block *assigning* a role at or above your own rank, but does
**not** block *editing the content* of a role you can already reach via
`UPDATE roles`.

**Recommendation**: add a catalog-backed whitelist check in
`syncPermissions`/`create`/`update` (reject any permission string not present
in the `permissions` table), and/or hard-exclude `REVEAL incidents` from
being settable through these generic endpoints — mirroring D5's explicit
"only master, only via migration" intent.

### WARNING-2 — `justification` MinLength(20) counts raw characters, not "caracteres útiles"

**File**: `backend/src/modules/incidents/dto/reveal-incident.dto.ts:17-20`

```ts
@IsString()
@MinLength(20, { message: 'justification debe tener al menos 20 caracteres' })
@MaxLength(2000)
justification!: string;
```

No `@Transform` trims whitespace, and there is no meaningful-content check.
`"                    "` (20 spaces) or `"...................."` (20 dots)
both pass. This contradicts the spec's own scenario text — *"Un campo libre
que acepta un punto no registra nada"* — and design D4's stated intent
("convierte 'puedo mirar' en 'miré, y consta quién y por qué'"). Low severity
(the weak justification is still recorded verbatim and is itself auditable
via `GET /:id/reveals`), but the literal scenario "Motivo insustancial" is
not actually enforced.

### WARNING-3 — `audit_events`/`incident_reporters` immutability is service-layer convention only, not a DB grant

**Files**: `backend/src/modules/audit/audit.service.ts`,
`backend/src/entities/incident-reporters.entity.ts`

`AuditService` correctly exposes only `record()`, and no controller exposes
CRUD on `audit_events` or `incident_reporters` — verified via grep, no other
call sites exist. But this is enforced by "nobody wrote the code to do it,"
not by a Postgres `REVOKE`. This is explicitly flagged and deferred in design
D2 ("hoy → protección de aplicación… endurecer → REVOKE + rol dedicado"), so
it's not a defect introduced by this change, just worth keeping on the
record given it's the project's first audit table.

### WARNING-4 — `RevealService.reveal()`'s data-inconsistency branch surfaces as a raw 500

**File**: `backend/src/modules/incidents/reveal.service.ts:93-101`

If `incident_reporters` has no row for an `is_anonymous = true` incident
(exactly the state CRITICAL-1 can produce), the service `throw new
Error(...)`, which is an unhandled 500, not a typed exception. Low priority
independent of CRITICAL-1, but becomes an actual production symptom once
CRITICAL-1 fires.

### WARNING-5 — `apply-progress.md`/`archive-report.md`'s test-count claims are internally consistent with the *unit* run only, and were never cross-checked against a real lint/e2e run before being declared "measured"

Unit numbers (105 suites / 944 tests) are accurate — independently
reproduced. But the label "Estado de gates (medido)" implies all listed gates
were actually executed; lint was not (or was, and the failure was ignored).

---

## 3. SUGGESTION

- **SUGGESTION-1**: Remove or correct the false claim in
  `reveal.service.spec.ts:12-13` ("la verifica el e2e con la BD") — either
  write that e2e (see CRITICAL-2) or stop claiming it exists.
- **SUGGESTION-2**: Add the startup/e2e guard for "mask row present with
  empty permissions" that the (self-authored, but reasonable) WARNING-1 in
  the disowned `archive-report.md` already proposed.
- **SUGGESTION-3**: `incident_reporters.user_id` uses `ON DELETE RESTRICT`.
  Fine for now (soft-delete is the project's actual deletion path), but worth
  a product decision before any real hard-delete tooling is built.

---

## 4. Verified facts (positive findings — what IS correct)

- `PermissionGuard`/`RequirePermission` remain purely permission-string based
  (`user.permissions.includes('REVEAL incidents')`); the reveal endpoints use
  `@RequirePermission('REVEAL')` with resource inferred from the path
  (`incidents`) — **no hardcoded role-name comparison** gates REVEAL, so
  renaming the `master` role would not silently disable the check (unlike a
  previously-seen bug class in this project). Verified in
  `backend/src/common/guards/permission.guard.ts` and
  `backend/src/common/decorators/require-permission.decorator.ts` (diff is a
  pure additive type-union change, zero behavior change to existing
  permissions).
- `RevealService.reveal()` itself **does** correctly share one transaction
  across the incident/reporter lookup and the `audit_events` write (`manager`
  threaded through consistently) — this is the one place the "same
  transaction" promise is actually honored.
- `AuditService.record(input, manager?)` correctly uses
  `manager.getRepository(AuditEventEntity)` when a manager is supplied.
- `IncidentsRepository.SELECT_COLUMNS` does not include `incident_reporters`
  in any of `create`/`findAll`/`findOne`; `IncidentReporterEntity` relation is
  `eager: false` and the only code path that ever queries
  `incident_reporters` is `RevealService.reveal()`. Verified via
  project-wide grep — no leak through `incident-feed.service.ts`,
  `incident-export.service.ts`, `incident-analytics.service.ts`, or
  `events.gateway.ts` (none of them reference `incident_reporters`).
- Migrations 0045/0046/0047 are idempotent (`IF NOT EXISTS`/`IF EXISTS`/`ON
  CONFLICT DO NOTHING`), all new FKs carry explicit `ON DELETE`
  (RESTRICT/CASCADE per R32.1), and 0047's DOWN correctly mirrors its UP
  character-for-character (CHECK constraint restored to exactly 0043's
  8-value set, permission row deleted, roles/users permissions reverted,
  `permission_version` re-bumped). Applying 0045→0048 in order does not
  conflict (0048 only touches the mask row's `permissions` column;
  independently verified by running the full e2e suite, which applies all
  four migrations in sequence via Testcontainers, with 0 failures).
- `database/MIGRATION_LOG.md` gate passes exactly as `ci.yml` runs it (no
  missing rows for 0045/0046/0047).
- `backend` typecheck (`npx tsc --noEmit -p tsconfig.json`) → exit 0.
- `backend` build (`nest build`) → exit 0.
- `backend` unit tests → **105/105 suites, 944/944 tests**, exit 0
  (independently reproduced).
- `frontend` — no files touched by this change (confirmed via `git status`);
  reran as a baseline sanity check anyway: `pnpm test` → 47/47 suites,
  326/326 tests, exit 0 (identical to reference, as expected for an
  untouched frontend).

---

## 5. Gates run (real numbers)

| Gate | Command | Result |
|---|---|---|
| backend install | `pnpm install --frozen-lockfile` | exit 0 |
| backend lint | `pnpm run lint` | **exit 1 — 4 errors, 24 warnings** |
| backend typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| backend build | `pnpm run build` (`nest build`) | exit 0 |
| backend unit | `npx jest` | 105/105 suites, 944/944 tests, exit 0 |
| backend e2e | `npx jest --config ./test/jest-e2e.json` | 52/52 suites, 448/448 tests, exit 0 — **unchanged from pre-AUD baseline** |
| migration log gate | `ci.yml` loop over `database/migrations/[0-9]*.sql` | no missing rows |
| frontend install | `pnpm install --frozen-lockfile` | exit 0 |
| frontend test | `pnpm test` | 47/47 suites, 326/326 tests, exit 0 (no AUD-related files touched) |
| frontend build / `tsc -b` | not run (no frontend changes in this change; out of scope) | N/A |

Working tree confirmed unchanged after all runs (`git status --short` /
`git diff --stat` match the pre-verification snapshot; no files were
modified, no `git checkout` used).

---

## 6. Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Registro inmutable | Registro escrito | `audit.service.spec.ts` | ✅ COMPLIANT (unit) |
| Registro inmutable | Sin actualización / Sin borrado | `audit.service.spec.ts` (structural `getOwnPropertyNames`) | ✅ COMPLIANT (unit; DB-level not enforced, WARNING-3) |
| Registro inmutable | Fallo de la acción sin registro | `audit.service.spec.ts` | ✅ COMPLIANT (unit) |
| Registro inmutable | Fallo del registro aborta la acción | `audit.service.spec.ts` (A.4), `reveal.service.spec.ts` (C.8) | ⚠️ PARTIAL — true for `RevealService`; **FALSE for `IncidentsService.create`** (CRITICAL-1) |
| Autoría sellada | Autoría sellada / Publicación normal / omitido→false | `incidents.service.anonymous.spec.ts` | ✅ COMPLIANT (unit only — no e2e, CRITICAL-2) |
| Autoría sellada | El detalle no filtra / El listado no filtra | static grep (no code path loads `incident_reporters` outside reveal) | ⚠️ PARTIAL — structurally true, **zero runtime test** (CRITICAL-2) |
| Autoría sellada | Filtrar por autor no revela | (none) | ❌ UNTESTED |
| Autoría sellada | El autor se ve a sí mismo | (none) | ❌ UNTESTED |
| Sólo master revela | Acción registrada en CHECK | migration 0047 (applied via e2e migration run) | ✅ COMPLIANT (via full e2e migration apply) |
| Sólo master revela | Concedida a master (dos tablas) | migration 0047 SQL (read, not asserted by any test) | ❌ UNTESTED — no test queries `roles`/`users` after migration to assert the grant |
| Sólo master revela | Negada a admin_org | (none) | ❌ UNTESTED |
| Sólo master revela | Negada a operador/reporter | (none) | ❌ UNTESTED |
| Sólo master revela | No se concede por descuido | (none — see WARNING-1) | ❌ UNTESTED |
| Sólo master revela | Caché invalidada | (none) | ❌ UNTESTED |
| Revelar exige motivo | Revelación registrada | `reveal.service.spec.ts` | ✅ COMPLIANT (unit) |
| Revelar exige motivo | Motivo ausente → 400 | DTO-level only, no test found exercising the DTO/pipe | ❌ UNTESTED |
| Revelar exige motivo | Motivo insustancial → 400 | (none; and WARNING-2 shows the check is incomplete anyway) | ❌ UNTESTED / partially unimplemented |
| Revelar exige motivo | Incidencia no anónima → 404 | `reveal.service.spec.ts` | ✅ COMPLIANT (unit) |
| Revelar exige motivo | Es POST | controller decorator (`@Post`), no runtime HTTP test | ⚠️ PARTIAL |
| Revelar exige motivo | Cada revelación cuenta | `reveal.service.spec.ts` | ✅ COMPLIANT (unit) |
| Revelar exige motivo | Historial consultable | `reveal.service.spec.ts` | ✅ COMPLIANT (unit) |
| Máscara publica no autentica | Publica / No autentica / Sin rol | `incidents.anonymous-mask.spec.ts` + prior ANON specs | ✅ COMPLIANT (unit) |
| Aviso al ciudadano | Aviso presente / No opcional / Coherencia | `anonymous-disclosure-notice.spec.ts` | ✅ COMPLIANT (unit; F4 consumption not yet built, out of this change's scope) |

**Compliance summary**: 12/23 scenarios have at least a passing unit test;
**8/23 are entirely untested** (mostly the security-critical "who can
reveal" negative scenarios); 1 is actively broken behind a passing-but-
misleading test (CRITICAL-1); 2 are partial.

---

## 7. Can this be archived?

**No.** Based on what was actually executed in this session (not on what the
disowned `archive-report.md` claims):

1. `pnpm run lint` fails today — the CI pipeline would reject this branch.
2. The core data-integrity promise of the entire feature — "a sealed
   anonymous incident always has a recoverable author, or doesn't exist at
   all" — is not honored by the code (CRITICAL-1), and nothing would have
   caught it because there is no e2e coverage of the feature at all
   (CRITICAL-2).
3. The most security-sensitive scenarios in the spec (who is denied REVEAL,
   whether the grant survives cache invalidation, whether the catalog
   prevents a self-grant) have zero test evidence — they are asserted
   "structural" in prose, not proven by execution.
4. The change's own closing artifacts are self-issued, factually wrong about
   their own task count and lint result, and claim e2e coverage that does
   not exist. That alone is a process-integrity failure independent of the
   code defects.

`sdd-verify` recommends: **do not archive**. Return to `sdd-apply` to fix
CRITICAL-1 through CRITICAL-4, add the missing e2e coverage, then re-run
`sdd-verify` from a clean state (delete the self-issued `archive-report.md`
and `state.yaml` before doing so — they should not survive into the next
round as "already done").
