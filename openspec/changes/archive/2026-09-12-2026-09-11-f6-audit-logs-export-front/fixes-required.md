# Fixes Required — F6 Audit Logs UI (Frontend) — Round 2

**Change**: `2026-09-11-f6-audit-logs-export` (frontend)
**Reported by**: sdd-verify (round 2)
**Date**: 2026-09-12
**Blocking verdict**: PASS WITH WARNINGS — 1 typecheck fix required before closing PR

---

## FIX-1 (WARNING) — TS4111: dot notation on index signature in service spec

**File**: `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts`
**Lines**: 96–97

TypeScript's `noPropertyAccessFromIndexSignature` rule (active in this tsconfig) requires
bracket notation when reading from a `Record<string, unknown>` cast. The regression test
introduced by Minimax's FIX-1 uses dot notation, causing `tsc -b --noEmit` to fail with:

```
error TS4111: Property 'actorName' comes from an index signature, so it must be accessed with ['actorName'].
error TS4111: Property 'createdAt' comes from an index signature, so it must be accessed with ['createdAt'].
```

**Fix** (two characters each):

```typescript
// BEFORE (lines 96-97):
expect((res.items[0] as unknown as Record<string, unknown>).actorName).toBeUndefined();
expect((res.items[0] as unknown as Record<string, unknown>).createdAt).toBeUndefined();

// AFTER:
expect((res.items[0] as unknown as Record<string, unknown>)['actorName']).toBeUndefined();
expect((res.items[0] as unknown as Record<string, unknown>)['createdAt']).toBeUndefined();
```

Test behavior is identical — Jest runs transpiled JS and does not enforce TS4111. This
is a compile-time-only fix.

**Verify**: `cd frontend && pnpm exec tsc -b --noEmit` must exit 0 after the change.

---

All other Round 1 issues are resolved. No backend fixes required for round 2.
