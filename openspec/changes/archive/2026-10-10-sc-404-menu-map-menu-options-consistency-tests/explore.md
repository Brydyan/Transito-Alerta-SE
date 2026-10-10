# SDD Explore — `2026-10-05-sc-404-menu-map-menu-options-consistency-tests`

## Verified Facts (with `file:line` evidence)

### 1. MENU_MAP — 12 declared routes
`backend/src/modules/menus/menu-map.ts:48-141` — `Record<string, MenuDefinition>` with 12 entries:

| Key | Route | Requires | Group | Order |
|-----|-------|----------|-------|-------|
| Dashboard | `/dashboard` | READ dashboard | — | 10 |
| Inicio | `/inicio` | READ incidents | INCIDENCIAS | 20 |
| Lista de Incidencias | `/incidencias` | READ incidents | INCIDENCIAS | 30 |
| Mapa | `/mapa` | READ incidents | INCIDENCIAS | 40 |
| Reportar | `/reportar` | CREATE incidents | INCIDENCIAS | 50 |
| Usuarios | `/admin/users` | READ users | GESTIÓN | 60 |
| Roles | `/admin/roles` | READ roles | GESTIÓN | 70 |
| Organizaciones | `/admin/organizaciones` | READ organizations | GESTIÓN | 80 |
| Departamentos | `/admin/departamentos` | READ departments | GESTIÓN | 82 |
| Auditoría de Acceso | `/admin/audit-logs` | READ audit-logs | GESTIÓN | 85 |
| Categorías | `/categorias` | READ incident-categories | CATÁLOGOS | 90 |
| Ubicaciones | `/ubicaciones` | READ geo-zones | CATÁLOGOS | 100 |

### 2. `menus.service.ts` — data-driven resolver, MENU_MAP only for route→permission lookup
- `menus.service.ts:42-45` — `ROUTE_TO_PERMISSION` Map built from `MENU_MAP` values (single source of truth for guard permissions).
- `menus.service.ts:72-119` — `getMenuForUser` reads `menu_options` + `menu_option_roles` (not `MENU_MAP`).
- `menus.service.ts:99-104` — Secondary permission filter **disabled** (HOTFIX comment); `menu_option_roles` matrix is the only gate.
- `menus.service.ts:107-110` — `buildTree` filters BEFORE building; orphan children (parent not in accessible set) are dropped.

### 3. Migrations that seed `menu_options` (4 files with INSERT)
| Migration | Pattern | Routes seeded |
|-----------|---------|---------------|
| `0055_dynamic_menus_data_migration.sql:36-74` | `INSERT ... VALUES` with literal UUIDs + `ON CONFLICT DO NOTHING` | 10 leaf routes + 3 group parents (Dashboard, Inicio, Lista, Mapa, Reportar, Usuarios, Roles, Organizaciones, Categorías, Ubicaciones) |
| `0060_crud_submenu_entries.sql:31-83` | `INSERT ... VALUES` with `gen_random_uuid()` for children | Departamentos parent (`/admin/departamentos`) + 12 CRUD children (`/admin/users/new`, `/admin/users`, `/admin/roles/new`, `/admin/roles`, `/admin/organizaciones/new`, `/admin/organizaciones`, `/admin/departamentos/new`, `/admin/departamentos`, `/admin/ubicaciones/new`, `/admin/ubicaciones`, `/admin/categorias/new`, `/admin/categorias`) |
| `0064_audit_logs_menu.sql:60-67` | `INSERT ... SELECT ... WHERE NOT EXISTS` (idempotent, `gen_random_uuid()` default) | `/admin/audit-logs` |
| `0057_dynamic_menus_controles.sql:21-24` | `INSERT ... VALUES` with literal UUID + `ON CONFLICT DO NOTHING` | `/controles` (later rewritten to `/admin/controles` by `0058`) |

### 4. Migrations that UPDATE routes (effective route set ≠ union of INSERT routes)
| Migration | Change |
|-----------|--------|
| `0064_fix_organizaciones_departamentos_routes.sql:19-27` | `UPDATE menu_options SET route = '/admin/organizaciones' WHERE id = 'b0000000-...-008' AND route = '/organizaciones'`; same for Departamentos (`b0000000-...-012`) |
| `0058_fix_controles_route.sql:11-14` | `UPDATE menu_options SET route = '/admin/controles' WHERE id = 'b0000000-...-011' AND route = '/controles'` |

**Conclusion for Invariant 1 (Coverage):** A static scanner must process migrations in lexicographic order and apply UPDATEs to know the final effective route set. A naive "grep for route in INSERT" misses 0064 (INSERT...SELECT with WHERE) and 0064_fix/0058_fix (UPDATEs).

### 5. `menu_option_roles` grants — 5 migration files
| Migration | Pattern | Notes |
|-----------|---------|-------|
| `0055:108-198` | `INSERT ... SELECT` from `roles` table by name | Literal UUIDs for `menu_option_id` (from 0055 seed) |
| `0061:28-56` | `INSERT ... SELECT` with triple JOIN (parent → child by `parent_id` + name filter) | Copies parent matrix to 12 CRUD children; `gen_random_uuid()` in 0060 means child IDs unknown statically |
| `0063:37-75` | `INSERT ... SELECT` with `ON CONFLICT DO UPDATE` | Fixes GESTIÓN root + Departamentos matrix; also inherits to CRUD children via JOIN |
| `0064:70-79` | `INSERT ... SELECT` from `menu_options` (by route) × `roles` (by name) | Master-only for audit-logs; `ON CONFLICT DO UPDATE` |
| `0057:35-48` | `INSERT ... SELECT` from `roles` by name | Master (RW) + operador_sistema (R) for Controles |

### 6. Route uniqueness — **NOT unique** in `menu_options`
- `menu-option.entity.ts:23-24` — `route` is `varchar NOT NULL` but no UNIQUE constraint.
- `0060:42-43` — "Editar usuario" has route `/admin/users` (same as "Usuarios" parent).
- Same for Roles, Organizaciones, Departamentos, Ubicaciones, Categorías — 6 duplicate routes.

### 7. Zombie routes (seeded in `menu_options`, absent from `MENU_MAP`)
| Route | Source | Legitimacy |
|-------|--------|------------|
| `/admin/controles` | `0057` + `0058` fix | Intentional admin menu (CRUD for menu-options) |
| `/admin/users/new` | `0060` | CRUD child — intentional |
| `/admin/roles/new` | `0060` | CRUD child — intentional |
| `/admin/organizaciones/new` | `0060` | CRUD child — intentional |
| `/admin/departamentos/new` | `0060` | CRUD child — intentional |
| `/admin/ubicaciones/new` | `0060` | CRUD child — intentional |
| `/admin/categorias/new` | `0060` | CRUD child — intentional |
| `/admin/users` (Editar) | `0060` | Reuses parent route — **in MENU_MAP** |
| `/admin/roles` (Editar) | `0060` | Reuses parent route — **in MENU_MAP** |
| `/admin/organizaciones` (Editar) | `0060` | Reuses parent route — **in MENU_MAP** |
| `/admin/departamentos` (Editar) | `0060` | Reuses parent route — **in MENU_MAP** |
| `/admin/ubicaciones` (Editar) | `0060` | Reuses parent route — **NOT in MENU_MAP** (MENU_MAP has `/ubicaciones`) |
| `/admin/categorias` (Editar) | `0060` | Reuses parent route — **NOT in MENU_MAP** (MENU_MAP has `/categorias`) |

**Total zombie candidates: ~9 distinct routes** that are legitimate, intentional data-driven menus. Invariant 2 as literally written ("every seeded route exists in MENU_MAP → WARNING") would emit noise on every CI run.

### 8. Orphan-parent problem (Invariant 3) — documented in `0063`
- `menus.service.ts:107-110` — `buildTree` filters accessible options FIRST, then builds tree; children whose parent is not in the filtered set are excluded (lines 196-201).
- `0063:8-15` — GESTIÓN root had only master/operador_sistema; admin_org had grants on children (Organizaciones, Departamentos) but not on root → entire GESTIÓN section invisible for admin_org.
- Static analysis of the role matrix is hard:
  - `0060` uses `gen_random_uuid()` for child IDs → cannot know child UUIDs to link grants.
  - `0061` and `0063` use `INSERT ... SELECT` with JOINs over `menu_options` — a static parser would need to simulate relational state.

### 9. Test infrastructure precedent
- `backend/package.json:94-114` — Jest config: `rootDir: "src"`, `roots: ["<rootDir>", "<rootDir>/../test/unit"]`, `transform: "ts-jest"`. Unit tests run without DB (mocks).
- `api-endpoint-divergence.spec.ts:28-35` — Reads `../../../database/migrations/0054_dynamic_menus_schema.sql` via `fs.readFileSync(path.resolve(...))` at test runtime. Proves static file I/O outside `backend/` works in unit jest.
- `menu-map.spec.ts:68-81` — Reads `frontend/src/app/app.routes.ts` same way.

### 10. `/admin/departamentos` first seeding
- **First seeded in `0060_crud_submenu_entries.sql:31-35`** (not in 0055). Comment at line 30: "This was added to MENU_MAP after the initial migration but never seeded as a menu_option." This is the 0060 incident.
- `0064_fix_organizaciones_departamentos_routes.sql:24-27` later updates its route from `/departamentos` to `/admin/departamentos` (but 0060 already seeded it with `/admin/departamentos` at line 34 — the UPDATE targets a different row or is defensive).

---

## Implementation Options with Tradeoffs

### Option A: Single ordered "SQL state harness" (in-memory simulation)
**What:** A TypeScript harness that loads all `database/migrations/*.sql` in lexicographic order, parses INSERT/UPDATE/DELETE for `menu_options` and `menu_option_roles`, maintains in-memory tables, and computes the final effective state. Serves all three invariants.

| Invariant | Can detect | Cannot detect / Breaks when |
|-----------|------------|------------------------------|
| 1 Coverage | All INSERT VALUES, INSERT SELECT (if route in WHERE), UPDATE | New `INSERT ... SELECT` forms where route is computed; `gen_random_uuid()` in child IDs (irrelevant for route coverage) |
| 2 Zombies | All seeded routes vs MENU_MAP | Same as above; noise from legitimate zombies (see Open Decisions) |
| 3 Orphan parents | Full role matrix simulation (parent→child linkage via known UUIDs from 0055, 0057, 0064; but **not** 0060 children with `gen_random_uuid()`) | Any migration that parents rows by name instead of UUID; new `gen_random_uuid()` children; complex JOINs in 0061/0063 that the harness doesn't emulate |

**Effort:** High (needs a mini SQL parser or at least robust regex for INSERT/UPDATE patterns). **Maintenance burden:** Every new migration pattern (CTE, subquery, function call in route) risks silent gaps.

### Option B: Per-invariant purpose-built static scanners
**What:** Three independent scanners, each tailored to its invariant.

| Invariant | Scanner approach | Tradeoffs |
|-----------|------------------|-----------|
| 1 Coverage | Regex for `INSERT INTO menu_options.*VALUES` + `INSERT ... SELECT ... WHERE route =` + `UPDATE menu_options SET route =` | Simpler than full harness; must handle 0064's `INSERT...SELECT` and UPDATEs explicitly. Misses dynamic route computation. |
| 2 Zombies | Extract all literal route strings from INSERT/UPDATE migrations (after applying UPDATEs in order) → compare to MENU_MAP routes | Same UPDATE/INSERT SELECT handling needed. **Noise problem unsolved** — still emits ~9 warnings. |
| 3 Orphan parents | **Not feasible statically** without full harness (see above). Would need DB-backed test. | If Invariant 3 requires DB, Option B splits the implementation (2 static + 1 DB). |

**Effort:** Medium per scanner. **Maintenance:** Lower per scanner, but three code paths to maintain.

### Option C: DB-backed test (throwaway Postgres via testcontainers)
**What:** Spin up a temporary Postgres (testcontainers), apply all 70 migrations in order, then query the final `menu_options` and `menu_option_roles` state.

| Invariant | Can detect | Cannot detect / Breaks when |
|-----------|------------|------------------------------|
| 1 Coverage | **Everything** — final DB state is ground truth | Requires testcontainers (docker), adds ~3-5s startup. CI must have docker. |
| 2 Zombies | **Everything** — same ground truth | Same docker requirement. Noise problem remains. |
| 3 Orphan parents | **Everything** — can run the exact `buildTree` logic or query the matrix | Same docker requirement. |

**Effort:** Low for test logic (just SQL queries), high for infra (testcontainers in CI). **Violates acceptance criteria:** "Tests 1 and 2 run in CI without Postgres, without Docker, and without fixtures."

---

## Open Decisions Requiring Human Input

### 1. Zombie-warning noise (~9 legitimate warnings)
**Options:**
- **Allowlist** — Maintain a `zombie-allowlist.json` with known legitimate routes (Controles, CRUD children). Warning only for routes not in allowlist. Catches junk like `"prueba2 nuevo"` (order 51) and `"ZZ Prueba Raiz"` (order 99).
- **Grow MENU_MAP** — Add CRUD submenu entries to `MENU_MAP` (as children with `requires` permissions). Makes Invariant 2 pass cleanly but expands `MENU_MAP` scope (currently only top-level sidebar entries).
- **Narrow Invariant 2** — Only warn for seeded rows that have **no `menu_option_roles` grant at all** (i.e., `can_read=false` for all roles). This catches junk rows but not legitimate CRUD children (they inherit grants via 0061/0063).

**Recommendation:** Narrow Invariant 2 to "seeded route with zero role grants → WARNING". This catches actual drift/junk without allowlist maintenance. Legitimate CRUD children have grants (via 0061/0063).

### 2. Coverage scanning scope (Invariant 1)
**Options:**
- **Scan INSERT VALUES + INSERT SELECT (route in WHERE) + UPDATE** — Covers all 4 seeding migrations + 2 fix migrations. Misses hypothetical future `INSERT ... SELECT` where route is computed.
- **Scan only INSERT VALUES** — Simpler, but misses 0064 (INSERT SELECT) and 0064_fix/0058_fix (UPDATE) → would false-alarm on `/admin/audit-logs`, `/admin/organizaciones`, `/admin/departamentos`, `/admin/controles`.

**Recommendation:** Must handle UPDATE and the 0064 INSERT...SELECT pattern. The 0064 pattern is idempotent guard (`WHERE NOT EXISTS ... route = '...'`) — the route literal appears in the WHERE clause. A regex capturing `route\s*=\s*'([^']+)'` in INSERT...SELECT WHERE plus UPDATE SET route catches it.

### 3. Invariant 3 — static harness or DB-backed?
**Options:**
- **Static harness (Option A)** — No docker, fast, but incomplete for `gen_random_uuid()` children and complex JOINs. Could approximate: treat 0060 children as "granted if parent granted" by name-matching (since 0061/0063 do exactly that by name).
- **DB-backed (Option C)** — Complete, but needs docker in CI. Violates "no Postgres, no Docker" for Tests 1&2, but Invariant 3 could be the one DB-backed test.

**Recommendation:** Ship Invariant 3 as a **DB-backed test in this change** (separate test file, run only when docker available or marked `@integration`). Document that Tests 1&2 are static (no docker), Test 3 is integration. This keeps the chore scope honest.

### 4. Regression test for 0064 pattern
**Requirement:** "A regression test that reintroduces the 0064 pattern (route in MENU_MAP with no migration seeding it) fails the build."
**Implementation:** Invariant 1 test itself is this regression test. If someone adds a route to `MENU_MAP` but forgets a migration, Invariant 1 fails. No separate test needed.

---

## Recommended Scope Boundary for This Change

### IN SCOPE (this chore)
1. **Invariant 1 test (static, no DB):** `menu-map-coverage.spec.ts` — scans migrations in order, applies UPDATEs, extracts final effective routes, asserts every `MENU_MAP` route present. Fails build on missing.
2. **Invariant 2 test (static, no DB):** `menu-zombies.spec.ts` — same final route set, warns (console.warn, not throw) for seeded routes with **zero role grants** that are not in `MENU_MAP`. Does not fail build.
3. **Invariant 3 test (DB-backed, optional docker):** `menu-orphan-parents.spec.ts` — uses testcontainers (or skips if no docker), applies migrations, verifies every `menu_options` row with `parent_id` has at least one role with `can_read` on its parent. Fails build on orphans.
4. **CI integration:** Add to `backend/package.json` test scripts; Invariant 1&2 in `test` (unit), Invariant 3 in `test:e2e` or separate script.

### OUT OF SCOPE (explicitly, per ticket)
- Migration bookkeeping debt (duplicate versions, `schema_migrations` gaps, `ON CONFLICT` inconsistency) — separate infra change.
- `db:migrate --apply` automation — separate infra change.
- Growing `MENU_MAP` to include CRUD children — separate feature/design decision.
- Allowlist file maintenance — avoided by narrowing Invariant 2.

### File layout (new test files)
```
backend/src/modules/menus/
├── menu-map-coverage.spec.ts      # Invariant 1 (unit, static)
├── menu-zombies.spec.ts           # Invariant 2 (unit, static, warning-only)
└── menu-orphan-parents.spec.ts    # Invariant 3 (e2e, DB-backed)
```

---

## Risks

| Risk | Evidence | Mitigation |
|------|----------|------------|
| Static parser misses a migration pattern | 0064 uses `INSERT...SELECT` with route in WHERE; 0064_fix uses UPDATE | Explicitly handle these two patterns in scanner; add comment "update parser if new pattern appears" |
| Invariant 2 noise trains team to ignore warnings | ~9 legitimate zombie routes today | Narrow to "zero grants" rule; if noise persists, add allowlist in follow-up |
| Invariant 3 DB test flaky in CI without docker | testcontainers needs docker daemon | Mark test `@integration`; run in separate CI job with docker; unit tests (1&2) always run |
| `gen_random_uuid()` in 0060 breaks static orphan analysis | 0060:42,50,58,66,74,82 use `gen_random_uuid()` | Invariant 3 uses DB; static approximation not attempted |
| Route duplicates (Editar X = parent route) confuse keying | 6 duplicate routes in menu_options | Scanner keys by `(route, name)` pair or by UUID where known; coverage checks route existence, not uniqueness |

---

## Next Recommended Phase

**`propose`** — Write `proposal.md` with the narrowed Invariant 2 rule (zero-grants warning), the three-test split (2 static + 1 DB-backed), and the file layout above. The proposal should explicitly note that Invariant 3 requires docker and will run in a separate CI stage.