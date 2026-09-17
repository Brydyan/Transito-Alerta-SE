# Handoff Gemini CLI — F5, Tramo 4 (F5.7 cierre: verify + archive)

**Fecha**: 2026-09-14
**Change**: `back/2026-08-29-f5-dynamic-menus` (F5 — menús dinámicos administrables)
**Modo**: **EJECUTAR el cierre** (verificación independiente + archivado). El runtime nativo de
OpenCode agotó la cuota free-tier del proveedor (`gemini-3.6-flash`, 20 req/día) para
despachar `sdd-verify`; el cierre se delega a Gemini CLI con este documento.

> **NO implementar código.** F5.1–F5.6 están implementados, verificados por gates y
> marcados `[x]`. Tu trabajo es (1) **verificar** el change contra el spec y (2)
> **archivarlo**. No toques código fuente salvo que la verificación exija señalar un
> defecto — y en ese caso reportalo, no lo corrijas.

---

## 1. Estado real (lo que vas a verificar y archivar)

- **Rama**: `carlos_fp/sc-307/f5-menus-dinamicos-crud-en-bd-con-matriz`. **NO commits**.
- **Implementado y `[x]` en `tasks.md`**: F5.1–F5.4 backend (25/25), F5.5 CRUD+validaciones
  (8/8), F5.6 frontend admin (9/9).
- **Backend** (`backend/src/modules/menus/`):
  - Migraciones **0054** (esquema: `menu_options`, `menu_option_roles`, `api_endpoints`,
    `menu_option_endpoints`, `roles.scope`, permisos, semilla de endpoints) + **0055**
    (MENU_MAP → `menu_options` + `menu_option_roles`), con DOWN en `database/rollback/`.
    **Aplicadas a BD docker local** (`tase-postgres`, registradas en `schema_migrations`);
    en **Supabase quedan Pending** (fase deploy, follow-up).
  - `menus.service.ts`: resolución desde BD, árbol en memoria por `parent_id` (D3), caché
    `menu:v1:role:{roleId}` TTL 1h + invalidación `menu:v1:*` (D4). **Sin `parentId` leak**
    en el wire (hallazgo 1 del review corregido; test de regresión).
  - `menu-options.service.ts` + `controller.ts` + `dto/`: CRUD, validaciones (ciclo ⇒ 422,
    autopadre ⇒ 422, ruta duplicada ⇒ 409, borrado con hijos ⇒ 409, `can_write` sin
    `can_read` ⇒ 422), matriz de roles en 3 bloques por `roles.scope`, asignación de
    endpoints idempotente, catálogo paginado/filtrable, guards ⇒ 403.
- **Frontend** (`frontend/src/app/`):
  - `core/services/menu.service.ts`: propaga `children` (F5.6.8). Sidebar ciudadano con
    **look plano** (decisión de producto: encabezados de sección aplanan sus hijos como
    links visibles, sin colapsables).
  - `core/services/menu-option.service.ts` + `features/admin/menu-options/` (árbol izq +
    detalle der, `menu-tree`, `role-matrix`, `endpoint-picker`) + ruta `/app/controles` con
    `permissionGuard` READ `menu-options`.
- **Gates ya corridos (evidencia fresca, 2026-09-14)**:
  - Backend: `npm run lint` 0 errores (29 warnings preexistentes) · `npm run typecheck` OK
    · `npm test` **118 suites / 1110 tests PASS**. `npm run test:e2e` **BLOQUEADO** por
    Testcontainers/Ryuk (infra local conocida — reportar, no arreglar en silencio).
  - Frontend: `pnpm exec jest --runInBand` **93 suites / 656 tests PASS** · `pnpm run build`
    OK.
- **Registro vivo**: `openspec/changes/back/2026-08-29-f5-dynamic-menus/apply-progress.md`
  (mergeado por tramo, con sección **Open Findings** al final).

## 2. Lo que tenés que hacer

### Paso A — Verificación independiente → crear `verify-report.md`

1. Leé `tasks.md`, `specs/dynamic-menus/spec.md` (REQUIREMENTS + TODOS los SCENARIOS),
   `design.md` (D1–D8, Q1/Q5, Implementation notes) y `apply-progress.md`.
2. Mapeá cada REQUIREMENT/SCENARIO a evidencia concreta (archivo:línea o nombre de test):
   - Contrato D1: `{ label, route, icon?, group?, order }` + `children`, SIN `parentId`.
   - Resolución: filtros `can_read` + `is_active` + `deleted_at`; árbol por `parent_id`;
     hijo oculto si padre inaccesible; caché por rol.
   - CRUD/validaciones + matriz 3 bloques scope + endpoints idempotente + divergencia D5.
   - Frontend: servicio CRUD, ruta guardada, árbol jerárquico, matriz, picker, sidebar plano.
3. Corré los gates (mandato: `npm run lint && npm run typecheck && npm test` en `backend/`;
   `pnpm exec jest --runInBand && pnpm run build` en `frontend/`). e2e: corré `npm run
   test:e2e` UNA vez para confirmar el bloqueo de infra, reportalo, NO lo arregles.
4. Escribí `openspec/changes/back/2026-08-29-f5-dynamic-menus/verify-report.md`:
   CRITICAL / WARNING / SUGGESTION con evidencia. Los **3 Open Findings** ya conocidos se
   clasifican así (NO son descubrimientos nuevos):
   1. `GET /menu-options/:id/endpoints` faltante → endpoint-picker no hidrata "asignados"
      al re-seleccionar → **WARNING**.
   2. Sin fila en el seed para `/app/controles` (requiere migración 0056) → sin link en
      sidebar → **WARNING**.
   3. Confirm dialog en delete (patrón `ConfirmDialogService` de roles) → **SUGGESTION**.

### Paso B — Archivar el change

1. Creá `openspec/changes/archive/<fecha>-2026-08-29-f5-dynamic-menus/` (patrón de fecha
   YYYY-MM-DD, ej. `2026-09-14-2026-08-29-f5-dynamic-menus`).
2. Mové ALLÍ el contenido actual de `openspec/changes/back/2026-08-29-f5-dynamic-menus/`
   (proposal, specs, design, tasks, apply-progress, verify-report, handoffs).
3. **Sincronizá el delta en el spec canónico**: creá `openspec/specs/dynamic-menus/spec.md`
   a partir del `specs/dynamic-menus/spec.md` del change (REQUIREMENTS + SCENARIOS ya
   implementados). Adjuntá el delta al spec canónico siguiendo el patrón de otras specs
   canónicas en `openspec/specs/<dominio>/spec.md`.
4. Registrá los **3 Open Findings como follow-ups** (sección explícita en
   `verify-report.md` y/o en el `archive-report.md`; son deuda declarada que NO bloquea el
   archive — dependencias de otro slice/fase).
5. NO borres `apply-progress.md`, `handoff-gemini-cli-tramo-1.md`,
   `tramo-1-review-findings.md` ni `handoff-gemini-cli-cierre-f57.md` — forman parte del
   registro.

## 3. Reglas duras

1. **NO `git add`/`commit`/`push`** ni PRs. El humano commitea. Working tree listo.
2. NO modifiques código fuente, `tasks.md` ya marcado, ni el apply-progress salvo que la
   verificación exija anotar algo nuevo (en ese caso: nueva sección, no reescribir).
3. Artifacts (`verify-report.md`, spec canónico) en **inglés técnico neutro**.
4. El contrato D1 (wire sin `parentId`), el look plano del sidebar y la exclusión del
   anónimo (Q5) son decisiones cerradas: verificar que se cumplen, NO tocarlas.
5. Si la verificación encuentra un CRITICAL real (no de los conocidos), parate y reportalo
   en el chat en vez de archivarlo.

## 4. Entregables al terminar (para el humano/orquestador)

- `verify-report.md` creado con hallazgos clasificados y evidencia.
- Change movida a `openspec/changes/archive/…` y spec canónico `dynamic-menus` creado/sync.
- Reporte en chat: resumen de la verificación (requerimientos → evidencia), gates reales,
  hallazgos (incluidos los 3 follow-ups registrados), ruta de archive, y cualquier
  desviación encontrada.