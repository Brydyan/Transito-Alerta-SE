# Closure Proposal: T7.9.Z — Documentación y Verificación Final de T7

## Intent

Close T7.9 (Database Schema Parity) with documentation updates, pre-deployment verification, and operator handoff instructions. This is the **Closure phase** (Z1–Z5) following completion of C2–C7 (parroquias migration) and D1–D11 (seeding pipeline).

## Scope

### In Scope
- **Z1**: Record migration 0041 entry in `database/MIGRATION_LOG.md` with description, pre-applied status, Supabase target
- **Z2**: Re-anchor R21 scenarios from migration 0039 → 0041 in spec artifacts (delta specs + main specs once archived)
- **Z3**: Update `docs/tasks/3-DATABASE-SCHEMA.md` range from 0001–0040 to 0001–0041 + summary of T7.9.C/D scope
- **Z4**: Full CI verification (lint, typecheck, build, test, e2e, migrations) — zero errors
- **Z5**: Draft operator manual for manual application of 0041 in Supabase + checkpoint verification

### Out of Scope
- Fixing the audit gap for `closed` state transition to `status_history` (raised as discovery in D7.9.D, escalated to T7.9.Z/T8)
- Re-seeding production data beyond CTE - Santa Elena organization (scope was single org + Santa Elena parroquias)
- Performance tuning of volume seeder or feed rebuild

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `database-schema`: R21 re-anchored to 0041 (migration numbering reflects real application order)
- `database-seeding`: Seeds operationalized — documented and tested; reproducible on clean DB

## Approach

### Pre-Deployment Documentation
- **MIGRATION_LOG.md row (Z1)**: `0041` entry with load-bearing order note (code backfill → parroquias → org), idempotence note (`ON CONFLICT`, `WHERE NOT EXISTS`), Supabase application status as `⏳ Pending`
- **Spec re-anchor (Z2)**: R21.0–R21.5 scenarios updated — from "0039 must be applied first" to "0041 must be applied after 0040" + reference current migration file path
- **Task documentation (Z3)**: Range updated, T7.9.C/D summary added (what was implemented, what remains for future phases like status_history audit)

### Verification Protocol (Z4)
1. **Lint**: `eslint --cache` on new `.ts` files (unit + e2e specs)
2. **TypeScript**: `tsc --noEmit` on `backend/` (must resolve D warnings: deprecated rule names)
3. **Build**: `nest build` (ensures no runtime import errors)
4. **Unit + E2E**: `jest` full suite (C2–C7 + D1–D11 scopes)
5. **Migrations**: `backend/test/migrations/*` suites (0001–0041 apply clean, re-apply is no-op, rollback cycle)
6. **Exit code**: 0 (all gates pass)

### Operator Handoff (Z5)
- SQL snippet: contents of `0041_geography_organizations_seed.sql` ready for copy-paste
- Prerequisites: `0040_rename_roles.sql` must be registered in `schema_migrations` (if not already, `npm run db:migrate` on Supabase first)
- Verification checklist: 
  - `SELECT COUNT(*) FROM geo_zones WHERE level='parroquia' AND code LIKE 'EC-24-%'` = 11
  - `SELECT COUNT(*) FROM organizations WHERE name='CTE - Santa Elena'` = 1
  - Re-apply: `SELECT COUNT(*) FROM geo_zones` unchanged after re-running 0041
- Status tracking: update `MIGRATION_LOG.md` row 0041 to `✅ Applied` + timestamp

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/MIGRATION_LOG.md` | Modified | Row 0041 added (pending → applied tracking) |
| `openspec/changes/infra/t7-database-schema-parity/specs/database-schema/spec.md` | Modified | R21 re-anchor 0039→0041 (during archive merge) |
| `openspec/changes/infra/t7-database-schema-parity/tasks.md` | Modified | C1–C6 re-references updated if anchored to 0039 |
| `docs/tasks/3-DATABASE-SCHEMA.md` | Modified | Migration range 0001–0040 → 0001–0041, T7 summary |
| `backend/package.json` | Already done | No change — Z4 only verifies existing scripts |

## Timeline & Effort

| Task | Effort | Dependency |
|------|--------|-----------|
| Z1 + Z3 (docs) | ~1h | None (can start now) |
| Z2 (re-anchor) | ~45min | None (can start now) |
| Z4 (full CI) | ~1h | C2–C7 + D1–D11 complete |
| Z5 (operator manual) | ~45min | 0041 finalized |

Total: **~4.25h** (non-blocking; Z1/Z2/Z3 runnable in parallel)

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lint/TypeScript/build failures in new code | Low | Z4 explicitly runs full suite; abort immediately if any gate fails |
| Operator applies 0041 out of order (before 0040 in Supabase) | Med | Z5 documents prerequisite check (`WHERE 1=1 FROM schema_migrations WHERE name='0040_rename_roles'`) and provides backoff instruction |
| Off-by-one in re-anchor (scenarios still reference 0039 after Z2) | Low | Z2 does regex sweep of all three spec files; verify all `0039` → `0041` swaps completed |
| Audit trail incomplete (status_history gap for closed state discovered too late) | High | Already documented in D7.9.D10 note; raised to T8 roadmap; Z5 includes forward note: "Post-deploy, run audit query X to detect incidents missing closed-state history row" |

## Rollback Plan

1. Z1–Z3 (docs): Simple file reverts — no schema impact
2. Z4 (CI): No persistent changes — only verification
3. Z5 (operator manual): If Supabase application fails, operator follows Supabase restore-point procedure (out of scope for this phase)

## Dependencies

- Completion of T7.9.C2–C7 (migration 0041 finalized)
- Completion of T7.9.D1–D11 (seeders finalized, npm scripts in place)
- Operator access to Supabase SQL editor + `schema_migrations` read permission for Z5 verification

## Success Criteria

- [ ] `database/MIGRATION_LOG.md` row 0041 exists with complete description and idempotence note
- [ ] R21.0–R21.5 scenarios in all spec files reference 0041, not 0039
- [ ] `docs/tasks/3-DATABASE-SCHEMA.md` documents 0001–0041 range and summarizes T7.9.C/D closure
- [ ] CI full run: lint 0 errors, typecheck 0 errors, build success, unit tests green, e2e tests green, migration suites green
- [ ] Z5 operator manual is copy-paste-ready and includes verification checklist
- [ ] No CRITICAL findings in final sdd-verify

## Next Phase

Deployment (manual operator step, out of SDD scope). Post-deployment: address status_history audit gap (T8, separate initiative).
