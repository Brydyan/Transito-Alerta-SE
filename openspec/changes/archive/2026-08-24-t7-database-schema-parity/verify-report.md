# Verify Report: T7 — Database Schema Parity & Hardening (Summary)

**Change**: t7-database-schema-parity
**Date**: 2026-08-24
**Status**: ⚠️ NO FORMAL `sdd-verify` RUN EXECUTED — this is a synthesized summary
compiled from apply-progress (Engram #523) at archive time, per user instruction
("if not [generated], create a summary").

---

## Why no formal verify-report exists

The change was archived directly from apply-progress at the user's explicit
request, closing out the independently-mergeable T7.1–T7.9.B slice while
T7.9.C/D remain blocked/not-started. No `sdd-verify` sub-agent was launched
against this slice before archival. This summary reconstructs a verification
verdict from the evidence already gathered during the 4 apply batches.

---

## Test Evidence (from apply-progress, Batch 4 session)

| Layer | Count | Status |
|---|---|---|
| Unit tests | 837 | ✅ Green, unchanged across all 4 batches |
| E2E — T7-specific | 61 (T7.4–T7.9.B) | ✅ Green |
| E2E — full regression | 289 across 36 files (3 verification batches: 116+110+63) | ✅ Green |
| `tsc --noEmit` | — | ✅ Clean |
| `eslint` on new files (0038/0039 specs) | — | ✅ Clean (0 errors/warnings) |

**Known pre-existing issue (not introduced by T7, not fixed)**: 4 files under
`backend/test/migrations/` (`schema-migrations`, `soft-delete-completeness`,
`updated-at`, `rollback-cycle` — pre-T7.4 naming convention) fail 43-47 tests
due to a shared `MigrationHarness` instance being re-applied across `it()`
blocks, hitting "constraint already exists" errors from non-idempotent
`ADD CONSTRAINT` statements in earlier migrations. Confirmed pre-existing by
diffing with/without the T7.9 batch — identical failures either way.

---

## Requirement Compliance (per specs/database-schema/spec.md)

| Group | Requirements | Verdict |
|---|---|---|
| D7.1 Tooling | R1–R4 | ✅ Compliant (0030 applied; R2/R3 runner subtasks T7.1.B4/B5/C3/D2 open, non-blocking for the core requirement) |
| D7.2 Soft delete | R5–R7 | ✅ Compliant (0031 applied; app-level filters folded into T7.4–T7.6 work incrementally) |
| D7.3 updated_at | R8 | ✅ Compliant — migration 0032 applied (commit d7031ae); entity-level `update:false` pattern (T7.3.A5–A7) still open in tasks.md bookkeeping, non-blocking |
| D7.4 Comment threading | R9 | ✅ Compliant (0033, 9 e2e scenarios green) |
| D7.5 Org hierarchy + routing | R10–R11 | ✅ Compliant (0034; R10.4/R10.5 superseded by fuller UNIQUE removal, documented in design.md D7) |
| D7.6 Domain columns | R12–R13 | ✅ Compliant (0035) |
| D7.7 Referential integrity | R14–R15 | ✅ Compliant (0036; audit found 4 NO-ACTION FKs, not the estimated 6 — documented in D13) |
| D7.8 Index parity | R16 | ✅ Compliant (0037; 4 of 9 indexes newly created, 5 pre-existed under other names — documented in D10) |
| Transversal | R17–R18 | ⚠️ Partial — full-schema e2e (T7.Z1) and docs sync (T7.1.D2) not executed |
| D7.9.A Category tree | R19 | ✅ Compliant (0038, count corrected 23→22 per D14) |
| D7.9.B Notification perms | R20 | ✅ Compliant (0039 Fase B; fixed a live pre-existing 403 authorization bug) |
| D7.9.C Geography + seed orgs | R21 | 🚧 Blocked — awaiting operator input (real Santa Elena org list, D12) |
| D7.9.D Demo/volume data | R22 | ⬜ Not started this cycle |

---

## Critical / Warning / Suggestion

**CRITICAL**: 0 — no violations of implemented requirements found.

**WARNING**: 1
- W1: `backend/test/migrations/*.e2e-spec.ts` (4 files, pre-T7.4 convention)
  are broken due to non-idempotent `ADD CONSTRAINT` in migrations predating
  this change. Pre-existing, not introduced by T7, not fixed — recommend a
  dedicated cleanup task before T7.Z (Cierre).

**SUGGESTION**: 2
- S1: `0029_incident_images.sql` grants two permission strings in the wrong
  format (`resource:ACTION` instead of `"ACTION resource"`) — those grants
  have never matched anything. Needs its own migration (0040+), independent
  of this change. Documented in design.md D14.
- S2: T7.1's runner `--down`/package.json scripts (T7.1.B4/B5) and DOWN-file
  audit (T7.1.C3) remain open; recommend closing before relying on
  `db:rollback` in any environment.

---

## Verdict

**PASS (partial scope)** — T7.1–T7.9.B is a coherent, independently-mergeable
slice with 0 CRITICAL issues. Blocked/not-started items (R8, R21, R22,
transversal R17/R18) are explicitly scoped out of this archive cycle, not
silently dropped — see archive-report.md for the full breakdown and next
steps.
