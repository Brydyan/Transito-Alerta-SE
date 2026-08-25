# Archive Report: T7 — Database Schema Parity

**Change**: t7-database-schema-parity
**Date**: 2026-08-24
**Archiver**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Artifact Store**: hybrid (files at repo root `openspec/` + Engram)
**Status**: ARCHIVED (partial; T7.9.C/D pending operator input)
**Branch**: brydyan/sc-292/fase-7-backend-paridad-de-esquema-de-base
**Commits**: 063cc28, cbbf769, d7031ae, 904de01, 858ee25, 35a7775, 543bc56, d3e6fcf, ae8210b, 7758435 (10)

---

## Executive Summary

T7 — Database Schema Parity & Hardening — audited GeoReporta's 72 Laravel
migrations, 14 seeders, and 18 Eloquent models against this project's 29 SQL
migrations, producing 26 gaps across 9 groups (D7.1–D7.9) and 10 new
migrations (0030–0039). T7.1–T7.9.B is implemented across 4 Strict-TDD apply
batches, with 837 unit tests and 289 e2e tests green (no regressions). T7.9.C
(seed real Santa Elena organizations + parishes) is explicitly **blocked** on
operator input (not invented data), and T7.9.D (demo/volume seed generators)
was not reached this cycle. This is archived now as a coherent,
independently-mergeable slice, per user instruction, rather than left
in-progress indefinitely.

---

## Completeness

| Dimension | Status |
|---|---|
| Migrations | 0030–0039 — **10 of 10 files exist**. 0030–0038 fully applied (per commits); 0039 contains only Fase B (notification permissions) — Fase C (geography + seed orgs) awaits operator input |
| Tasks | T7.1–T7.9.B: **complete** `[x]` (with 5 minor open sub-tasks, see below, none blocking). T7.9.C/D: **blocked/not started** `[ ]` |
| Tests | 837 unit + 289 e2e (across 36 e2e spec files), 100% green |
| Spec compliance | R1–R20: ✅ Compliant. R21 (geography+orgs): 🚧 Blocked. R22 (demo/volume separation): ⬜ Not started |

### Minor open sub-tasks (non-blocking, tracked in tasks.md)

- T7.1.B4/B5 — `--down` CLI mode + `package.json` scripts for the migration runner
- T7.1.C3 — audit/fix of pre-0030 DOWN files
- T7.1.D2 — `docs/tasks/3-DATABASE-SCHEMA.md` sync (R18.1)
- T7.3.A5–A7 — entity-level `update:false` pattern + repository audit for `updated_at` (the DB-level migration 0032 + trigger, commit d7031ae, IS applied; this is the TypeORM-side follow-through)
- T7.Z1–Z4 — Cierre group (full-schema e2e, MIGRATION_LOG.md rows for 0030–0039, final lint/typecheck/build sweep, Supabase manual-apply writeup)

**Documentation debt flagged, not fixed**: `tasks.md` checkboxes for T7.3
(D7.3, migration 0032) were still `[ ]` at archive time despite migration
0032 being committed (d7031ae) and confirmed applied by the git history in
this session's context. Task-tracking bookkeeping lagged behind actual work
across this change (also true for T7.1's sub-tasks above) — apply-progress
itself flags "T7.1/T7.3 were never fully closed out." This is corrected in
the compliance tables of this report and of the main spec, but the
archived `tasks.md` checkbox state is preserved verbatim as the historical
record of what was tracked at the time, not what was actually done.

---

## Key Fixes (behavioral, not just schema gaps)

1. **T7.5 — Organization notification routing**: `notifiedFor()` previously
   resolved a single flat zone, returned at most one organization, and
   computed `is_claimable` incorrectly (`max_active_claims > 0` instead of
   "the org auto-assign would pick"). Corrected to recursive zone + category
   ancestry, returning all notified orgs with a deterministic
   `is_claimable`. This was a **T6-era behavioral defect**, not merely a
   missing column — latent in production because `organizations` had zero
   seeded rows until this change.
2. **T7.7 — Referential integrity**: added the `check_is_leaf_category`
   trigger (the only one of 4 legacy triggers actually ported — the other 3
   are correctly superseded by NestJS application-layer components) and
   normalized 4 FKs that had no `ON DELETE` clause (audit found 4, not the
   6 originally estimated — design.md D13).
3. **T7.9.B — Notification permissions bug**: `NotificationsController.approve`/`.reject`
   have required `@RequirePermission('UPDATE')` since T5.6, but no role's
   `roles.permissions` JSONB ever granted `'UPDATE notifications'` — every
   role, including `admin_sistema`, has been getting 403 on those routes
   since they were written. Migration 0039 (Fase B) is the missing grant,
   not new authorization code.

---

## Migration Summary

| File | Group | Status | Notes |
|---|---|---|---|
| 0030 | D7.1 tooling | ✅ Committed (063cc28) | `schema_migrations` table + backfill |
| 0031 | D7.2 soft delete | ✅ Committed (cbbf769) | `deleted_at` on 7 tables + partial indexes |
| 0032 | D7.3 updated_at | ✅ Committed (d7031ae) | trigger + function on 12 tables |
| 0033 | D7.4 comment threading | ✅ Committed (904de01/858ee25) | `parent_id`, depth-2 enforcement |
| 0034 | D7.5 org hierarchy + routing | ✅ Committed | `parent_id`, `incident_category_id`, `uq_organizations_zone` fully removed |
| 0035 | D7.6 domain columns | ✅ Committed (35a7775) | `geo_zones.code`, `users.phone` |
| 0036 | D7.7 referential integrity | ✅ Committed (543bc56) | leaf-category trigger + FK normalization |
| 0037 | D7.8 index parity | ✅ Committed (d3e6fcf) | 4 of 9 indexes newly created (5 pre-existed, D10) |
| 0038 | D7.9.A category tree | ✅ Committed (ae8210b/7758435) | 22 categories (5 roots + 17 leaves, corrected from 23/18 — D14) |
| 0039 (Fase B) | D7.9.B notification perms | ✅ Committed (ae8210b/7758435) | catalog rows + role grants |
| 0039 (Fase C) | D7.9.C geography + seed orgs | 🚧 **Not written** | blocked on operator input — see below |

---

## Blocked Items

### T7.9.C — Blocked on operator input (NOT a defect, a scope decision)

Migration 0039's Fase C (parish-level `geo_zones` for Santa Elena's 3 cantons +
real seed organizations) requires the actual list of organizations in the
Santa Elena deployment — name, canton, and whether it's a branch of another
org. Per design.md D12, GeoReporta's own seed data (GAD municipalities of
Quito, Guayaquil, Cuenca, Ambato, Loja) belongs to their deployment, not this
one, and must not be ported or invented. This blocks T7.9.C1 → C6.

**Action required**: operator (Andy) provides the real organization list.
Once available, resume with T7.9.C2 (parish geometry seed extension to
`generate-geo-zones-seed.js`), C4 (append orgs to 0039), C5 (its DOWN file),
and C6 (R21 e2e).

### T7.9.D — Not started (lower priority, no blocker)

Demo/volume seed generators (~25 realistic incidents + 1000-incident load
test generator, equivalent to legacy's `SantaElenaIncidentSeeder` /
`MassIncidentSeeder`) were not reached this cycle. These live under
`database/seeds/`, never in the migrations pipeline (design.md D11), so they
carry no migration-ordering risk and can be picked up independently.

---

## Testing

- **Unit**: 837/837 green, unchanged across all 4 apply batches (no regressions)
- **E2E**: 289 tests across 36 files, re-verified in 3 batches after the final
  (T7.9) apply batch — all green
- **T7-specific e2e**: 61 tests across 8 new spec files
  (`t7-migration-tracking`, `t7-migration-runner`, `t7-rollback-cycle`,
  `t7-comment-threading`, `t7-org-hierarchy-categories`,
  `t7-domain-columns`, `t7-referential-integrity`, `t7-index-parity`,
  `t7-reference-data`, `t7-notification-permissions`)
- **Known pre-existing issue, NOT introduced by T7**: `backend/test/migrations/*.e2e-spec.ts`
  (4 files, pre-T7.4 naming convention) fail 43–47 tests due to shared
  `MigrationHarness` instances being re-applied across `it()` blocks, hitting
  non-idempotent `ADD CONSTRAINT` in migrations that predate this change.
  Confirmed pre-existing (identical failures with/without the T7.9 diff).
  Recommend a dedicated cleanup before T7.Z (Cierre).
- Strict TDD used throughout: every new requirement group had a 🔴 RED test
  confirmed failing (often by physically moving the new migration files out
  of `database/migrations/` and re-running) before the GREEN implementation.

---

## Design Decisions Locked

- **D1–D5**: `schema_migrations` tracking table (SQL-managed, not TypeORM),
  SHA-256 checksum drift detection, `updated_at` via DB trigger (not
  `@UpdateDateColumn`, because half the writes are raw SQL), manual soft
  delete pattern (consistent with T6.2), and the caching invalidation caveat
  for soft-deleted roles/permissions.
- **D6**: comment threading depth is **2**, not 1 as originally designed —
  corrected via codegraph evidence (`Comment::getDepthAttribute()` +
  frontend `MAX_COMMENT_DEPTH`).
- **D7**: organization↔category routing uses a simple FK with NULL =
  transversal, **not** a pivot table — corrected via codegraph evidence that
  legacy's `category_organization` pivot has zero application-code call
  sites. `uq_organizations_zone` removed entirely (not made partial).
- **D8**: `organizations.parent_id` partially reverses the T3.2 decision —
  territorial hierarchy (`geo_zones`) and institutional hierarchy
  (`organizations`) are orthogonal in legacy, both needed here.
- **D9**: `check_is_leaf_category` is the only legacy trigger ported (data
  invariant, not app logic); the other 3 legacy triggers are correctly
  superseded by NestJS listeners/services (documented per-trigger).
- **D10, D13**: two design-time estimates corrected against real audits —
  index parity (9 estimated → 4 actually new) and FK `ON DELETE` gaps (6
  estimated → 4 actually missing).
- **D11**: reference data (migrations) vs demo/volume data (`database/seeds/`,
  never migrations) are two separate destinations, unlike legacy which mixes
  both in one `DatabaseSeeder`.
- **D12**: seeding real organizations requires operator input — architect
  does not invent tenant data. This is the origin of the T7.9.C blocker.
- **D14**: category tree count corrected 23/18 → **22/17** categories/leaves
  against the actual legacy `CATEGORY_TREE` array (verified in two
  independent copies of the legacy repo); notification permission guard
  scope decision (self-scoped routes stay `JwtAuthGuard`-only, admin routes
  keep `@RequirePermission`).

---

## Specs Synced to Main Specs

| Domain | Action | Details |
|---|---|---|
| database-schema | **Created** (new domain) | `openspec/specs/database-schema/spec.md` — R1–R22, ~90 Given/When/Then scenarios, with a Compliance Status table and inline superseded-scenario annotations (R10.4/R10.5) |

**Corrections applied during sync** (the delta spec text is preserved
verbatim in the archived copy for audit trail; the main spec carries the
corrected/annotated version as source of truth):

- **R19.3** — "sigue habiendo exactamente 23 categorías" corrected to **22**,
  consistent with R19.1's already-corrected count (design.md D14). This was
  a leftover inconsistency in the delta spec: R19.1 had been corrected but
  R19.3's re-application assertion had not.
- **R10.4 / R10.5** — marked **SUPERSEDED**. These scenarios described a
  *partial* `UNIQUE (zone_id) WHERE parent_id IS NULL` index. Implementation
  (migration 0034, T7.5.A2b) went further and removed `uq_organizations_zone`
  **entirely**, because the legacy notification model requires multiple
  organizations at different hierarchy levels to be notified for the same
  zone. R11.1 (index no longer exists) and R11.2 (multiple orgs per zone
  valid) supersede them. Original text preserved for audit continuity.
- **R8 (D7.3) compliance status** — corrected from an initial "not started"
  read of `tasks.md` checkboxes to **✅ Compliant**, after cross-referencing
  the git commit log (`d7031ae feat(t7.3): updated_at column + trigger on 12
  tables`) and apply-progress narrative, which confirmed migration 0032 was
  in fact applied — only the entity-level TypeORM follow-through (T7.3.A5–A7)
  remains open. `tasks.md` checkbox bookkeeping had lagged behind actual
  work; this report and the main spec reflect the corrected state.

---

## Archive Contents

Archived directory:
`openspec/changes/archive/2026-08-24-t7-database-schema-parity/`

Files preserved:
- `proposal.md` — 26 gaps, scope, out-of-scope decisions, risks (verbatim)
- `shortcut-ticket.md` — Shortcut ticket draft for T7 epic breakdown (verbatim)
- `design.md` — 14 decisions (D1–D14), audit evidence, entity/migration
  dependency graph (verbatim)
- `tasks.md` — 106 atomic tasks across 9 groups + Cierre, with an ARCHIVED
  header prepended (verbatim body preserved below the header)
- `specs/database-schema/spec.md` — original delta spec, R1–R22 (immutable,
  verbatim — including the pre-correction R19.3/23 and R10.4/R10.5 text, for
  audit trail)
- `apply-progress.md` — full implementation narrative reconstructed from
  Engram observation #523 (4 revisions merged)
- `verify-report.md` — synthesized verification summary (no formal
  `sdd-verify` run was executed against this slice; compiled from
  apply-progress test evidence per user instruction)
- `archive-report.md` — this file

**Note on the "move"**: consistent with this project's established archive
convention (observed in `t3.9-sessions`, `t4-security-hardening`,
`t4.2-load-testing`, `t4.1b-e2e-flows` — all of which have both a `changes/back/`
copy AND an `archive/` copy), the original source directory
`openspec/changes/infra/t7-database-schema-parity/` was **left in place**
rather than deleted — the archive executor's toolset in this session has no
file-delete/move capability, only read/write. The `tasks.md` in the original
location was edited in-place to prepend the same ARCHIVED header so anyone
Browse-ing there sees the closure status immediately.

---

## Compliance Notes

- **No CRITICAL issues.** All implemented requirements (R1–R20) are
  compliant with real test evidence.
- **Known deviations, documented (not silently dropped)**:
  - R10.4/R10.5 (spec) superseded by design.md D7 — full UNIQUE removal
    instead of a partial index.
  - Category count corrected 23→22 (design.md D14), verified against two
    independent copies of the legacy seeder source.
  - Staff role codes are `admin_sistema`/`operador_sistema`/`admin_organizacion`/
    `operador_organizacion` (GeoReporta's real codes), not the
    `admin`/`coordinator`/`operator`/`community-manager` guessed in an
    earlier task-prompt draft.
  - `0029_incident_images.sql` grants two permission strings in the wrong
    format (`resource:ACTION` vs the canonical `"ACTION resource"`) —
    surfaced as a side effect of T7.9.B's audit, documented in design.md D14,
    **not fixed** (independent migration, out of scope for D7.9).
  - `backend/test/migrations/*.e2e-spec.ts` (4 pre-T7.4-convention files) are
    pre-existing-broken due to non-idempotent `ADD CONSTRAINT` in earlier
    migrations — confirmed unrelated to this change, not fixed.
- **No data invented.** T7.9.C is explicitly blocked pending operator input
  rather than filled with placeholder/legacy organization data.

---

## Next Steps

1. **Immediate**: await operator (Andy) input for T7.9.C1 — the real Santa
   Elena organization list (name, canton, branch relationships).
2. **On input arrival**: implement T7.9.C2–C6 (parish geo_zones extension,
   seed orgs appended to 0039, its DOWN file, R21 e2e), then T7.9.D
   (demo/volume seed generators — independent, no blocker), then T7.Z
   (Cierre: full-schema e2e 0001→0039, MIGRATION_LOG.md rows for 0030–0039,
   final lint/typecheck/build sweep, Supabase manual-apply order writeup).
3. **Recommended alongside T7.Z**: fix the 4 pre-existing-broken
   `backend/test/migrations/*.e2e-spec.ts` files (non-idempotent
   `ADD CONSTRAINT` issue) and close the T7.1/T7.3 sub-tasks flagged above
   (T7.1.B4/B5/C3/D2, T7.3.A5–A7) — none are blocking, but they are real
   debt this change surfaced.
4. **Independent follow-up (not part of D7.9)**: a migration 0040+ to fix
   `0029_incident_images.sql`'s two malformed permission strings.
5. **Merge**: once T7.9.C/D land and T7.Z closes out, merge
   `brydyan/sc-292/fase-7-backend-paridad-de-esquema-de-base` and deploy
   0033–0039 to Supabase (0030–0032 already applied per the operator's
   2026-08-24 session).

---

## Artifact Traceability

- **Proposal**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/proposal.md`
- **Delta Spec (immutable)**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/specs/database-schema/spec.md`
- **Design**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/design.md`
- **Tasks**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/tasks.md`
- **Apply Progress**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/apply-progress.md` (source: Engram #523)
- **Verify Report (summary)**: `openspec/changes/archive/2026-08-24-t7-database-schema-parity/verify-report.md`
- **Main Spec (source of truth going forward)**: `openspec/specs/database-schema/spec.md`
- **Engram**:
  - `sdd/t7-database-schema-parity/apply-progress` (observation #523)
  - Related discoveries: #521 (seeder audit), #522 (codegraph routing/threading audit)
  - This report: `sdd/t7-database-schema-parity/archive-report`

The T7.1–T7.9.B slice is now **ARCHIVED**. T7.9.C/D continue under the same
change name in the original (non-deleted) source directory until the
operator input arrives and a follow-up apply/verify/archive cycle closes the
remaining scope.

---

**Archive Date**: 2026-08-24
**Archived By**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Change**: t7-database-schema-parity
**Status**: ARCHIVED (PARTIAL) — T7.9.C/D pending operator input
