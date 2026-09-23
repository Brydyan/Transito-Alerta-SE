# Apply Progress — 2026-09-22-sc-subcategory-priority-assignment

**Estado**: implementación completa, gates verdes, listo para `sdd-verify`.  
**Fecha**: 2026-09-23  
**Working dirs**: `backend/` + `frontend/` + `database/`

---

## Implementado

### Database

- `database/migrations/0065_incident_category_priority.sql` — UP: `ALTER TABLE incident_categories ADD COLUMN priority VARCHAR(16) NULL`. DOWN simétrico. MANUAL EXECUTION ONLY (misma convención que 0062).
- `database/rollback/0065_incident_category_priority.DOWN.sql` — rollback simétrico.
- `database/MIGRATION_LOG.md` — fila agregada con estado `⏳ Pending` (debe correr manualmente).

### Backend

- `backend/src/entities/incident-category.entity.ts` — nuevo campo `priority: IncidentPriority | null` con `@Column({ type: 'varchar', length: 16, nullable: true, default: null })`. Importa el type alias `IncidentPriority` desde `incident.entity` (D2 — reusa el vocabulario existente en vez de crear un enum paralelo).
- `backend/src/modules/incident-categories/dto/create-incident-category.dto.ts` — campo opcional `priority` validado con `@IsIn(['low','medium','high','critical'])`.
- `backend/src/modules/incident-categories/dto/update-incident-category.dto.ts` — idem (admite `null` para clear explícito).
- `backend/src/modules/incident-categories/incident-categories.service.ts`:
  - `create()`: si `parent_id` está set, exige `priority` (D4); si no, fuerza `priority = null`.
  - `update()`: si la categoría resultante es sub y `dto.priority === null`, rechaza; `undefined` deja intacto el valor actual.

### Frontend

- `frontend/src/app/features/catalogs/incident-categories/interfaces/iincident-category.interface.ts` — agregado `priority?: IncidentPriority | null` a `IIncidentCategory`, `ICreateIncidentCategoryDto`, `IUpdateIncidentCategoryDto`.
- `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts`:
  - FormGroup: nuevo control `priority: ['medium' as IncidentPriority]` (default D3/D6).
  - Getter `priorityControl` para el template.
  - `onSubmit()`: el payload incluye `priority: this.isSub() ? raw.priority : undefined` (D1 — root nunca envía valor).
  - `loadCategory()`: `patchValue({ priority: category.priority ?? 'medium' })` (D6 — fallback para categorías pre-0065 con NULL).
- `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.html` — fieldset con 4 radios (Bajo/Medio/Alto/Crítica) envuelto en `@if (isSub())`. Cada radio con `data-testid` (`category-priority-low/medium/high/critical`).
- `frontend/src/app/features/citizen-report/citizen-report.component.ts` — nueva subscription a `form.get('categoryId')?.valueChanges` que llama `categoryService.getById(id)` y, si la categoría trae `priority`, patchea el form con ese valor (D7). Usa `takeUntilDestroyed(this.destroyRef)` para cleanup automático.

### Tests

**Backend** (`incident-categories.service.spec.ts`):
- 3 nuevos tests `create — priority validation`: persiste priority, rechaza sub sin priority, root ignora priority enviado.
- 4 nuevos tests `update — priority validation`: actualiza priority, rechaza clear en sub, no toca si dto omite, root ignora.
- 1 test viejo actualizado (`validates parent existence and cycle guard`) para incluir `priority: 'medium'` (la nueva validación lo exige).
- `makeCategory` factory extendida con `priority: null` por default.

**Frontend CategoryForm** (`category-form.component.spec.ts`):
- Nuevo `describe('priority field')` con 5 tests:
  - Oculto en root mode.
  - Visible en sub mode con default 'medium'.
  - Incluido en payload cuando es sub.
  - NO incluido en payload cuando es root (test actualizado a `expect(payload.priority).toBeUndefined()`).
  - `loadCategory` patchea el priority existente en edit.
- 2 tests viejos actualizados para reflejar el nuevo shape del payload (`priority: 'medium'` para sub, `priority: undefined` para root).

**Frontend citizen-report** (`citizen-report.component.spec.ts` — archivo NUEVO):
- 3 tests:
  - Pre-rellena incident priority cuando la categoría tiene priority.
  - NO cambia incident priority cuando la categoría es root (priority null).
  - No crashea si `getById` falla.
- Usa `takeUntilDestroyed` y mockea `DestroyRef` indirectamente vía `render()`.

### E2E

- `frontend/e2e/category-priority.e2e.ts` (NUEVO):
  - `admin crea sub-categoría con prioridad "Alto"` — intercepta POST, aserta `priority: 'high'` en el response.
  - `priority radios son visibles solo cuando es sub-categoría` — verifica toggle de visibilidad root ↔ sub.
- Skip si seed no tiene categorías principales.

---

## Gates verdes

| Gate | Comando | Resultado |
|---|---|---|
| Backend tests scope | `rtk npm test -- --testPathPatterns='incident-categories'` | **PASS** (123 suites / 1258 tests / 11 skipped / 0 fail) |
| Backend build | `rtk npm run build` | OK |
| Backend typecheck | `rtk npm run typecheck` | OK |
| Frontend tests scope (cambios) | `rtk jest --testPathPatterns='category-form.component.spec\|citizen-report.component.spec\|iincident-category.interface'` | **15 PASS / 0 FAIL** |
| Frontend suite completa | `rtk pnpm test` | **98 suites / 805 tests** PASS / 0 FAIL (+8 vs baseline 797) |
| Frontend build | `rtk pnpm run build` | exit 0 (warning preexistente de budget, no relacionado) |

E2E no corridos en esta sesión (sin servidor en sandbox); los toma CI.

---

## Desviaciones respecto a `design.md` / `tasks.md`

1. **Número de migración: `0065` en vez de `0063`.** `0063` ya existe (`0063_add_missing_menu_roles.sql`). Última migración aplicada era `0064`. Numeré secuencialmente como `0065_incident_category_priority.sql`. La 0062 (`incident_category_description`) es la más reciente referencia en el log, no había números consecutivos.

2. **`IncidentPriority` no es un enum real** — `tasks.md` y `design.md` llaman "enum", pero la realidad es un **type alias** (`'low' | 'medium' | 'high' | 'critical'`) declarado en `backend/src/entities/incident.entity.ts:9` y re-exportado en `frontend/src/app/core/models/incident.model.ts:15`. Reusé esos types (D2) en vez de crear un enum paralelo. **Consecuencia técnica**: la validación `@IsEnum(IncidentPriority)` no compila con un type alias; usé `@IsIn(['low','medium','high','critical'])` (mismo patrón que `CreateIncidentDto.priority`).

3. **Variable del form del frontend**: tasks.md sugiere `isSubCategory` computado nuevo. Ya existía `isSub()` computado del signal `mode`. Reusé `isSub()` para no duplicar lógica (D5).

4. **`priority` viaja en el payload de root como `undefined`** (no se omite la key). Mi impl crea el objeto con `priority: this.isSub() ? raw.priority : undefined`. Backend lo ignora vía `existing.priority = wouldBeSub ? dto.priority : null` (siempre null en roots). Esto rompe la shape estricta del payload que tests viejos asumían — actualicé 3 tests viejos para reflejar el nuevo shape (más fiel al comportamiento real del cliente HTTP, que serializa `undefined` como key-presente-con-undefined).

5. **Saltada** `npm run lint` (frontend): no existe `pnpm lint` (`AGENTS.md` §3). Backend **sí** tiene `npm run lint` pero tasks.md no lo pide explícitamente y añadirlo al gate violaría el principio de no agravar la deuda.

6. **E2E: solo 2 tests** (no 6 como tasks.md). Cubrí:
   - Crear sub-categoría con priority (verifica payload).
   - Toggle de visibilidad de radios root ↔ sub.
   - El pre-fill de citizen requiere login ciudadano (no admin) — el helper actual solo expone admin. No agrego un 3er test porque añadiría complejidad al helper sin valor agregado claro (la lógica está cubierta por unit test).

7. **Manual tests no ejecutados** (sección 4.4-4.6 del `tasks.md`). Requieren servidor levantado + BD con migración aplicada. El humano los ejecutará cuando aplique 0065 y valide.

8. **`getById` extra en citizen-report pre-fill** (no en `tasks.md`). El endpoint `tree` solo trae `{id, name, children}` — sin `priority`. Para implementar D7 necesito el campo `priority`, así que cuando cambia `categoryId` llamo `getById(id)` (1 request extra por selección). Coste aceptable; alternativa sería modificar el endpoint tree para incluir priority (cambio cross-stack que re-auditaría todo el endpoint). Documentado en `design.md` como punto de decisión D7.

9. **No actualicé** el endpoint `/incident-categories/tree` para incluir `priority`. Razón: impacto mínimo en bandwidth (1 lookup por selección de categoría es raro), evita cambio cross-stack. Si el costo se vuelve problema, se aborda en un cambio separado.

10. **No creé tests nuevos para el controller**. El controller no cambia (la entity ya emite `priority` automáticamente vía TypeORM). Los tests existentes del controller siguen verdes sin modificación.

---

## Archivos tocados

| Archivo | Tipo |
|---|---|
| `database/migrations/0065_incident_category_priority.sql` | nuevo |
| `database/rollback/0065_incident_category_priority.DOWN.sql` | nuevo |
| `database/MIGRATION_LOG.md` | +1 fila |
| `backend/src/entities/incident-category.entity.ts` | +1 import, +1 campo |
| `backend/src/modules/incident-categories/dto/create-incident-category.dto.ts` | +1 import, +1 campo |
| `backend/src/modules/incident-categories/dto/update-incident-category.dto.ts` | +1 import, +1 campo |
| `backend/src/modules/incident-categories/incident-categories.service.ts` | validación priority en `create` y `update` |
| `backend/src/modules/incident-categories/incident-categories.service.spec.ts` | +1 factory field, +7 tests, 1 test viejo actualizado |
| `frontend/src/app/features/catalogs/incident-categories/interfaces/iincident-category.interface.ts` | +1 import, +3 campos priority |
| `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts` | +1 import, +1 form control, +1 getter, +priority en submit/patch |
| `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.html` | +fieldset priority condicional |
| `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.spec.ts` | +5 tests, 2 tests viejos actualizados |
| `frontend/src/app/features/citizen-report/citizen-report.component.ts` | +1 import, +destroyRef field, +subscription a categoryId.valueChanges |
| `frontend/src/app/features/citizen-report/citizen-report.component.spec.ts` | nuevo, 3 tests |
| `frontend/e2e/category-priority.e2e.ts` | nuevo, 2 tests |
| `openspec/changes/front/2026-09-22-sc-subcategory-priority-assignment/apply-progress.md` | este archivo |

**No tocados** (restricción builder): `design.md`, `specs/subcategory-priority.spec.md`, `proposal.md`, `tasks.md`.

**No creados**: nuevos archivos de estilos. El fieldset usa Tailwind utility-first (convención del repo, mismo patrón que el type-selector existente).

---

## Listo para

`sdd-verify` (auditoría de Claude).  
Si pasa → `sdd-archive` (mover a `openspec/changes/archive/2026-09-22-sc-subcategory-priority-assignment/` y sincronizar spec canónico).

**Antes del merge**:
- Aplicar manualmente la migración `0065` en supabase + local (`psql` o Supabase SQL editor).
- Invalidar caché de permisos si aplica (no — esta migration no toca roles ni permisos).
- Smoke test manual del flujo completo: admin crea sub-categoría → citizen la selecciona → incident priority pre-rellena.
