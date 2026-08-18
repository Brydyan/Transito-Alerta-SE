# Archive Report: T3.9 Sessions

**Date**: 2026-08-17
**Change**: T3.9 Sessions — Refresh-Token Revocation and Rotation
**Archived by**: SDD Archive Phase
**Status**: COMPLETE

---

## Executive Summary

T3.9 Sessions has been fully implemented, verified, and is ready for deployment. The change introduces secure session management with refresh-token rotation, reuse detection, and immediate revocation through a Redis-backed denylist. All 58 tasks are complete, verification passed with 0 CRITICAL and 0 WARNING findings, and test results exceed baselines.

---

## Change Artifacts

All artifacts stored in this archive folder and linked to Engram observation IDs:

| Artifact | Engram ID | Type | Status |
|----------|-----------|------|--------|
| Proposal | #450 | decision | Locked (R2) |
| Specification | #452 | architecture | Locked |
| Design | #453 | architecture | Locked |
| Tasks | #455 | architecture | Locked |
| Verification Report | #458 | architecture | PASS |

---

## Key Achievements

### Full Session Lifecycle Implementation

- **Session creation**: one `user_sessions` row per login, carrying `sid` (session identifier) in both JWT token types
- **Atomic rotation**: single conditional UPDATE statement (`compare-and-swap`) prevents concurrent update races
- **Reuse detection**: single-generation grace window (default 30 seconds, configurable) for benign retries from mobile clients losing responses
- **Immediate revocation**: denylist-backed, immediate session invalidation across both token types (no TTL lag)
- **Cross-user authorization**: D9 scope + rank gating matching T3.2 patterns

### Migration 0016

- **Eight new columns**: `refresh_token_hash`, `previous_refresh_token_hash`, `rotated_at`, `ip_address`, `user_agent`, `revoked_at`, `last_used_at`, `expires_at`
- **Two partial indexes**: active sessions (by user, created_at DESC), revoked sessions (boot-warm query)
- **Legacy-row handling**: pre-0016 sessions marked invalid via `refresh_token_hash IS NULL` and `expires_at = created_at`
- **Catalog & role-matrix**: `sessions` permission resource added; `admin_sistema` and `admin_organizacion` roles granted READ/DELETE

### Redis Architecture

- **SESSION_REDIS_CLIENT**: dedicated Redis client on DB 0 (Streams database), not cache-manager
- **Denylist** (`sess:revoked:{sid}`): per-session revocation flag, warmed at boot, TTL-bound to remaining session lifetime
- **Grace buffer** (`sess:grace:{sid}:{hash}`): stores newly-issued token pair for in-window grace hits, deleted after rotation

### Test Results

| Metric | Baseline | Final | Change | Status |
|--------|----------|-------|--------|--------|
| Unit tests | 505 | 614 | +109 | PASS |
| E2E tests | 104 | 122 | +18 | PASS |
| Build (tsc) | — | 0 errors | — | PASS |
| Lint | — | 0 errors, 16 warnings (pre-existing style) | — | PASS |

**Note**: 3 unit tests intentionally deleted with their subject (fan-out tests from D2 removal); 505 → 502 pre-existing tests carried forward unmodified.

---

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `860f8b1` | Migration | `0016_sessions_revocation.sql` — 8 columns, 2 indexes, catalog, role append |
| `8ea7afe` | Feature | Complete session module (53 files) — rotation, reuse detection, revocation, authorization |

---

## Verification Status

**Result**: **PASS** (0 CRITICAL, 0 WARNING, 3 SUGGESTIONS all deferred)

### Spec Compliance

All 12 scenarios from `spec.md` compliant with passing tests:
1. Login creates session with shared `sid` ✅
2. Refresh rotates; old token dies outside grace ✅
3. In-window replay returns current pair, no rotation ✅
4. Repeated timer replay does not hold window open ✅
5. Token two generations old revokes inside window ✅
6. Reuse outside window revokes whole session ✅
7. Revoking session kills access token immediately ✅
8. Self-revoke with zero permissions ✅
9. Cross-user revoke: 404 invisible, 403 outranked ✅
10. Anonymous login creates no session row ✅
11. Concurrent double-refresh resolves via grace ✅
12. Pre-0016 legacy row invalid ✅

### Design Coherence

- Rotation CAS verbatim match to design §1 (single UPDATE, PK-only index)
- Grace buffer correctly buffers new pair under retiring hash with predecessor DEL in same pipeline
- Denylist on SESSION_REDIS_CLIENT (Streams DB, not cache-manager)
- `enableOfflineQueue:false` + `commandTimeout:50` fail-open on Redis errors
- Per-request check in `JwtStrategy.validate` with `isAnonymous` resolved before `sid`/denylist check
- `perm:v3:` prefix bump confirmed (R4 cache-shape change)
- SessionsModule leaf confirmed (zero forwardRef)
- `SESSION_USER_MISMATCH` rejects without revoking (R6)
- `SESSION_RETRY_UNAVAILABLE` on grace-buffer miss rejects without revoking (R3)
- Migration 0016 and all predicate sites consistently use `revoked_at timestamptz` / `revoked_at IS NULL`

### Deferred Suggestions (non-blocking)

**S1** — Scenario 4 proven via 3 converging tests (unit + pure boundary + e2e) rather than single sequential test. Structure guarantees correctness; consolidation is optional. *Defer*.

**S2** — `SessionsBootWarmService`'s forced `redis.connect()` is a defensive fix but not mentioned in design.md §2/§3.3. *Defer to next design touch*.

**S3** — `SessionsRepository.existsRevoked()` implemented per design but unused in production code. *Defer to future cleanup pass*.

---

## Deployment Notes

### Breaking API Change

`POST /api/auth/refresh` response shape changed: now returns full `AuthTokens` (both `access_token` and `refresh_token`) instead of just `access_token`. **Frontend must be updated**.

### Session Termination at Deploy

All pre-0016 tokens (lacking `sid` claim) are rejected `401 SESSION_REQUIRED` immediately upon deploy. **Client must retry login on 401** with stored `device_uuid` to recover (no credentials needed — free re-auth). **Release notes must document this.**

### Migration Manual Apply

Migration 0016 is written and tested locally but requires **manual apply to Supabase** (per CC3 — SDD brief, line §. Confirm with DBA before production deploy.

---

## Completeness

- [x] All 58 tasks marked `[x]` in tasks.md
- [x] 614 unit tests passing (505 baseline → +109)
- [x] 122 e2e tests passing (104 baseline → +18)
- [x] 12/12 spec scenarios compliant
- [x] Verification report signed off
- [x] Zero CRITICAL or WARNING issues
- [x] 3 deferred suggestions (non-blocking)

---

## Traceability

This archive report ties to the complete SDD cycle:

- **Proposal** (Engram #450): Problem statement, locked decisions D1-D13, risks & mitigations
- **Specification** (Engram #452): 8 requirement groups, 12 scenarios, 16 acceptance criteria
- **Design** (Engram #453): Implementation architecture, pin-points R1-R6, test strategy
- **Tasks** (Engram #455): 58-task breakdown across 9 phases (0-8), Strict TDD
- **Apply-Progress** (Engram #457): RED→GREEN table, task completion tracking
- **Verification Report** (Engram #458): Full compliance matrix, design coherence, verdicts
- **Archive Report** (this file, Engram #ID_TBD): Final closure and deployment readiness

---

## Next Steps

1. **Supabase Migration**: Execute `0016_sessions_revocation.sql` manually (DBA coordination)
2. **Frontend Release Coordination**: Update client to handle new `refresh()` response shape and retry login on `401 SESSION_REQUIRED`
3. **Release Notes**: Document breaking API change and session-termination behaviour
4. **Future Deferred Work**:
   - S1: Consolidate Scenario 4 proof into single e2e test (readability, next design touch)
   - S2: Add one-line addendum to design.md on `SessionsBootWarmService.connect()` call
   - S3: Wire `existsRevoked()` into audit-log point or drop in future cleanup pass
   - 90-day revoked-row cleanup cron (deferred to future, requires scheduler decision)

---

**Signed**: SDD Archive Phase, 2026-08-17
**Status**: READY FOR DEPLOYMENT

---

## Artifact Locations

- **Proposal**: `openspec/changes/archive/2026-08-17-t3.9-sessions/proposal.md`
- **Specification**: `openspec/changes/archive/2026-08-17-t3.9-sessions/specs/session-lifecycle/spec.md`
- **Design**: `openspec/changes/archive/2026-08-17-t3.9-sessions/design.md`
- **Tasks**: `openspec/changes/archive/2026-08-17-t3.9-sessions/tasks.md`
- **Verification**: `openspec/changes/archive/2026-08-17-t3.9-sessions/verify-report.md`
- **Archive Report**: `openspec/changes/archive/2026-08-17-t3.9-sessions/archive-report.md`
