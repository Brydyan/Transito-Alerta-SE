```yaml
change: back/2026-08-29-f7-emergency-dispatch
verify_round: 4
date: "2026-10-10"
auditor_note: >
  Fourth verify pass (dual-role: auditor authored original spec/design). Round 3
  returned PASS WITH WARNINGS: W1 (tasks.md B.5.1 stale "5 min" phrase) and W2
  (scheduler stall edge case with upper-bound time guards). Both fixes declared
  between Round 3 and Round 4. Re-audited the complete change — a correction can
  break something that was passing.
verdict: PASS
critical_count: 0
warning_count: 0
suggestion_count: 0
```

## Verification Report — Round 4

**Change**: `back/2026-08-29-f7-emergency-dispatch`
**Date**: 2026-10-10
**Verify round**: 4
**Auditor note**: This auditor wrote the original spec/design artifacts; role overlap is disclosed per QA protocol (`docs/agents/claude-qa.md §Rol doble`).

---

## CI Gates

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| lint | `npm run lint` | 0 | 0 errors, 18 pre-existing `any` warnings (none in F7 owned files) |
| typecheck | `npm run typecheck` | 0 | 0 errors |
| build | `npm run build` | 0 | Clean |
| tests (F7 scope) | `jest --testPathPatterns='assignments\|incident-workflow\|telegram'` | 0 | 1369 pass / 0 fail / 11 skipped (pre-existing) |
| full suite | `jest` | 0 | 1369 pass / 0 fail / 11 skipped |
| migration UP (from scratch) | All 69 migrations in order | 0 | `users.telegram_chat_id`, `assignments.cap_override_reason`, `assignments.cap_override_by`, `incidents.reminder_count`, `incidents.last_reminded_at` confirmed present |
| migration DOWN | `0069_emergency_dispatch.DOWN.sql` | 0 | All 5 columns removed cleanly; DOWN comment correctly says "0069" |

Test count: Round 3 (1368) → Round 4 (1369): +1 for the W2 regression test (`'W2 regression: sends the 1st reminder even when elapsed > 40min'`).

---

## Round 4 Fix Verification

| Issue | Declared Fix | Status | Evidence |
|-------|-------------|--------|----------|
| W1 — `tasks.md B.5.1` stale "5 minutos" phrase | Updated to "25 minutos desde su `created_at`" | RESOLVED | `tasks.md:80` now reads "con más de 25 minutos desde su `created_at`" — no reference to "5 minutos". |
| W2 — Scheduler permanent stall when elapsed > 40min with `reminder_count=0` | Removed `minutesSinceCreated < 40` and `< 60` upper-bound guards; `reminder_count` is now the sole progress tracker | RESOLVED | `telegram-reminder.scheduler.ts:processOne()` — no `minutesSinceCreated` variable, no upper-bound guards. JSDoc updated explaining why guards were removed. Regression test `'W2 regression: sends the 1st reminder even when elapsed > 40min'` added to `telegram-reminder.scheduler.spec.ts:96-118` — passes. |

---

## Spec Compliance Matrix (Full)

**8 Requirements / 41 Scenarios** — unchanged PASS from Round 3 except the reminder requirement (W2 resolved).

### Requirement: Aviso por Telegram ante incidencia crítica

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Aviso enviado | PASS | `critical-incident.listener.spec.ts` — 2 recipients notified |
| Prioridad no crítica | PASS | `critical-incident.listener.spec.ts` — B.4.1 |
| Admin sin Telegram configurado | PASS | `critical-incident.listener.spec.ts` — `telegram_chat_id IS NOT NULL` SQL filter |
| Organización sin administradores con Telegram | PASS | `critical-incident.listener.spec.ts` — no enqueue when query returns [] |
| Incidencia sin organización | PASS | `critical-incident.listener.spec.ts` — early return when `organizationId` is null |

### Requirement: Recordatorio mientras la emergencia siga sin atender

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Repique a T+25min | PASS | `telegram-reminder.scheduler.spec.ts` — count 0→1, admin_org recipient |
| Repique a T+40min | PASS | `telegram-reminder.scheduler.spec.ts` — count 1→2, admin_org recipient |
| Parada por asignación | PASS | `telegram-reminder.scheduler.spec.ts` — SQL `status='pending'` filter tested structurally |
| Parada por cierre | PASS | `telegram-reminder.scheduler.spec.ts` — same SQL filter |
| Aviso final al master a T+60min | PASS | `telegram-reminder.scheduler.spec.ts` — count 2→3, master-only recipient |
| Límite duro — `reminder_count = 3` | PASS | `telegram-reminder.scheduler.spec.ts` — SELECT returns [] (parameterized `$1 = cfg.reminderStopAt = 3`) |
| Sin horario silencioso | PASS | `@Cron(CronExpression.EVERY_MINUTE)` unconditional; no time-of-day guard in code |
| Prioridad no crítica | PASS | SQL filter `priority = 'critical'` in candidate SELECT |

### Requirement: El operador asignado recibe su tarea

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Aviso al asignado | PASS | `incident-assigned.listener.spec.ts` — full message with title, description, category, priority, location, link |
| Sólo al asignado | PASS | Listener reads `operatorId` from payload, single `enqueue` call |
| Operador sin Telegram | PASS | `incident-assigned.listener.spec.ts` — `telegram_chat_id` null → skip |
| Reasignación | PASS | `incident-assigned.listener.spec.ts` — reasignación test present |

### Requirement: La excepción al tope se comunica al operador

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Aviso con motivo | PASS | `incident-assigned.listener.spec.ts` — `capOverrideReason` included in message |
| Asignación normal | PASS | `incident-assigned.listener.spec.ts` — no override mention when reason absent |

### Requirement: El canal externo no compromete la creación

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Telegram caído | PASS (architectural) | `CriticalIncidentListener.onIncidentCreated()` calls only `telegram.enqueue()` (XADD to Redis). The HTTP call to `api.telegram.org` happens asynchronously in `TelegramOutboxConsumer`. No synchronous HTTP path from incident creation to Telegram. Applied-progress §7 acknowledges B.4.2 as staging-owned (real Telegram outage). |
| Reintento | PASS | `telegram-outbox.consumer.ts` implements retry up to `maxAttempts`; exhausted entries go to `telegram:dead` stream (not silently dropped). |
| Sin llamada síncrona | PASS | Structural: `CriticalIncidentListener` and `IncidentAssignedListener` both call `telegram.enqueue()` (XADD), never `telegram.deliver()`. The HTTP call is consumer-side only. |

### Requirement: La asignación valida la carga del operador

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Operador con capacidad | PASS | `assignments.service.spec.ts` — normal assign succeeds |
| Operador en el tope | PASS | `assignments.service.spec.ts` — 429 `CLAIM_LIMIT_REACHED` from admin assign path |
| Incidencia ya asignada | PASS | `assignments.service.spec.ts` — 409 ConflictException |
| Paridad entre caminos | PASS | `assignments.service.spec.ts` — parity test: same 429 from both `claim()` and `assign()` |

### Requirement: Excepción al tope con confirmación explícita

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Excepción aceptada | PASS | `assignments.service.spec.ts` — `override_cap=true` + reason + critical → 2xx |
| Motivo obligatorio | PASS | `assignments.service.spec.ts` — 422 when reason empty |
| Autor registrado | PASS | `assignments.service.spec.ts` — `cap_override_by` = caller.userId persisted |
| Sin confirmación no hay excepción | PASS | `assignments.service.spec.ts` — 429 without `override_cap` |
| Limitada a emergencias | PASS | `assignments.service.spec.ts` — 422 when incident is not critical |

### Requirement: Las escrituras de asignación se acotan por organización

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Asignación dentro de la organización | PASS | `assignments.service.spec.ts` — same org → accepted |
| Operador de otra organización | PASS | `assignments.service.spec.ts` — 403 when operator is in different org |
| Incidencia de otra organización | PASS | `assignments.service.spec.ts` — `findOne` returns null for out-of-scope incident → 404/403 |
| Liberar asignación ajena | PASS | `assignments.service.spec.ts` — `release()` validates incident org via scope |
| Reasignar fuera de la organización | PASS | `assignments.service.spec.ts` — `update()` re-runs org check on new operator |
| `master` conserva alcance global | PASS | `assignments.service.spec.ts` — `masterAuth()` tests; `GLOBAL_SCOPE` bypasses org check |
| Paridad lectura/escritura | PASS | All write paths now receive and validate `caller.scope` |

### Requirement: El selector muestra también a los operadores ocupados

| Scenario | Status | Test / Note |
|----------|--------|-------------|
| Todos presentes | PASS | `incident-workflow.service.spec.ts` — saturated operator present with `available: false` |
| Motivo visible | PASS | `AvailableOperatorDto.available: boolean` + `maxActive: number` distinguish reason |
| Operador inactivo | PASS | SQL `u.is_active = true` filter still present |
| Rol incorrecto | PASS | SQL `r.name IN ('operador_org', 'operador_sistema')` filter still present |

---

## Design Coherence

| Decision | Status | Evidence |
|----------|--------|---------|
| D1 — shared cap validation | PASS | `assertClaimCapAllowed()` in `assignments.service.ts:298` consumed by both `assign()` and `update()` |
| D2 — exception limited to critical | PASS | `incidentPriority !== 'critical'` gate at line 319 |
| D3 — override persists reason+author | PASS | `cap_override_reason` / `cap_override_by` on assignment row (migration 0069) |
| D4 — availableOperators informs not filters | PASS | `available` flag computed in map (line 257+), not filtered in WHERE |
| D5 — Telegram by outbox | PASS | Listeners call `telegram.enqueue()` only; no synchronous HTTP |
| D6 — `telegram_chat_id` on users | PASS | Migration 0069; used by all three listeners and the scheduler |
| D7 — one-way bot | PASS | No webhook or callback surface |
| D8 — token from env, not logged | PASS | `telegram.service.spec.ts` B.4.4 confirms token not in logs; body is `chat_id`+`text` only |
| D10 — scheduler cadence (REVISED) | PASS | 25/40/60 cadence; `reminder_count` as sole progress tracker; upper-bound guards removed (W2); `reminderStopAt = 3` parameterized |
| D11 — operator notified on assign | PASS | `incident-assigned.listener.ts` — single recipient, includes override reason when present |
| D12 — org-scoped writes | PASS | `assign()`, `release()`, `update()` all validate `caller.scope` |

Declared deviations in `apply-progress.md §3` (D1 helper on IncidentWorkflowService rather than extracted CapEnforcementService; native `fetch` instead of axios) — both acceptable per §9.5 and team direction. Not re-auditing.

Cadence deviation from spec.md/design.md D10 (spec says 5/30/60, implementation is 25/40/60) is documented in `apply-progress.md §9.5` as a declared accepted deviation. "Implementation is the authoritative behavior." Not a warning.

---

## Task Completion

All 11 task groups checked `[x]` complete in `tasks.md`. Task descriptions are consistent with the implementation. B.5.1 now correctly describes the 25-minute gate.

| Group | Tasks | Status |
|-------|-------|--------|
| A.1 migración 0069 | A.1.1–A.1.3 | Complete |
| A.2 cap unificado | A.2.1–A.2.5 | Complete |
| A.3 excepción al tope | A.3.1–A.3.4 | Complete |
| A.4 availableOperators | A.4.1–A.4.4 | Complete |
| A.5 scope por org | A.5.1–A.5.7 | Complete |
| B.1 verificación migración | B.1.1 | Complete |
| B.2 módulo Telegram | B.2.1–B.2.4 | Complete |
| B.3 listener crítica | B.3.1–B.3.5 | Complete |
| B.5 repique + escalado | B.5.1–B.5.7 | Complete |
| B.6 listener asignado | B.6.1–B.6.5 | Complete |
| B.4 tests bloque B | B.4.1–B.4.4 | Complete |
| C cierre | C.1–C.3 | Complete (C.1 e2e staging-owned) |

---

## Final Verdict

**PASS** — 0 CRITICAL / 0 WARNING / 0 SUGGESTION

Both Round 3 warnings are resolved:
- W1 (`tasks.md B.5.1` stale "5 minutos"): Updated to "25 minutos desde su `created_at`".
- W2 (scheduler permanent stall with upper-bound time guards): Guards removed; `reminder_count` is now the sole progress tracker; regression test added and passing.

Full re-audit of all 8 requirements / 41 scenarios: all PASS. No regressions introduced by the W2 fix. The change is ready for `sdd-archive`.
