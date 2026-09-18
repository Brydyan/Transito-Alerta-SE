# fixes-required.md — 2026-09-15-departments-module

## Antes de empezar

No re-audites. La mayor parte funciona (56/56 tests pasen, migraciones UP/DOWN válidas, permisos correctos). Si encuentrás código que no coincida con esto, **pausá y escalá — el spec estaba adelantado**.

Los dos hallazgos críticos son reparables en <30 min. Warnings son deuda técnica/futura, marcadas como no-bloqueo.

---

## Estado de los gates

| Gate | Resultado | Lectura |
|------|-----------|---------|
| `jest --testPathPattern='departments'` | ✅ 56/56 PASS | Tests unitarios pasen |
| `jest` (full suite) | ✅ 1122/1122 PASS | No regresión en otros módulos |
| `npm run lint` | ❌ EXIT 1 | **Tuyo (C1)** |
| `tsc -b` | ❌ EXIT 1 | **Tuyo (C1)** — import inválido |

**Bloqueadores:** C1 (lint/typecheck roto) y C2 (spec violado). Resolvé en ese orden.

---

## HALLAZGOS CRÍTICOS

### C1 — `departments.e2e-spec.ts` rompe typecheck y lint

**Archivo:** `backend/test/e2e/departments.e2e-spec.ts`  
**Línea:** 25

**Código:**
```typescript
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
```

**Defecto:** Paquete `@jest/globals` no está en `node_modules`. Produce:
- TypeScript `TS2307: Cannot find module`
- ESLint: `'expect' is defined but never used`, `'request' is defined but never used`

**Por qué importa:** Typecheck + lint gates rompen. CI rechaza el change. No puede mergear.

**Convención del proyecto:** Todos los demás e2e specs (`organizations.e2e-spec.ts`, `geo-zones.e2e-spec.ts`) usan ambient jest globals sin import explícito.

**Corrección:**

1. **Elimina línea 25** (import de `@jest/globals`)
2. **Elimina import de `request`** en línea 28 (está marcado como unused)
3. Usa ambient globals (describe, expect, it, beforeAll, afterAll)

**Verificación post-fix:**
```bash
cd backend
rtk npm run lint
rtk npx tsc -b tsconfig.json --noEmit
# Ambos deben EXIT 0
```

---

### C2 — S2.2 violado: `GET /departments` para master retorna 0 filas

**Archivo:** `backend/src/modules/departments/departments.repository.ts`  
**Método:** `list()`

**Spec S2.2:** 
> "master sees all non-deleted departments from all organizations when `GET /api/departments` is called without an `organizationId` query parameter"

**Defecto:** Controlador pasa `scopedOrgId = query.organizationId ?? ''` (string vacío) al repository. Repository siempre ejecuta:
```sql
WHERE organization_id = $1  -- $1 = '' (empty string)
```

Empty string NUNCA matchea UUIDs en PostgreSQL → 0 filas retornadas.

Test controlador en línea 128 aserta que se pase `''` como "caller opted out", pero eso es internamente consistente con el código roto, no con el spec.

**Por qué importa:** Master no puede listar sus propios departamentos globalmente. Feature bloqueada. Spec/código desincronizados.

**Corrección:**

En `DepartmentsRepository.list(organizationId?, ...)`:

**Antes:**
```typescript
list(organizationId?: string, search?: string, page?: number, perPage?: number) {
  let query = `SELECT ... FROM departments WHERE deleted_at IS NULL AND organization_id = $1`;
  const params = [organizationId ?? ''];
  ...
}
```

**Después:**
```typescript
list(organizationId?: string, search?: string, page?: number, perPage?: number) {
  let query = `SELECT ... FROM departments WHERE deleted_at IS NULL`;
  const params = [];
  let paramIndex = 1;

  // Org filter es condicional: solo si se especificó
  if (organizationId) {
    query += ` AND organization_id = $${paramIndex++}`;
    params.push(organizationId);
  }
  
  // search, page, perPage como está (paramIndex continúa desde donde paró)
  ...
}
```

**Actualizar controlador test** (línea 128):
```typescript
// Antes: organizationId: '' (broken)
// Después:
const result = await controller.list(
  { organizationId: undefined },  // Master sin org filter
  { user: masterUser }
);
expect(result.items.length).toBeGreaterThan(0);  // Debe retornar filas
```

**Verificación post-fix:**
```bash
cd backend
rtk jest --testPathPattern='departments'
# Debe pasar, incluyendo new test con master sin org filter
```

---

## HALLAZGOS WARNINGS (no-bloqueo)

### W1 — MIGRATION_LOG status desactualizado

**Archivo:** `database/MIGRATION_LOG.md`  
**Líneas:** 

Filas 0056 y 0057 muestran `⏳ Pending` pero ambas migraciones fueron aplicadas (per `apply-progress.md` D.2).

**Corrección:** Actualiza status a `✅ Applied` y llenar Applied By, Applied Date, Environment.

**No-bloqueo:** Es documentación, no afecta funcionamiento.

---

### W2 — S8.2 undelete no implementado

**Spec S8.2:** Restaurar dept soft-deleted vía PATCH con `{ deleted_at: null }`

**Estado actual:** `findById()` lanza 404 para soft-deleted. No existe ruta de restauración.

**Decisión pendiente:** ¿Es feature futura (out-of-scope) o requerida?
- Si **futura**: anotá en `apply-progress.md` bajo "Desviaciones aceptadas"
- Si **requerida**: es trabajo nuevo (no-fix)

**Acción:** Andy decide. No te toca a vos.

---

### W3 — Tests 401/403 no en controlador

**Spec S6.1/S6.2:** Validar que GET sin JWT → 401, GET sin permiso → 403

**Estado:** Guards tienen specs propios. Controller no aserta esto a nivel HTTP.

**Aceptable porque:** Guard tests son la fuente de verdad. Controller-level coverage es redundante si guards ya pasen.

**No-bloqueo:** Aceptado como cobertura suficiente.

---

### W4 — E2E test bodies vacíos

**Archivo:** `backend/test/e2e/departments.e2e-spec.ts`  
**Líneas:** 40–127

10 escenarios e2e con cuerpos vacíos, gateados por `RUN_DEPT_E2E=1`. Docker/Testcontainers constraint documentado.

**Aceptable porque:** Es deuda técnica conocida, no regresión.

**No-bloqueo:** Archiva con esta cobertura deferred.

---

## Reparto de trabajo

| Hallazgo | Responsable | Tipo |
|----------|-------------|------|
| C1 | Minimax | Mecánico (remover import) |
| C2 | Minimax | Lógica (query condicional) |
| W1 | Minimax | Documentación (MIGRATION_LOG) |
| W2 | Andy + Arquitecto | Decisión de spec (future vs required) |
| W3 | — | Aceptado, sin acción |
| W4 | — | Deuda técnica, sin acción |

---

## No toques

| Archivo | Motivo |
|---------|--------|
| `backend/src/modules/departments/departments.entity.ts` | Correcto, no cambies |
| `backend/src/modules/departments/departments.module.ts` | Wiring correcto, no toques |
| `database/migrations/0056_departments.sql` | Verificada UP/DOWN, no edites |
| `database/migrations/0057_department_permissions.sql` | Verificada UP/DOWN, no edites |
| `backend/src/modules/departments/departments.controller.spec.ts` (excepto línea 128) | 99% correcto, solo el test de master-filter necesita update |
| `database/rollback/0056_departments.DOWN.sql` | Correcto, no cambies |
| `database/rollback/0057_department_permissions.DOWN.sql` | Correcto, no cambies |

---

## Orden sugerido

Hacé en este orden (lo trivial primero, lo riesgoso al final):

1. **C1 — remover import** (5 min, sin lógica)
2. **W1 — actualizar MIGRATION_LOG** (2 min, documentación)
3. **C2 — repository query condicional** (15 min, lógica sensible)
4. **C2 — controller test master-filter** (5 min, aserciones)
5. **Lint + typecheck + tests** (10 min, verificación)

Después de pasos 1-2, ya deberían pasar lint + typecheck.  
Después del paso 5, todos los tests y gates pasan.

---

## Cómo verificar después de reparar

```bash
cd backend

# Gates
rtk npm run lint
rtk npx tsc -b tsconfig.json --noEmit
rtk jest --testPathPattern='departments'
rtk npm run test:e2e --testNamePattern='departments'

# Todo debe EXIT 0
```

Si algo falla, párate y escribe el error exacto aquí. Auditoía re-verifica post-fix.

---

## Notas

- Estos arreglos no tocan spec.md ni design.md — son implementación.
- Si descubrís inconsistencias entre lo que dice verify-report.md y lo que ves en el código, **párate y escalá**. No intentes intuir.
- Post-fix, sube a rama actual y avisa a Andy. Verificación se re-corre completa.
