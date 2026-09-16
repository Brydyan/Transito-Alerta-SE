# fixes-required.md — front/2026-09-15-departments-menu

## Antes de empezar

27/27 tests PASS, 662/662 full suite PASS, build clean. Layout 2-col OK. Código funciona.

Warnings son: untested código path (toggleCategory), untested guard scenario (dirty-form), y 1 menu placement deviation no documentada. NINGUNO rompe spec en runtime.

---

## Estado de los gates

| Gate | Resultado | Lectura |
|------|-----------|---------|
| `jest --testPathPatterns=departments` | ✅ 27/27 PASS | Tests unitarios OK |
| `jest` (full frontend) | ✅ 662/662 PASS | No regresión |
| `pnpm run build` | ✅ SUCCESS | Build OK (1 budget warning pre-existing) |

**Bloqueadores:** NINGUNO. Todo funciona. Los 3 warnings son cobertura/documentación, no defectos de runtime.

---

## HALLAZGOS WARNINGS

### W1 — Menu en GESTIÓN/81, design dice CATÁLOGOS/95

**Archivo:** `backend/src/modules/menus/menu-map.ts`  
**Línea:** entrada departments

**Desviación:**
- Design.md D6: "Group CATÁLOGOS, order 95, entre Categorías (90) y Ubicaciones (100)"
- Spec Menu Integration: "bajo Administración, después Organizaciones"
- Implementación: `group: 'GESTIÓN', order: 81` (entre Organizaciones y Auditoría)

**Impacto:** Menu sidebar visual position diferente de lo especificado. Funcional pero no coincide artifact.

**Corrección:**

Opción A (seguir design.md):
```typescript
// menu-map.ts
{
  name: 'Departamentos',
  icon: 'building-2', // o 'org', 'teams'
  path: '/admin/departments',
  group: 'CATÁLOGOS', // NO 'GESTIÓN'
  order: 95,
  requires: 'READ departments'
}
```

Opción B (documentar desviación):
Agregar a `apply-progress.md`:
```
## Desviaciones aceptadas
- W1 (Menu placement): Menu departments en GESTIÓN/81 en lugar de CATÁLOGOS/95 por consistencia con sidebar layout actual. Design artifact fue aspiracional; visual final es GESTIÓN.
```

**Por qué importa:** Menu placement es UX. Si design y código divergen, futuros cambios pueden romper la jerarquía. Elige A o B, pero documenta.

**Verificación post-fix:** Menu `menu-map.spec.ts` verifica que entry exista y permissions sean correctas. El test pasará cualquiera sea el group/order, así que re-verifiqué por inspección manual (app navbar).

---

### W2 — `toggleCategory()` y matrix incident-types SIN TEST

**Archivo:** `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts`  
**Método:** `toggleCategory(categoryId: string, checked: boolean)` (línea ~212)

**Defecto:** Código existe pero:
- `toggleCategory()` nunca ejecutado en tests (categories mocked como `[]`)
- `selectedCategoryIds` signal logic never exercised
- Pre-fill de category_ids en edit mode (`dept.category_ids` desde getById) no aserto
- Visual indentation (`[class.pl-6]="cat.parent_id !== null"`) existe pero no verificado

**Por qué importa:** Esta es feature 0058 ("Tipos de incidencia que gestiona"). Si el toggle falla, form entra en estado inválido pero no se detecta hasta prod.

**Corrección:**

Agregar 3 tests a `department-form.component.spec.ts`:

**Test 1: toggleCategory() agrega categoria**
```typescript
it('toggleCategory: adds category ID when checked=true', () => {
  component.incidentCategories.set([
    { id: 'cat-1', name: 'Vialidad', parent_id: null }
  ]);
  component.toggleCategory('cat-1', true);
  
  expect(component.selectedCategoryIds()).toContain('cat-1');
  expect(component.categoryIdsControl.value).toContain('cat-1');
});
```

**Test 2: toggleCategory() remueve categoria**
```typescript
it('toggleCategory: removes category ID when checked=false', () => {
  component.selectedCategoryIds.set(['cat-1']);
  component.toggleCategory('cat-1', false);
  
  expect(component.selectedCategoryIds()).not.toContain('cat-1');
  expect(component.categoryIdsControl.value).not.toContain('cat-1');
});
```

**Test 3: Pre-fill categories on edit**
```typescript
it('edit mode: pre-fills selectedCategoryIds from loaded department', fakeAsync(() => {
  spyOn(component['departmentService'], 'getById').and.returnValue(
    of({ ...dept, category_ids: ['cat-1', 'cat-2'] })
  );
  component.ngOnInit();
  tick();
  
  // Simulate load completing
  component['departmentService'].getById('dept-1').subscribe(d => {
    component.selectedCategoryIds.set(d.category_ids);
  });
  tick();
  
  expect(component.selectedCategoryIds()).toEqual(['cat-1', 'cat-2']);
}));
```

**Verificación post-fix:**
```bash
cd frontend
rtk jest --testPathPatterns='department-form' --testNamePattern='toggleCategory|pre-fills'
# Debe PASS 3 nuevos tests
```

---

### W3 — Dirty-form guard scenario NOT TESTED

**Archivo:** `frontend/src/app/features/catalogs/departments/department-form/`  
**Método:** `onCancel()` (existe, línea ~)

**Código:**
```typescript
onCancel(): void {
  if (this.form.dirty) {
    this.dialogService.confirm({...}).subscribe(confirmed => {
      if (confirmed) this.router.navigate(['/app/admin/departments']);
    });
  } else {
    this.router.navigate(['/app/admin/departments']);
  }
}
```

**Defecto:** No testeado que:
- Form dirty + cancel → muestra dialog
- User confirms → navega
- User declines → queda en form
- Form clean + cancel → navega sin dialog

**Por qué importa:** Unsaved data loss prevention. Spec dice "MUST prompt", pero un bug silencioso en el dialog flow no se detecta.

**Corrección:**

Agregar 4 tests a `department-form.component.spec.ts`:

```typescript
it('onCancel: clean form navigates immediately', fakeAsync(() => {
  component.form.markAsUntouched();
  spyOn(router, 'navigate');
  
  component.onCancel();
  tick();
  
  expect(router.navigate).toHaveBeenCalledWith(['/app/admin/departments']);
}));

it('onCancel: dirty form shows confirm dialog', fakeAsync(() => {
  component.form.markAsDirty();
  spyOn(dialogService, 'confirm').and.returnValue(of(true));
  spyOn(router, 'navigate');
  
  component.onCancel();
  tick();
  
  expect(dialogService.confirm).toHaveBeenCalled();
  expect(router.navigate).toHaveBeenCalledWith(['/app/admin/departments']);
}));

it('onCancel: dirty form + user declines → stays in form', fakeAsync(() => {
  component.form.markAsDirty();
  spyOn(dialogService, 'confirm').and.returnValue(of(false));
  spyOn(router, 'navigate');
  
  component.onCancel();
  tick();
  
  expect(router.navigate).not.toHaveBeenCalled();
}));
```

**Verificación post-fix:**
```bash
rtk jest --testPathPatterns='department-form' --testNamePattern='onCancel'
# Debe PASS 3-4 nuevos tests
```

---

## SUGERENCIAS (no-bloqueo)

### SG1 — `getFormData()` sin test en service.spec.ts

DepartmentService.spec.ts tiene 8 tests pero ninguno cubre `getFormData()`. Agregar:

```typescript
it('getFormData: GET /departments/form-data', () => {
  service.getFormData().subscribe(data => {
    expect(data.incident_categories).toBeDefined();
  });
  const req = httpMock.expectOne('/departments/form-data');
  expect(req.request.method).toBe('GET');
  req.flush({ incident_categories: [] });
});
```

No-bloqueo: getFormData se usa indirectamente en form tests. Pero cobertura directa de service es mejor practice.

---

## Reparto de trabajo

| Hallazgo | Responsable | Tipo | Prioridad |
|----------|-------------|------|-----------|
| W1 | Minimax OR arquitecto (decisión) | Config OR documentación | MEDIA |
| W2 | Minimax | Tests (toggleCategory) | ALTA |
| W3 | Minimax | Tests (dirty-guard) | MEDIA |
| SG1 | Minimax | Test coverage | BAJA |

---

## No toques

| Archivo | Motivo |
|---------|--------|
| Componentes `.ts` core logic | Correcto, no cambies |
| HTML layout 2-col | Correcto, no cambies |
| Service methods | Correcto, no cambies |
| Routing | Correcto, no cambies |

---

## Orden sugerido

1. **W1 decision** (5 min) — ¿GESTIÓN/81 o CATÁLOGOS/95? Elige A (cambiar) o B (documentar).
2. **W2 tests** (15 min) — agregar 3 tests para toggleCategory
3. **W3 tests** (10 min) — agregar 3-4 tests para dirty-guard
4. **SG1 test** (5 min) — agregar getFormData coverage
5. **Lint + tests** (5 min) — verificación

Post-fix: todos los tests PASS, build OK → listo para archive.

---

## Cómo verificar después

```bash
cd frontend
rtk jest --testPathPatterns='department'
rtk npm run build
# Todo debe EXIT 0
```

Si algo falla, párate y reportá exactamente qué.

---

## Post-fix: siguiente paso

Minimax termina → Andy re-verifica (ejecuta los mismos gates) → si PASS, archivo directo.

Manual smoke (8.5) queda PENDING Andy (visual check en localhost, no automatizado).
