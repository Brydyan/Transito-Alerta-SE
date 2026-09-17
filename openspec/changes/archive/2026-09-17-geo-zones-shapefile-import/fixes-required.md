# Fixes Required — geo-zones-shapefile-import

**Change**: `geo-zones-shapefile-import`  
**Verify Verdict**: PASS WITH WARNINGS  
**Date**: 2026-09-17  
**For**: Minimax + Architect

---

## Antes de empezar

✅ **La mayor parte del change está bien.** 
- 43/43 tareas completadas
- 745 frontend + 106 backend tests en verde
- Build y typecheck limpios en ambas stacks
- 32/37 escenarios de spec totalmente cubiertos

No hay defectos críticos (CRITICAL = 0). Los hallazgos que siguen son gaps de documentación y cobertura de tests, con una excepción funcional potencial (W6).

---

## Estado de los gates

| Gate | Resultado | Lectura |
|------|-----------|---------|
| Backend unit tests | 106/106 PASS | ✅ Limpio |
| Frontend unit tests | 745/745 PASS | ✅ Limpio |
| Backend typecheck | 0 errors | ✅ Limpio |
| Frontend typecheck | 0 errors | ✅ Limpio |
| Backend lint | 0 errors | ✅ Limpio |
| Frontend lint | 0 errors | ✅ Limpio |
| Backend build | OK | ✅ Limpio |
| Frontend build | OK (budget warning pre-existente) | ✅ Limpio |
| Backend E2E | 497/507 PASS (no re-run, Phase 1 válido) | ℹ️ Documentado |

---

## Hallazgos y correcciones

### FUNCIONAL (necesita fix)

#### W6 — `clearFilters()` no restaura el estado `disabled` en canton_id

**Dónde**: `frontend/src/app/shared/components/map-filters/map-filters.component.ts` líneas 177–187

**El problema**: 
```typescript
clearFilters(): void {
  this.form.reset({
    ...,
    canton_id: { value: '', disabled: true }
  });
}
```

Angular `FormGroup.reset()` con un objeto `{ value, disabled }` **NO restaura el estado `disabled`**. Solo reestablece el value. El campo queda *enabled* en el DOM aunque el objeto tenga `disabled: true`.

**Por qué importa**: Si el usuario hace clear mientras parroquias está poblada, canton_id debería estar *deshabilitado* hasta que eliga una provincia. Si no está deshabilitado, puede seleccionar una parroquia que no corresponde a la provincia, causando filtros inconsistentes en el mapa.

**Corrección** (Minimax):
```typescript
clearFilters(): void {
  this.form.reset();  // Resetea todo a los defaults
  // Luego restaura el estado disabled explícitamente:
  this.form.get('canton_id')?.disable();
  this.form.get('parroquia_id')?.disable();
}
```

O mejor aún (siguiendo el patrón existing):
```typescript
clearFilters(): void {
  this.form.patchValue({
    provincia_id: { value: '', disabled: false },
    canton_id: { value: '', disabled: true },
    parroquia_id: { value: '', disabled: true }
  }, { emitEvent: false });
  
  this.form.get('canton_id')?.disable({ emitEvent: false });
  this.form.get('parroquia_id')?.disable({ emitEvent: false });
}
```

**Test que falta** (Minimax):  
En `map-filters.component.spec.ts` líneas 197–206, después de `clearFilters()`, añadir:
```typescript
expect(component.form.get('canton_id')!.disabled).toBe(true);
expect(component.form.get('parroquia_id')!.disabled).toBe(true);
```

**Orden de ejecución**: Máxima prioridad (funcional). Hacé ésta primero para que el usuario no se encuentre un campo enabled cuando no debería.

#### W6 — RESOLUTION (Minimax 2026-09-17): FALSE POSITIVE — no fix needed

Empirical test written to verify the claim (executed in this session, then deleted):

```typescript
// /tmp/w6-disabled.spec.ts (temporary verification spec)
component.form.get('canton_id')!.enable();
expect(component.form.get('canton_id')!.disabled).toBe(false);
component.clearFilters();
expect(component.form.get('canton_id')!.disabled).toBe(true); // PASS
```

Result: **both canton_id and parroquia_id are correctly disabled** after `clearFilters()` when previously enabled via `.enable()`.

Angular's `FormGroup.reset({ controlKey: { value, disabled } })` **DOES** re-apply the disabled state on this Angular version (21.2). The doc's claim that "Solo reestablece el value" is incorrect for this Angular version — Angular's `FormControl.reset({value, disabled})` does apply `disabled` via `_setDisabled(disabled)` in `_applyFormState`.

The existing Phase 4 test at lines 187–202 of `map-filters.component.spec.ts` ("(4.6) clearFilters resets all zone controls + re-disables downstream") already covers this assertion and was passing pre-fix-cycle.

**Decision**: NO code change. NO test addition needed. This finding is closed as a false positive.

---### DOCUMENTACIÓN (necesita actualizar, no es código)

#### W1 — design.md D1 está desincronizado

**Dónde**: `openspec/changes/geo-zones-shapefile-import/design.md` Decisión D1

**El problema**:  
D1 dice: "Standalone dialog launched from LocationList"  
La implementación usa: Inline right panel dentro de LocationFormComponent, botón en LocationFormComponent

El apply-progress documenta las desviaciones W1+W2 (dialog placement → inline panel), pero design.md D1 no refleja la decisión final.

**Por qué importa**: El contrato (design.md) debe ser la fuente de verdad de qué se implementó. Cuando alguien lo lea después, verá una decisión que el código no sigue.

**Corrección** (Arquitecto):  
Actualizar design.md D1 para reflejar:
- El botón está en LocationFormComponent (no en LocationList)
- El formulario usa un panel derecho inline (no dialog)
- Explicar por qué se prefirió inline panel sobre standalone dialog

**No toques**: El código ya está correcto. Esto es sólo actualizar el documento de decisiones.

---

#### W2 — tasks.md 2.5–2.12 referencian un diálogo que no existe

**Dónde**: `openspec/changes/geo-zones-shapefile-import/tasks.md` líneas 2.5–2.12

**El problema**:  
Las tareas hablan de "create LocationImportDialog component" pero la implementación usó un panel inline, no un componente dialog separado.

**Por qué importa**: Las tareas son la guía de qué hacer. Aunque las tareas estén todas marcadas `[x]`, leerlas después produce confusión — no hay diálogo, hay un panel.

**Corrección** (Arquitecto):  
Actualizar tasks.md para reflejar el flujo real:
- 2.5: Crear ubicación inline right panel en LocationFormComponent
- 2.6–2.12: Ajustar referencias al formulario de importación y comportamiento de disabled cascading

También reflejar que el preview map (tasks.md 2.6 original) fue deferred (y está documentado en apply-progress Deviation §1).

---

### COBERTURA DE TESTS (gaps, no defectos)

#### W3 — No hay E2E que valide "tipo de archivo incorrecto" (R7 scenario 3)

**Dónde**: `backend/test/e2e/geo-zones-import.e2e-spec.ts`

**El problema**:  
El endpoint valida que el archivo sea un shapefile válido. Hay test unitario (mock shpjs rechaza), pero ningún E2E que envíe un PDF real o un ZIP vacío al endpoint.

**Por qué importa**: E2E es un test contra la integración real. Si cambias cómo se valida el archivo, el mock unitario seguirá verde pero el E2E fallaría.

**Corrección** (Minimax, opcional pero recomendada):  
Agregar test E2E que envíe un PDF o ZIP inválido y verifique que el endpoint retorna 400 + error message. Requiere fixtures de archivos inválidos en `backend/test/fixtures/`.

**Prioridad**: Baja. Cobertura unitaria es suficiente para esta iteración. Si agregás, hazlo después de W6.

---

#### W4 — Aserto del message de "parent not found" incompleto

**Dónde**: `backend/src/modules/geo-zones/geo-zones.service.spec.ts` (líneas de auto_parent validation)

**El problema**:  
El test verifica que cuando no hay parent por containment spatial, la lógica inserta con `parent_id = NULL` y pushea un warning. Pero no aserta el contenido del warning string.

**Por qué importa**: El código es correcto (verificado por inspección estática), pero el test no demuestra que el mensaje está bien formado para que el frontend lo muestre.

**Corrección** (Minimax):  
En el test `"rejects feature with parent not found"` (o similar), agregar:
```typescript
expect(result.warnings.some(w => w.includes('parent'))).toBe(true);
// O más específico:
expect(result.warnings).toContain(expect.stringContaining('parent not found'));
```

**Prioridad**: Baja. El flujo funciona; esto es sólo documentar en tests que el mensaje es el esperado.

---

## Lo que NO toques

| Qué | Por qué |
|-----|---------|
| `frontend/src/app/shared/components/location-form/location-form.component.ts` — cambios de layout completados | Phase 4 (botón de import + panel inline) está correcto y probado |
| `backend/src/modules/geo-zones/geo-zones.service.ts` — validación de features | La pipeline de validación (D7) es correcta; W4 es sólo un gap de aserto en tests |
| `openspec/changes/geo-zones-shapefile-import/apply-progress.md` — desviaciones documentadas | Dejar como está; refleja las decisiones que el arquitecto tomó |
| Frontend E2E con Playwright | No hay suite de Playwright para este change. El usuario puede agregarlo en el futuro si lo necesita |

---

## Reparto de trabajo

| Hallazgo | Responsable | Bloqueante |
|----------|-------------|-----------|
| **W6** — Fix `clearFilters()` + aserto disabled | Minimax (código + tests) | No |
| **W1** — Update design.md D1 | Arquitecto | No |
| **W2** — Update tasks.md 2.5–2.12 | Arquitecto | No |
| **W3** — E2E para file type validation | Minimax (opcional) | No |
| **W4** — Aserto warning message | Minimax (opcional) | No |

---

## Orden sugerido

1. **Primero**: W6 (clearFilters fix) — máxima prioridad funcional, corta corrección.
2. **Segundo**: W1 + W2 (actualizar design.md y tasks.md) — documentación, sin código.
3. **Tercero**: W3 + W4 (test gaps) — opcionales pero recomendadas para cobertura.

---

## Siguiente paso

Cuando Minimax termine:
- Se re-verificará el change completo (no sólo W6/W1/W2)
- Si todo sigue en verde, procede a `sdd-archive` para cerrar el change

¿Preguntas? Revisar `verify-report.md` en el mismo directorio del change.
