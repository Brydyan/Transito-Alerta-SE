# Design: T7.9.Z — Closure & Operator Handoff

## Decisions

### Z1 — MIGRATION_LOG.md Entry

**Decision: Record 0041 as `⏳ Pending` until operator applies**

Rationale: Schema migrations are idempotent and declarative; they live in Git. The applied state is tracked in `schema_migrations` table (runtime state). Documentation in `MIGRATION_LOG.md` is the human-readable audit trail for operations team. Recording 0041 here before production application lets the ops team (and future auditors) trace: "when was this applied, by whom, what was the intent, what went wrong if it failed."

State: `⏳ Pending` (not yet applied to Supabase, but committed to Git and verified in CI)
Status field: Becomes `✅ Applied` + date/user after manual operator execution.

**Entry template**:
```markdown
| 0041 | geography_organizations_seed | Backfill geo_zones.code (EC-24, EC-24-01/02/03) → INSERT 11 Santa Elena parroquias (OSM) → INSERT CTE - Santa Elena org. Idempotent: ON CONFLICT + WHERE NOT EXISTS. Load-bearing order: code must backfill before parroquia INSERT. | ⏳ Pending | supabase | — | — |
```

### Z2 — R21 Re-anchor

**Decision: R21 scenarios reference 0041, not 0039**

Rationale: R21 requirement is "Datos geográficos y organizaciones semilla" (geographic data + seed organization). The migration that implements this is 0041, not 0039. 0039 is roles/permissions (T7.9.B). Spec scenarios must reference the correct migration, or acceptance criteria become ambiguous (does R21 pass if 0039 applied but 0041 not?).

Scope of re-anchor:
1. Delta spec for this change (`openspec/changes/infra/t7-geography-organizations-seed/specs/database-schema/spec.md`) — already correct, R21.0–R21.5 reference 0041
2. Main spec after archive merge (`openspec/changes/infra/t7-database-schema-parity/specs/database-schema/spec.md`) — currently says "0039 applied"; sdd-archive will merge and correct this
3. Related tasks in main T7 task document (`openspec/changes/infra/t7-database-schema-parity/tasks.md`) — if C1–C6 reference 0039, update to 0041

Search pattern: `0039.*R21` → replace with `0041_geography_organizations_seed.*R21` + update scenario text if it references "code is NULL" (now it's backfilled).

### Z3 — docs/tasks/3-DATABASE-SCHEMA.md Update

**Decision: Update range and add T7 closure summary**

Rationale: Documentation must reflect reality. T7 is not complete until all 41 migrations are listed. The document currently says 0001–0040 (T7.10 = rename roles); it must be updated to 0001–0041 (T7.9.C/D closure).

Additions:
1. Migration range: change "0001–0040" to "0001–0041" everywhere
2. Add T7.9.C/D summary under "State real de las migraciones (2026-08-24)" section:
   - What C2–C7 implemented (parroquias from OSM, org CTE, 0041 migration)
   - What D1–D11 implemented (users/demo/volume seeders, feed rebuild)
   - What remains for T8 (status_history audit gap, additional organizations beyond Santa Elena)
3. Update table "Rango | Fase | Contenido" to include:
   - `0041` | T7.9.C/D | Parroquias Santa Elena + org semilla (geography seeding)

### Z4 — CI Verification Protocol

**Decision: Four-gate verification before deployment approval**

Rationale: T7 is the largest schema migration to date. Each gate catches a different class of defect:
- ESLint: code style, unused variables, dependency issues
- TypeScript: type safety, entity-schema alignment
- Build: dead imports, circular dependencies, esbuild errors
- Tests: functional correctness, regression detection

All four MUST pass. If any fails, abort and fix before declaring "Z4 green."

Gates (in order):
1. `npm run lint` (backend/) — 0 errors
2. `tsc --noEmit -p tsconfig.json` (backend/) — 0 errors
3. `nest build` (backend/) — exit code 0, dist/ generated
4. `npm test && npm run test:e2e` (backend/) — jest exit code 0, all suites green

Implicit regression check: all pre-existing tests (not just C/D scope) must pass. Example: T5 incident tests, T6 assignment tests, etc.

### Z5 — Operator Handoff Manual

**Decision: Provide exact SQL + verification checklist, not deployment automation**

Rationale: T7 deployment is **operator-driven, not automated**. This is intentional (CC3 — no automatic schema changes). The operator manually applies each migration in Supabase SQL editor, then verifies the result. Our job is to make that **as safe and repeatable as possible**.

Manual structure (Z5 document):
1. **Prerequisites** (must verify before starting)
   - `SELECT * FROM schema_migrations WHERE name='0040_rename_roles'` must return 1 row
   - If 0, run `npm run db:migrate` locally against Supabase first (registers 0040 as idempotent no-op)

2. **SQL block to copy-paste** (exact contents of 0041_geography_organizations_seed.sql)

3. **Post-execution verification** (run these 3 queries in Supabase SQL editor)
   ```sql
   SELECT COUNT(*) FROM geo_zones WHERE level='parroquia' AND code LIKE 'EC-24-%';  -- should be 11
   SELECT COUNT(*) FROM organizations WHERE name='CTE - Santa Elena';                -- should be 1
   SELECT COUNT(*) FROM geo_zones;                                                   -- note value before, should be same on re-run
   ```

4. **Idempotence check** (re-run the SQL block, verify all counts unchanged)

5. **Rollback (if needed)**
   - Execute `0041_geography_organizations_seed.DOWN.sql` from `database/rollback/`
   - Re-verify: parroquias gone, org gone, code backfilled rows reverted

6. **Status update**
   - After successful application, update `database/MIGRATION_LOG.md` row 0041:
     - Status: `✅ Applied`
     - Applied Date: `YYYY-MM-DD HH:MM:SS`
     - Applied By: operador's email or username

**Who executes Z5**: Database operator (Andy or delegated team member with Supabase SQL access).

**When**: After Z4 passes (CI green) and operator is ready to deploy (decision outside SDD scope).

### Z Closure Meta-Decision

**No code changes in Z scope** — Z is pure documentation + verification. All code changes (migrations, seeders, tests) are in C/D scope. Z validates, documents, and prepares for deployment. This separation keeps Z lightweight and fast (4h vs 30h for C/D).

## Dependencies & Prerequisites

- T7.9.C2–C7 complete (migration 0041 finalized, tests green)
- T7.9.D1–D11 complete (seeders finalized, npm scripts in place)
- CI environment: `npm`, `npm run build`, `npm run lint`, jest, TypeScript 5.5+
- Operator environment: Supabase SQL editor access, `schema_migrations` read permission

## Related Decisions from C/D

- **D5 (R21.3)**: Interior point + overlap ratio validation (binary test + area ration >= 0.75) — no changes for Z
- **D0 (OSM source)**: ODbL 1.0 licensed, attribution in `database/data/NOTICE` — Z just documents in MIGRATION_LOG
- **D9 (Feed rebuild)**: In-process via NestFactory — Z verifies in Z4 test gate

## Edge Cases & Gotchas

1. **0040 not registered**: If operator skips 0040 in `schema_migrations`, 0041 may still apply (both are idempotent). But `db:migrate` status check will show 0040 as "pending" forever. Z5 manual must emphasize: always register 0040 first (or npm run db:migrate from local).

2. **Partial application failure**: If 0041 fails midway (e.g., org INSERT fails but parroquias succeeded), rollback is atomic per transaction. But if transaction was committed before error, operator must manually inspect `schema_migrations` to see if it was recorded. Z5 includes "inspect transaction log" step.

3. **Multiple operator runs**: Idempotence is tested in CI (Z4), but Z5 manual should still include "re-run is safe" language so operator is confident running it twice doesn't break anything.

## Rollback & Recovery

- **Z1–Z3 rollback**: File revert (no schema impact)
- **Z4 rollback**: N/A (no persistent changes, just verification)
- **Z5 rollback**: Execute `0041.DOWN.sql`, then update MIGRATION_LOG.md row 0041 back to `⏳ Pending` and clear Applied Date/By fields
- **Full T7 rollback (disaster)**: Supabase restore-point procedure (outside SDD scope, operator responsibility)

## Next Steps (Post-Z)

- **Deployment**: Operator executes Z5 (manual application + verification)
- **Monitoring**: Track 0041 status in MIGRATION_LOG.md; alert on any post-deployment issues
- **Future work (T8)**: Address status_history audit gap (closed state never recorded), design organizations hierarchy expansion (currently only CTE - Santa Elena), consider automating deployment via CI/CD (out of scope for manual-first T7)
