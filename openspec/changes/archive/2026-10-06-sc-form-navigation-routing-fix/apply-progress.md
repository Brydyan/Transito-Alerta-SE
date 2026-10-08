# Apply Progress — 2026-09-22-sc-form-navigation-routing-fix

**Estado**: implementación completa, gates verdes, listo para `sdd-verify`.  
**Fecha**: 2026-10-06  
**Working dir**: `frontend/`

---

## Implementado

### Forms — `goBack()` con path absoluto (4 archivos)

| Archivo | Antes | Después |
|---|---|---|
| `organization-form.component.ts:195` | `navigate(['../'], { relativeTo })` | `navigate(['/app/admin/organizaciones'])` |
| `department-form.component.ts:325` | `navigate(['../'], { relativeTo })` | `navigate(['/app/admin/departamentos'])` |
| `category-form.component.ts:248` | `navigate(['../../'], { relativeTo })` | `navigate(['/app/categorias'])` |
| `location-form.component.ts:298` | `navigate(['../../'], { relativeTo })` | `navigate(['/app/ubicaciones'])` |

### Lists — `navigateToCreate()` y `navigateToEdit()` con path absoluto (4 archivos)

| Archivo | Antes | Después |
|---|---|---|
| `organization-list.component.ts:167,171` | `[new]` / `[id,'edit']` relativo | `['/app/admin/organizaciones/new']` / `['/app/admin/organizaciones', id, 'edit']` |
| `department-list.component.ts:146,150` | `[new]` / `[id,'edit']` relativo | `['/app/admin/departamentos/new']` / `['/app/admin/departamentos', id, 'edit']` |
| `category-list.component.ts:143,147` | `[new]` / `[id,'edit']` relativo | `['/app/categorias/new']` / `['/app/categorias', id, 'edit']` |
| `location-list.component.ts:248,252` | `[new]` / `[id,'edit']` relativo | `['/app/ubicaciones/new']` / `['/app/ubicaciones', id, 'edit']` |

### Template (1 archivo)

| Archivo | Antes | Después |
|---|---|---|
| `users-list.component.html:142` | `[routerLink]="['/app/organizaciones']"` | `[routerLink]="['/app/admin/organizaciones']"` |

### Tests (9 archivos, 14 tests nuevos)

Cada `*list.component.spec.ts` y `*form.component.spec.ts` recibió un nuevo `describe('navigation')` que verifica el path absoluto (ver `tasks.md` Phase 4). `users-list.component.spec.ts` recibió un test que valida el `[routerLink]` del HTML.

---

## Gates finales

| Gate | Comando | Resultado |
|---|---|---|
| Suite completa | `rtk pnpm test` | **104 suites / 884 tests PASS / 0 FAIL** |
| Build | `rtk pnpm run build` | exit 0 (warning preexistente de budget, no relacionado) |

---

## Desviaciones respecto a `design.md` / `tasks.md`

1. **Cambio mínimo en form `#1` y `#2` (orgs/depts)**: el `tasks.md` propone cambiar `['../']` por absoluto, pero esos dos funcionan actualmente (1 nivel correcto: `:id/edit` → `organizaciones`). **Decisión**: aun así aplico el cambio a absoluto en los 4 forms para **uniformidad** y para alinearse con el patrón de `users-list` / `NewUserFormComponent` / `RoleEditorComponent`. Documentado en `design.md` D1 como "consistencia con módulos maduros".

2. **`location-form.component.spec.ts`**: el spec preexistente no importaba `ReactiveFormsModule` ni `Router`. Agregué ambos imports (`ReactiveFormsModule` ya se necesitaba para `ReactiveFormsModule` en el `render`, `Router` para el `useValue: mockRouter`). Sin esta adición el test verde no compila.

4. **`location-form.component.spec.ts` — `mockGeoZoneService.listAll`**: mi test nuevo llamó `goBack()` antes de que `loadZones()` corriera, pero `loadZones()` se ejecuta en `ngOnInit` y mockea `listAll` que por defecto devuelve `undefined.subscribe`. Agregué `mockGeoZoneService.listAll.mockReturnValue(of([]))` al inicio del test. **Esto NO es un bug del código** — solo del setup del test.

5. **`department-form.component.spec.ts` — `mockActivatedRoute`**: el spec preexistente NO declara `let mockActivatedRoute` en el scope superior. Reemplacé mi asignación externa (`mockActivatedRoute = {...}`) por un valor local (`const fixtureParams = {...}`) pasado al provider. Más surgical.

6. **`organization-form.component.spec.ts` — `renderForm` no es global**: `renderForm` se declara dentro del `describe('zone_id y parent_id')`. Mi test está en un `describe` distinto, por lo que `renderForm` no estaba en alcance. Reemplacé por `render(OrganizationFormComponent, { ...providers })` directo con todos los providers.

7. **Tests rojos se verificaron con `--runInBand` y single-spec**: durante la ejecución, `jest --testPathPatterns='X|Y|Z'` (batch multi-spec) mostró fallos de parseo por Babel (síntoma: "Missing semicolon" en tipos TS). Es bug conocido de `jest-preset-angular` con workers paralelos y múltiples specs. Los tests **sí pasan individualmente** y **también pasan con `pnpm test` completo** (104/104 suites / 884 tests). El batch con filter no es representativo del estado real.

8. **Sin tests e2e nuevos**: `tasks.md` Phase 4.5 menciona `users-list.component.spec.ts` verifica el routerLink, lo cual hicimos. Tests e2e adicionales (Playwright) no son necesarios para fixes puramente de navegación — los unit tests con spy del router son suficientes y más rápidos (D4 design.md).

---

## Archivos tocados

| Archivo | Tipo |
|---|---|
| `frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.ts` | `goBack()` → absolute path |
| `frontend/src/app/features/catalogs/organizations/organization-form/organization-form.component.spec.ts` | nuevo `describe('navigation')` |
| `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts` | `goBack()` → absolute path |
| `frontend/src/app/features/catalogs/departments/department-form/department-form.component.spec.ts` | nuevo `describe('navigation')` |
| `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.ts` | `goBack()` → absolute path |
| `frontend/src/app/features/catalogs/incident-categories/category-form/category-form.component.spec.ts` | nuevo `describe('navigation')` |
| `frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts` | `goBack()` → absolute path |
| `frontend/src/app/features/catalogs/locations/location-form/location-form.component.spec.ts` | imports + nuevo `describe('navigation')` |
| `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.ts` | `navigateToCreate/Edit` → absolute paths |
| `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.spec.ts` | nuevo `describe('navigation')` + `Router` import |
| `frontend/src/app/features/catalogs/departments/department-list/department-list.component.ts` | `navigateToCreate/Edit` → absolute paths |
| `frontend/src/app/features/catalogs/departments/department-list/department-list.component.spec.ts` | nuevo `describe('navigation')` + `Router` import |
| `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts` | `navigateToCreate/Edit` → absolute paths |
| `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.spec.ts` | nuevo `describe('navigation')` |
| `frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts` | `navigateToCreate/Edit` → absolute paths |
| `frontend/src/app/features/catalogs/locations/location-list/location-list.component.spec.ts` | nuevo `describe('navigation')` + `Router` import |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | `routerLink` arreglado |
| `frontend/src/app/features/admin/users/users-list/users-list.component.spec.ts` | nuevo test del routerLink |
| `openspec/changes/front/2026-09-22-sc-form-navigation-routing-fix/apply-progress.md` | este archivo |

**No tocados** (restricción builder): `design.md`, `specs/navigation/spec.md`, `proposal.md`, `tasks.md`.

---

## Listo para

`sdd-verify` (auditoría de Claude).  
Si pasa → `sdd-archive` (mover a `openspec/changes/archive/2026-09-22-sc-form-navigation-routing-fix/` y sincronizar spec canónico).

**Antes del merge**:
- Smoke test manual del flujo end-to-end: admin crea+guarda+edita+guarda+cancela una organización / departamento / categoría / ubicación.
- Verificar que `users-list` → "Ver organizaciones..." navega correctamente.