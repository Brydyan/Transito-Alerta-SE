# Verification Report (PASS 2 — re-verification)

**Change**: `2026-08-29-f2-catalogs-crud` (F2 — Catálogos: Ubicaciones, Categorías, Organizaciones)
**Branch**: `brydyan/sc-304/f2-catalogos-ubicaciones-arbol-categorias`
**Mode**: Standard (frontend Angular; `strict_tdd: true` is active for the project per `sdd-init/transito-alerta-se`, but this branch predates strict-mode adoption — verified via real execution + adversarial static/behavioral cross-reference, consistent with Pass 1)
**Verified**: 2026-09-05 23:44 UTC, second pass, against real execution from `frontend/`
**Supersedes**: Pass 1 (same date, earlier). Pass 1 verdict was **PASS WITH WARNINGS**, 0 CRITICAL / 4 WARNING / 3 SUGGESTION. This report is a full re-verification after F2.5.7 (organizations zone_id/parent_id) was implemented and the scope reassignment (Engram #669) was applied to `tasks.md`.

---

## What changed since Pass 1

1. **F2.5.7 implemented** — organizations no longer drop `zone_id`/`parent_id`.
2. **Scope reassignment** — 3 items moved out of F2's `tasks.md` to their owning changes (`[→]` markers): placeholder polygon → `back/2026-09-05-geo-zones-catalog-contract`; missing `lint` script/no-op `tsc --noEmit` → `front/2026-09-03-tool-ci-gates`; hardcoded e2e password → `front/2026-09-03-e2e-test-user-and-credentials`.
3. Nothing else in the codebase changed (guard, geo-zone pagination, `updated_at` removal — all Pass-1 fixes — are untouched).

---

## Disposition of Pass 1's four WARNINGs

| # | Pass 1 WARNING | Status now | Evidence |
|---|---|---|---|
| 1 | `ICreateOrganizationDto` only sends `name`; `zone_id`/`parent_id` silently dropped despite mock 08-01 needing them | ✅ **CLOSED** | F2.5.7. See full adversarial trace below — closed correctly, no regressions, no new critical defect introduced by the fix. |
| 2 | `spec.md`/`design.md` still describe a nonexistent `pais` level | ⚠️ **STILL OPEN**, now formally tracked as `F2.5.8` (was an unowned drift in Pass 1; now has a task id and is explicitly acknowledged in `tasks.md`) | `spec.md`/`design.md` unedited; `tasks.md` §F2.5.8 `[ ]` |
| 3 | English UI copy on Ubicaciones/Organizaciones | ⚠️ **STILL OPEN**, tracked as `F2.5.6` | Confirmed still present in both templates (see below) |
| 4 | `location-form.component.spec.ts` missing | ⚠️ **STILL OPEN**, tracked as `F2.5.5` | File confirmed absent |

**No new CRITICAL or WARNING was introduced by this batch of work.** One new SUGGESTION was found (backend DTO type hygiene, out of F2's file scope — see below).

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (F2.0–F2.4) | 24, all `[x]` except F2.4.4 `[~]` (unchanged from Pass 1, accurately downgraded) |
| F2.5 post-review tasks | 7 total: F2.5.1–4 done, **F2.5.7 now done** (new), F2.5.5/F2.5.6/F2.5.8 open `[ ]` |
| F2.5.9–11 (reassigned) | Marked `[→]`, each pointing at a real, verified-owning change (see Scope Reassignment Audit) |

---

### Build & Tests Execution (real execution, this session)

**Tests** (`npm test`, Jest): ✅ **303 passed / 303 total, 47/47 suites**
```
Test Suites: 47 passed, 47 total
Tests:       303 passed, 303 total
Time:        4.547 s
```
Matches the reported figure exactly (up from 285/47 in Pass 1 — the delta of 18 tests corresponds to the new F2.5.7 coverage: 3 service tests for `zone_id`/`parent_id`, 1 for `formData()`, 3 for `listAll()` pagination, plus organization-list/-form component tests for the zone column, summary cards, and the parent/zone selectors).

**Build** (`npm run build`, production): ✅ Passed
```
Application bundle generation complete. [4.232 seconds]
Output location: frontend/dist
organization-list-component, organization-form-component, location-list-component,
location-form-component all present as lazy chunks.
```

**Coverage**: Not configured/run → ➖ Not available (unchanged from Pass 1).

---

## Adversarial Review — F2.5.7 (Organizations zone_id/parent_id)

### 1. `geo_zones` (snake_case) as the wire shape of `GET /organizations/form-data` — ✅ Confirmed genuine, not a repeat of the `updated_at` bug

Traced `SnakeCaseResponseInterceptor` (`backend/src/common/interceptors/snake-case-response.interceptor.ts`) → `toSnakeCaseKeys` (`backend/src/common/utils/snake-case.ts`). Read the implementation directly:

```ts
export function toSnakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toSnakeCaseKeys);
  }
  if (value === null || typeof value !== 'object' || isValueObject(value)) {
    return value;
  }
  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, val]) => {
    acc[toSnakeCase(key)] = toSnakeCaseKeys(val);
    return acc;
  }, {});
}
```

This **does** recurse into arrays (`value.map(toSnakeCaseKeys)`) and into nested object values (`toSnakeCaseKeys(val)` inside the reduce). `OrganizationsService.formData()` returns `{ roles, geoZones: [...] }` — the interceptor rewrites the top-level key `geoZones` → `geo_zones`. Confirmed correct at both the top level and (irrelevantly here, since `id`/`name` are already lowercase, but structurally proven) at nested levels. **This is not the `updated_at` class of bug** — that bug was a field the wire never sent at all; this is a field the wire does send, just under a different casing, and the interceptor is proven to rewrite it. `organization.service.spec.ts` has a matching test (`'lee geo_zones en snake_case, como las emite el interceptor'`) which passes.

### 2. `OrganizationService.listAll()` boundary behavior — ✅ Identical to the geo-zones fix, including the stale-`total` guard

Read `organization.service.ts` side-by-side with `geo-zone.service.ts`: both use `expand`/`reduce` with the exact same `fetched = (index + 1) * MAX_PAGE_SIZE` / `result.items.length > 0 && fetched < result.total` guard. `organization.service.spec.ts` has three dedicated `listAll` tests, all passing:
- single page when catalog fits (11 items, 1 call)
- pages through the full catalog (130 items across 2 calls, verifies `items[129].id === '130'`)
- **stops on an empty page even when `total` disagrees** (100 items returned, second page empty, `total: 9999` — stops at 100, 2 calls) — this is the exact stale-`total` infinite-loop guard, unit-tested and passing.

### 3. Summary cards computed over the full catalog, "cities reached" as distinct zones — ✅ Confirmed

`organization-list.component.ts`: `totalCount`, `citiesReached`, `monthCount` are all `computed()` over `allOrganizations` (populated exclusively by `listAll()`), **not** over the paged `organizations()` signal (which only backs the visible table rows). `citiesReached` builds a `Set<string>` from `organization.zone_id` and only adds when `zone_id` is truthy — organizations with a `null` zone correctly do not inflate the distinct-zone count. All three have dedicated, passing tests (`'cuenta ciudades alcanzadas como zonas distintas, no como filas'`, `'cuenta el total sobre el catálogo entero, no sobre la página'`, `'cuenta sólo las altas del mes en curso'`).

### 4. Form sends `null` (not `''`, not `undefined`) for an unselected zone/parent, on BOTH create and update — ✅ Confirmed, and the backend accepts it (this is the check the task flagged as a possible CRITICAL — it is not)

`organization-form.component.ts`: `onSubmit()` computes `zone_id`/`parent_id` via a shared `nullIfEmpty()` helper on **both** the `create` and `update` branches — never conditionally omitted, never left as `''`. This is correct and symmetric.

The flagged risk was: `CreateOrganizationDto.zone_id` is typed `string | undefined` (no `| null`) while `UpdateOrganizationDto.zone_id` is `string | null | undefined` — so does the backend 422 an explicit `null` on **create**? Traced this to ground truth in `backend/node_modules/class-validator`:

- `@IsOptional()`'s actual runtime behavior (`IsOptional.js`): its conditional-validation constraint is `value !== null && value !== undefined` — i.e. it treats `null` **exactly the same as** `undefined`: both skip all subsequent validators for that property.
- `ValidationExecutor.performValidations()`: `const canValidate = this.conditionalValidations(...); if (!canValidate) { return; }` — confirms that when `@IsOptional()`'s condition is false (value is `null` or `undefined`), **no further validator runs**, including `@IsUUID('4')`. So `zone_id: null` on `POST /organizations` passes validation despite the DTO's TS type saying `string | undefined` — the TS type is stricter than the actual runtime contract, but not enforced against it.
- `OrganizationsService.create()`: `zoneId: dto.zone_id ?? null` — normalizes both `undefined` and `null` to `null` identically. Same for `parentId`.

**Conclusion: create does NOT reject an explicit `null` for `zone_id`/`parent_id`.** The TS type mismatch between `CreateOrganizationDto` and `UpdateOrganizationDto` is real but does not manifest as a runtime defect — it is a minor type-hygiene gap in a **backend** file, out of F2's (frontend) scope to fix. Recorded as a SUGGESTION for the backend, not a WARNING against F2.

### 5. `parent_id` on create vs. the backend's cycle validation — ✅ Safe, trivially

`OrganizationsService.create()` does not call the cycle-check (`assertNoCycle`) at all — only `update()` does. This is correct: a brand-new organization's own id cannot yet exist as anyone's ancestor, so a cycle through itself is structurally impossible on create. Cycle validation is correctly scoped to `update()` only (per the `T7.5.B3` comment in the source), where an existing org could be re-parented into a cycle.

### 6. "Localización" column degradation — ✅ Confirmed, both failure modes covered

`zoneName(zoneId)`: returns `'—'` if `zoneId` is `null`/falsy, and `this.zoneNames().get(zoneId) ?? '—'` otherwise — so an unmatched `zone_id` (zone deleted, or `formData()` failed and `zoneNames` was reset to an empty `Map` in the `error:` callback) both degrade to `'—'` rather than throwing or showing `undefined`. Two dedicated passing tests confirm both paths (`'muestra un guion cuando la organización no tiene zona'`, `'muestra un guion cuando la zona no está en form-data'`).

### 7. Regression check — the three Pass-1 fixes are still intact

- Tree pagination (`geo-zone.service.ts`) — untouched, `expand`/`reduce` + stale-`total` guard still present, still tested.
- `updated_at` removal (`IGeoZone`, `IOrganization`) — still absent from both interfaces; `IOrganization`'s doc-comment explicitly explains why. No regression.
- `permissionGuard` hydration race (`permission.guard.ts`) — untouched, fast path + `toObservable`/`filter`/`take(1)` wait path + failure-redirects-to-login path all still present and still covered by the 5+ test cases from Pass 1.

`MapPin` icon registration in `app.config.ts` — confirmed present in the curated `LUCIDE_ICONS` pick-list (both the import and the object key), which is the correct place; `ui-icon` would otherwise silently fall back to `circle-dot` for an unregistered name.

---

## Scope Reassignment Audit (Engram #669)

Verified each reassignment claim by reading the **owning** change's `tasks.md` directly, not just F2's claim about it:

| Item | F2's claim | Verified against owning `tasks.md` |
|---|---|---|
| Missing `lint` script + no-op `tsc --noEmit` | Already owned by `front/2026-09-03-tool-ci-gates` §B.1/§A | ✅ Confirmed — `tool-ci-gates/tasks.md` §A (typecheck, `-b` vs `-p`) and §B.1 (`Script lint en frontend/package.json`) both exist and predate this reassignment; no duplicate task was needed. Also confirmed **no `lint` script exists yet** in `frontend/package.json` (only `ng, start, build, watch, test, test:e2e`) — F2 correctly did not fabricate one. |
| Hardcoded e2e password | Owned by `front/2026-09-03-e2e-test-user-and-credentials`, new §B.9 added | ✅ Confirmed — `e2e-test-user-and-credentials/tasks.md` §B.9 exists, names both `catalogs-crud.e2e.ts` and `catalogs-permissions.e2e.ts` explicitly, and flags the write-vs-no-write-permission user distinction between the two specs. §D.1 also corrected to no longer cite a stale "6 tests" figure. Confirmed the literal itself: both files still contain `const PASSWORD = 'ChangeMe!Demo2026';` — genuinely unfixed, genuinely handed off, not silently dropped. |
| Placeholder polygon | Owned by `back/2026-09-05-geo-zones-catalog-contract` | ✅ Confirmed — that proposal's "Hallazgo 2" documents the exact same 1°×1° Quito placeholder and `ST_Contains(...) LIMIT 1` (no `ORDER BY`) determinism problem, with two concrete remediation options. Real backend change, not a stub. |
| Catalogs e2e run in CI, not just locally | `.github/workflows/ci.yml:456` passes `BASE_URL: ${{ vars.STAGING_BASE_URL }}` | ✅ Confirmed at that exact location — the local `test.skip(!process.env['BASE_URL'])` is the documented D4 pattern of the e2e-credentials phase, not an F2 defect. |

Also confirmed: no other phase (`F3`–`F6`) mentions `zone_id` or `organizations` in its `tasks.md` — F2.5.7 was genuinely nobody else's responsibility, and no phase was left holding orphaned work as a result of this reassignment.

**Verdict on reassignment**: accurate and complete. F2 is not dumping its own work on other phases — each handed-off item was independently confirmed to already exist (or be freshly added) in the receiving phase's own task list.

---

### Correctness — Static Structural Evidence (unchanged findings, re-confirmed)

| Requirement (spec.md) | Status | Notes |
|---|---|---|
| Listado con búsqueda, filtro y paginación | ✅ Implemented | Unchanged from Pass 1 |
| Árbol jerárquico de Ubicaciones | ✅ Implemented | Unchanged from Pass 1 |
| Alta y edición | ✅ Implemented | Organizations form now also handles zone/parent selection with correct null semantics |
| Borrado confirmado | ✅ Implemented | Unchanged from Pass 1 |
| La UI respeta permisos de escritura | ✅ Implemented | Unchanged from Pass 1 |
| Organizaciones expone `zone_id`/columna Localización/tarjetas del mock 08-01 | ✅ **Now implemented** (was the Pass-1 WARNING #1) | See adversarial section above |
| **Filtro por nivel** (spec scenario still lists `País\|Provincia\|Cantón\|Parroquia`) | ⚠️ Still stale | Now tracked as `F2.5.8`, unresolved |

---

### Issues Found

**CRITICAL** (must fix before archive): **None.**

**WARNING** (should fix, tracked in `tasks.md` §F2.5, does not block archive):
1. **`spec.md`/`design.md` still describe a nonexistent `pais` level** (`F2.5.8`, open). Real wire is `provincia|canton|parroquia|zona`.
2. **UI copy remains in English** on Ubicaciones and Organizaciones (`F2.5.6`, open). Only Categorías headers were translated.
3. **`location-form.component.spec.ts` does not exist** (`F2.5.5`, open). Parent-level scoping, required-parent-per-level, and 422 mapping have no direct unit coverage — only the (CI-only) e2e suite touches it.

(Pass 1's WARNING #1 — organizations dropping `zone_id`/`parent_id` — is now CLOSED; see disposition table above.)

**SUGGESTION** (nice to have, not blocking):
1. Consider switching both `GeoZoneService.listAll()` and `OrganizationService.listAll()` to their respective backend `/tree`-style unpaginated endpoints where available — simplification, not a correctness fix (unchanged from Pass 1).
2. `has-permission.directive.ts` cosmetic hydration flicker (unchanged from Pass 1).
3. Back-port `apply-progress.md`'s file-path corrections into `design.md` — now formally tracked as `F2.5.8` (was an untracked suggestion in Pass 1).
4. **New**: `CreateOrganizationDto.zone_id`/`parent_id` (backend, `create-organization.dto.ts`) are typed `string | undefined`, while `UpdateOrganizationDto`'s equivalents are `string | null | undefined`. At runtime both accept `null` identically (verified against `class-validator`'s `@IsOptional()` source and `OrganizationsService.create()`'s `?? null` normalization), so this is not a behavioral defect — but the type signature doesn't reflect what the endpoint actually accepts, which could mislead a future reader who trusts the TS type over the runtime behavior. Out of F2's scope (backend file); flagging for whoever owns `organizations` backend hygiene next.

---

### Verdict

**PASS WITH WARNINGS** (improved from Pass 1: 3 WARNING, down from 4; 0 CRITICAL, unchanged; 4 SUGGESTION, up from 3 — one new, non-blocking, backend-only observation).

The F2.5.7 fix (organizations `zone_id`/`parent_id`) is genuinely closed: traced end-to-end from the `SnakeCaseResponseInterceptor`'s actual recursive implementation, through the backend's `@IsOptional()` null-handling semantics (verified against `class-validator` source, not assumed), through the cycle-safety argument for create, to the frontend's null-normalization and summary-card computation over the full catalog — all backed by passing, purpose-built tests, with no shortcuts taken. The scope reassignment (Engram #669) was independently verified against each receiving change's own `tasks.md` and holds up — nothing was dumped on a phase that didn't already claim it. The three remaining WARNINGs (stale `pais`-level docs, English UI copy, missing `location-form` spec) are exactly what `tasks.md` §F2.5 already discloses, with no new gaps found. Build (`npm run build`) and full test suite (`npm test`: 303/303, 47/47 suites) both pass on real execution performed in this session. Recommended: proceed to archive; the three open WARNINGs are legitimate follow-up work, not archive blockers.
