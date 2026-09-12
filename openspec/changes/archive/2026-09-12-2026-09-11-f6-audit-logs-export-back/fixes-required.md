# Fixes Required — F6 Audit Logs API (Backend)

**Change**: `2026-09-11-f6-audit-logs-export` (backend)
**Reported by**: sdd-verify
**Date**: 2026-09-11
**Blocking verdict**: PASS WITH WARNINGS — CRITICAL-1 requires a spec decision, not necessarily a code change

---

## FIX-1 (CRITICAL) — Spec/implementation conflict: `limit=200` behavior

**Spec says** (R1-S3): "a request for `limit=200` returns at most 100 items"
**Implementation does**: Returns HTTP 400 (ValidationPipe rejects via `@Max(100)`)
**E2e stub asserts**: `.expect(400)` — confirms implementation behavior, not spec behavior

**Required action**: Choose one of:

**Option A — Update the spec** (recommended): Change R1-S3 to read:
> AND `limit` is capped at 100; a request for `limit=200` returns 400 (invalid input)

This aligns spec with the current implementation and is arguably better UX (fail-fast on invalid input).

**Option B — Update the implementation**: Replace `@Max(100)` with a `@Transform(() => Math.min(value, 100))` so the service silently caps. The DTO then accepts any limit and clips it to 100. Update the e2e stub to `.expect(200)` and verify body has ≤ 100 items.

The code change is in `backend/src/modules/audit/dto/audit-log-filter.dto.ts:63`.

---

## FIX-2 (WARNING) — Run e2e suite before merge

**File**: `backend/test/e2e/audit-logs-export.e2e-spec.ts`

The e2e stub is well-structured but has never been run against a real stack. Run:
```bash
npm run test:e2e
```
against the docker TestEnvironment. All 5 stub scenarios should pass without modification.

---

## FIX-3 (SUGGESTION) — Flesh out R3-S3 e2e cap test

**File**: `backend/test/e2e/audit-logs-export.e2e-spec.ts:79-90`

The stub asserts HTTP 200 but does not seed 10k+ rows. Add:
```typescript
// Seed 10001 audit_events via env.pg:
for (let i = 0; i < 10001; i++) {
  await env.pg.query(`INSERT INTO audit_events (...) VALUES (...)`);
}
const res = await request(env.httpServer)
  .get('/api/audit-logs/export.csv')
  .set('Authorization', `Bearer ${master.accessToken}`)
  .expect(200);
const lines = res.text.split('\n').filter(Boolean);
expect(lines.length).toBe(10001); // 1 header + 10000 rows
```
