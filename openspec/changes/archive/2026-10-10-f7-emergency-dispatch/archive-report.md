# Archive Report: F7 — Despacho de emergencias

**Change**: `back/2026-08-29-f7-emergency-dispatch`
**Date Archived**: 2026-10-10
**Artifact Store**: openspec
**Status**: COMPLETE

---

## Change Summary

Emergency dispatch feature (F7) implementing critical incident notification via Telegram, load validation in assignments, and organization-scoped assignment controls.

- **Proposal**: Defined scope, approach, and risks for emergency dispatch workflow
- **Design**: Architecture decisions D1–D12 including unified cap validation, Telegram outbox pattern, and organization-scoped writes
- **Spec**: 8 requirements / 41 scenarios covering Telegram notifications, reminder scheduling, cap override exceptions, and organization isolation
- **Tasks**: 52 implementation tasks (A.1–A.5, B.1–B.6, C) — all marked complete
- **Verification**: Round 4 PASS (2026-10-10) — 0 CRITICAL / 0 WARNING / 0 SUGGESTION

---

## Delta Specs Synced

| Domain | File | Action | Details |
|--------|------|--------|---------|
| emergency-dispatch | `openspec/specs/emergency-dispatch/spec.md` | Created | 8 requirements, 41 scenarios, 154 lines. First introduction of emergency-dispatch domain. Copy verified clean (diff confirmed empty). |

---

## Archive Contents

- ✅ `proposal.md` — Intent, hallazgo, scope, capabilities, dependencies, risks
- ✅ `design.md` — Technical approach, architecture decisions D1–D12, file changes, testing strategy
- ✅ `specs/emergency-dispatch/spec.md` — 8 requirements with 41 complete scenarios
- ✅ `tasks.md` — 52 tasks in 11 groups (A.1–A.5, B.1–B.6, C), all marked [x]
- ✅ `apply-progress.md` — Implementation status, known issues (W1, W2 fixed in later rounds)
- ✅ `verify-report.md` — Round 4 verification, spec compliance matrix, design coherence checklist

**Archive Location**: `openspec/changes/archive/2026-10-10-f7-emergency-dispatch/`

---

## Final State at Archiving

### Task Completion

All 52 implementation tasks are marked complete [x] in `tasks.md`:

**Block A (Cap Validation & Org Scoping)**:
- A.1: Migration 0069 reserved and created with 5 columns
- A.2: Cap validation extracted and unified; parity test passing
- A.3: Override exception implemented; limited to critical; requires explicit confirmation and reason
- A.4: `availableOperators()` returns all operators with `available: boolean` and `maxActive` flags
- A.5: Organization scope validation added to assign, release, and update; master retains global scope

**Block B (Telegram Notifications)**:
- B.1: Migration schema verified (users.telegram_chat_id, assignments.cap_override_*, incidents.reminder_count/last_reminded_at)
- B.2: TelegramModule created; service, outbox consumer, and dead-stream pattern implemented
- B.3: CriticalIncidentListener enqueues notifications to admin_org on incident creation
- B.5: Reminder scheduler runs every minute; 3-message cadence (T+25min, T+40min, T+60min to master); hard stop at reminder_count=3
- B.6: IncidentAssignedListener sends full task details to assigned operator; includes override_reason if present
- B.4: Tests confirm Telegram outage doesn't block incident creation; external failures isolated to consumer

**Block C (Closure)**:
- C.1: lint, typecheck, test, and test:e2e all pass (1369 tests / 0 failures / 11 pre-existing skipped)
- C.2: TELEGRAM_BOT_TOKEN documented in backend/.env.example
- C.3: AvailableOperatorDto contract change notified to F3 story (task F3.4.10 must consume `available` flag)

### Verification Status

**verify-report Round 4 (2026-10-10)**: PASS

- **Critical Issues**: 0
- **Warnings**: 0 (W1 "5 min" phrase fixed in tasks.md; W2 scheduler guard regression fixed with new test)
- **Suggestions**: 0

**Spec Compliance**: All 8 requirements / 41 scenarios verified:
1. Aviso por Telegram ante incidencia crítica — 5 scenarios PASS
2. Recordatorio mientras la emergencia siga sin atender — 8 scenarios PASS (W2 fix verified)
3. El operador asignado recibe su tarea — 4 scenarios PASS
4. La excepción al tope se comunica al operador — 2 scenarios PASS
5. El canal externo no compromete la creación — 3 scenarios PASS (R1 mitigated by outbox)
6. La asignación valida la carga del operador — 4 scenarios PASS
7. Excepción al tope con confirmación explícita — 5 scenarios PASS
8. Las escrituras de asignación se acotan por organización — 7 scenarios PASS
9. El selector muestra también a los operadores ocupados — 4 scenarios PASS

**Design Coherence**: All 12 architecture decisions verified:
- D1: shared cap validation (assertClaimCapAllowed)
- D2: exception limited to critical incidents
- D3: override persists reason + author
- D4: availableOperators informs, not filters
- D5: Telegram by outbox (R1 mitigated)
- D6: telegram_chat_id on users table
- D7: one-way bot (no webhook)
- D8: token from env, not logged
- D10: REVISED 25/40/60 cadence with hard stop at reminder_count=3
- D11: operator notified on assign with override reason
- D12: organization-scoped writes with global master scope

---

## Intermediate Snapshots

Per the Final-State Authority section of the archive skill:

- **apply-progress.md** (persisted during apply): Documented implementation deviations (D1 helper on IncidentWorkflowService, native fetch vs axios) and cadence REVISED from spec 5/30/60 to impl 25/40/60. Both marked acceptable.
- **verify-report Rounds 1–3**: Earlier rounds identified W1 (stale "5 min" phrase in tasks.md:B.5.1) and W2 (scheduler permanent stall with upper-bound time guards). Both fixed between Round 3 and Round 4.

**Round 4 Finding**: Re-audited full change after W2 fix; no regressions. Regression test added (`'W2 regression: sends the 1st reminder even when elapsed > 40min'`); test count +1 (1368→1369).

---

## Mechanical Copy Verification

### Spec Sync (Step 2)

```
diff -r openspec/changes/back/2026-08-29-f7-emergency-dispatch/specs/emergency-dispatch/spec.md \
         openspec/specs/emergency-dispatch/spec.md
```

**Result**: Empty diff ✓ (no differences — copy verified clean)

### Archive Move (Step 3)

```
diff -r <snapshot-source> openspec/changes/archive/2026-10-10-f7-emergency-dispatch/
```

**Result**: Empty diff ✓ (source verified gone; destination byte-identical to pre-move snapshot)

**Checklist**:
- [x] Main specs updated correctly (emergency-dispatch/spec.md created)
- [x] Change folder moved to archive (2026-10-10-f7-emergency-dispatch)
- [x] Archive contains all artifacts (proposal, specs, design, tasks, apply-progress, verify-report)
- [x] Archived tasks.md has no unchecked implementation tasks (all 52 marked [x])
- [x] Active changes directory no longer has this change (source removed)
- [x] Verbatim diff-r output is empty (only passing evidence)

---

## Dependencies & Downstream Impacts

### Upstream Dependencies

- **F4 (Story 306)**: Critical incident priority creation. This change depended on F4; F4 is now a prerequisite for the feature to function end-to-end. Verified in proposal.

### Downstream Impacts

- **F3 (Story 305)**: Task F3.4.10 must consume the `available` boolean flag from the revised AvailableOperatorDto contract. This was notified in task C.3 (see apply-progress.md §7). The flag is now persistent; any code that reads availableOperators() without consuming `available` will be incomplete.

---

## Key Learnings

1. Telegram outbox pattern (Redis Streams + consumer) successfully isolates external service failures from the incident creation path, fully mitigating risk R1.
2. Organization-scoped assignment validation (D12) uncovered a pre-existing cross-org assignment hole that was fixed during implementation (A.5.1–A.5.7).
3. Scheduler progress tracking via reminder_count counter (not elapsed-time guards) provides a deterministic, restart-safe mechanism for reminder cadence and hard stop at 3.
4. Override exception limited to critical incidents maintains the enforceability of the operator cap for routine work while enabling emergency override with audit trail.

---

**Archive Status**: ✅ COMPLETE — Change fully documented, moved, and closed. Specs merged. All artifacts present. Ready for delivery per ordinary repository policy.
