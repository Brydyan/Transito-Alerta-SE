# Handoff — F4 Fase A (Backend incident-social) para Gemini CLI

> **How to use**: continue the SDD Fase A implementation of change
> `2026-08-29-f4-citizen-feed-wizard-map` in repo
> `/home/carlosfpatino/Workspaces/Transito-Alerta-SE`.
> Previous `sdd-apply` runs were aborted by provider quota mid-work; the working
> tree contains PARTIAL work. Continue from that state, do not rewrite from scratch.

---

## 1. Scope (hard boundaries)

- Implement ONLY **Fase A (backend incident-social)**. Do **NOT** touch Fase B (frontend wizard/map), `openspec/config.yaml`, `.atl/`, or any other change.
- Authorized source files live under `backend/` and `database/`.
- **NEVER run `git add`, `git commit`, `git push`, or create PRs.** Leave the working tree ready; the human commits.
- STRICT TDD: write/adjust tests BEFORE the implementation that makes them pass. Test runner: `npm test` from `backend/`.

## 2. Artifacts (real paths — no dispatcher)

- Spec (Fase A): `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/specs/incident-social/spec.md`
- Design: `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/design.md`
- Tasks: `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md`

Key design decisions (from design.md):
- **D2** — follow is idempotent (UNIQUE violation => success); corroborate duplicate => **409** (deliberate asymmetry).
- **D3** — NO soft-delete on these tables (soft-delete would break the UNIQUE that backs idempotency).
- **D5 (mandatory)** — propagate new permissions to BOTH `roles.permissions` AND existing `users.permissions` (denormalized copy at role-assignment time; updating roles alone leaves existing users without the new permissions — this exact bug already happened in this project).
- **D4** — expose `follower_count`, `corroboration_count`, `is_followed_by_me`, `is_corroborated_by_me` on incidents.

## 3. Current working-tree state (partial work from aborted runs)

Already written — **inspect these first and continue from them**:

| Path | State |
|---|---|
| `database/migrations/0053_citizen_social_features.sql` | ✅ created (tables, permissions, D5 backfill, permission_version bump) |
| `backend/src/modules/incident-social/entities/incident-follower.entity.ts` | ✅ created |
| `backend/src/modules/incident-social/entities/incident-corroboration.entity.ts` | ✅ created |
| `backend/src/modules/incident-social/incident-social.service.ts` | ✅ created |
| `backend/src/modules/incident-social/incident-social.service.spec.ts` | ✅ created (tests-first) |
| `backend/src/modules/incident-social/incident-social.module.ts` | ✅ created |
| `database/MIGRATION_LOG.md` | ✅ entry `0053 citizen_social_features` added as ⏳ Pending |

**Migration numbering**: tasks.md A.1.1 still says "next number is 0042", but the
actual `database/MIGRATION_LOG.md` already lists up to 0047 plus new entries and
**0053 is the correct next free number** — the 0049 file and log entry already exist.
Keep 0049; do NOT renumber.

## 4. What is missing (complete these tasks from tasks.md)

Backend (Fase A) tasks, in order:

- **A.1.8** — migration test: on a base with pre-existing users, their `users.permissions` contains the new permissions (guards A.1.6/D5). Add the test if not present.
- **A.3.x** — verify service spec/impl covers: follow idempotent; unfollow of non-followed => success without count change; corroborate twice => 409; author corroborating own incident => 409. Fix/extend if incomplete.
- **A.4.1 / A.4.2** — extend `backend/src/modules/incidents/incidents.service.ts` to expose `follower_count`, `corroboration_count`, `is_followed_by_me`, `is_corroborated_by_me`; resolve counts by aggregation (LEFT JOIN LATERAL or subquery) and flags with parameterized EXISTS for the current user.
- **A.4.3** — query-count test: a paginated listing does not emit one query per row (assert on SQL query count, not time).
- **A.5.1 / A.5.2** — `incident-social.controller.ts`: `POST`/`DELETE /api/incidents/:id/followers`, `POST /api/incidents/:id/corroborations`, permission guards; unknown incident => 404; no session => 401.
- **A.5.3 / A.5.4** — notify followers when an incident status changes, EXCLUDING the actor who triggered the change; test: incident with no followers changes status without notifications and without failing.
- **A.5.5** — run the verification gate (section 6) from `backend/`.
- **Module registration** — `backend/src/modules/incident-social` is **NOT** registered in `backend/src/app.module.ts` yet. Add `IncidentSocialModule` to the module imports.
- **apply-progress** — create `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md` summarizing what was completed (this artifact does NOT exist yet).
- **tasks.md** — mark the A.* checkboxes you complete (`[x]`), leaving Fase B (`B.*`) untouched.

## 5. Project facts

- Stack: NestJS 10.4.4, TypeScript 5.5.4, PostgreSQL + TypeORM, Redis, Socket.io.
- Follow `docs/conventions.md` (naming/structure) and `docs/architecture.md`.
- Existing incidents module to extend: `backend/src/modules/incidents/`.
- Use the project's existing notification pattern (check modules under `backend/src/modules/` — notifications/websocket/Redis) for A.5.3; do not invent a new mechanism.

## 6. Verification gate (run ALL from `backend/`)

1. `npm run lint`
2. Typecheck (the script in `backend/package.json`, e.g. `npm run typecheck` or `tsc`)
3. `npm test`
4. `npm run test:e2e` — only if the e2e suite runs without external infra; if it requires DB/Redis and they are unavailable, record it as pending in apply-progress instead of failing everything else.

## 7. Report back (final message structure)

- status + summary of what was completed (Fase A)
- created/modified file paths (real paths)
- result of each verification (lint/typecheck/test/e2e) with passing test counts
- which A.* tasks were marked and which were not
- risks / pending items (e.g. e2e without infra, design decisions taken)