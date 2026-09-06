# Archive Report — F2 · Catálogos (sc-304)

**Change**: `2026-08-29-f2-catalogs-crud`
**Archivada**: 2026-09-06
**Veredicto**: PASS en la tercera pasada de `sdd-verify` — 0 CRITICAL, 0 WARNING, 4 SUGGESTION
**Branch**: `brydyan/sc-304/f2-catalogos-ubicaciones-arbol-categorias`
**Suite Final**: 406/406 tests, 59/59 suites (frontend completo con F2 integrado); `npm run build` success

---

## Qué entregó

Implementación de tres catálogos de administración — Ubicaciones, Categorías y Organizaciones — 
contra el backend real (`geo-zones`, `incident-categories`, `organizations`). El trabajo se 
agrupa en F2 porque comparten forma (listado → búsqueda/filtro → CRUD → validación), pero 
Ubicaciones fue sustantivo: tabla jerárquica de cuatro niveles (`Provincia|Cantón|Parroquia|Zona`) 
con expansión y plegado por fila, no una tabla plana.

### Tres catálogos, un patrón

| Catálogo | Modelo | Servicio | Listado | Formulario | Specs |
|---|---|---|---|---|---|
| **Categorías** | `IIncidentCategory` | `incident-category.service.ts` | List + `*hasPermission` | Alta/edición unificadas, 422→campo | 3/3 suites |
| **Organizaciones** | `IOrganization` + `zone_id`/`parent_id` | `organization.service.ts` + `formData()` | Columna Localización, tarjetas | Selector de zona y padre, `null` para "sin" | 3/3 suites |
| **Ubicaciones** | `IGeoZone` + `IGeoZoneNode` | `geo-zone.service.ts` paginado | Árbol expandible, badge por nivel, código monoespaciado | Parent scoped a nivel superior, required según nivel | 6/6 suites (tree + list + form) |

### Núcleo entregable: algoritmo y permutaciones

El patrón uniforme encubre tres tipos de complejidad:

1. **`tree.util.ts`** — La pieza crítica de F2. Función `buildTree()` en dos pasadas: 
   primero vincula por `parent_id`, luego recorre descendentemente desde las raíces para 
   calcular `depth`. Sin este segundo recorrido, la profundidad falla en datos reales donde 
   los hijos llegan antes que los padres. Cubre entrada desordenada, nodos huérfanos y 
   filtro que preserva ancestros (D4).

2. **Búsqueda bifurcada** (D5):
   - Categorías y Organizaciones: `debounceTime(300)` + `distinctUntilChanged()` + `switchMap` 
     hacia el backend. La paginación en servidor es su contraparte.
   - Ubicaciones: filtro en cliente (árbol completo ya en memoria por D3), expande 
     automáticamente los ancestros de cada coincidencia.

3. **Permisos en profundidad** (D6):
   - `*hasPermission` directiva: oculta botones (ergonomía).
   - `permissionGuard` en rutas: bloquea montaje (garantía).
   - Novedad de F2.5.3: el guard espera a que `/auth/me` resuelva antes de decidir, 
     evitando rebotes en refresh.

### Deuda técnica cerrada

Tres defectos encontrados en la revisión post-implementación (tanda F2.5):

| Defecto | Causa | Solución |
|---|---|---|
| **Árbol capado a 100 nodos** | `listAll()` pedía `per_page: 10000` contra `MAX_PAGE_SIZE = 100` | Paginación con `expand`/`reduce` usando `total` |
| **`updated_at` fantasma** | No existe en el wire de `geo-zones`/`organizations` (sin `SELECT`) | Eliminado de interfaces; tarjeta usa `created_at` |
| **Rebote en `permissionGuard`** | Decidía antes de que `/auth/me` hidratara permisos | Espera con `toObservable(settled)` + `take(1)` |

Todos cubiertos por specs nuevos. Tally final: 41 done, 1 partial, 3 reasignados, 0 abiertos.

---

## Deuda que sobrevive al archivado (4 SUGGESTION)

Ninguno toca el código entregado en F2. Todos son opcionales, documentados y no bloqueantes:

### SUGGESTION 1 — Endpoints `/tree` para catálogos

`GeoZoneService.listAll()` y `OrganizationService.listAll()` paginan internamente. 
Si el backend expusiera endpoints `/tree` unpaginados, la lógica se simplificaba. 
No es correctness, es optimización. Fuera del scope de F2.

### SUGGESTION 2 — Flicker visual en `has-permission.directive`

Antes de que `/auth/me` resuelva, la directiva muestra el elemento brevemente (aún 
sin permiso agregado al usuario). El guard lo bloquea en realidad. Puramente cosmético, 
zero riesgo funcional.

### SUGGESTION 3 — Type-hygiene: `zone_id`/`parent_id` en Organizaciones

Backend: `CreateOrganizationDto.zone_id` tipado `string | undefined`, pero 
`UpdateOrganizationDto.zone_id` tipado `string | null | undefined`. Comportamiento 
idéntico en runtime (ambos aceptan `null` por `@IsOptional()`), pero mismatch de 
tipos. Aplica cuando el backend toque la clase DTO, no desde F2.

### SUGGESTION 4 — E2E Catalogs nunca verificado en local

`catalogs-crud.e2e.ts` y `catalogs-permissions.e2e.ts` usan `test.skip(!BASE_URL)` 
(D4 pattern). Localmente saltan 5/5; en CI corren contra backend de staging 
(`.github/workflows/ci.yml:456`). El patrón es correcto; nunca pasaron contra backend real 
en esta máquina. No es blocker (CI los ejecuta), pero vale una validación spot-check en CI 
si alguien quiere belt-and-suspenders.

---

## Handoffs explícitos (3 items fuera de F2)

F2 no arrastras deuda ajena. Tres items presentes en el código que les tocan a otras fases:

### F2.5.9 → `back/2026-09-05-geo-zones-catalog-contract`

**Polígono placeholder fijo** en el alta de Ubicaciones (caja de 1°×1° cerca de Quito).
Presente: `location-form.component.ts` constante `PLACEHOLDER_POLYGON`, comentario explícito 
citando `@IsGeoJsonPolygon()` requerido del DTO.

Problema: sin mapa (F4 no llegó) ni cambio de contrato backend, toda incidencia dentro 
de la caja se rutea a una zona arbitraria (`ST_Contains(...) LIMIT 1` sin `ORDER BY`).

**Propietario verificado**: `back/2026-09-05-geo-zones-catalog-contract/proposal.md` 
§"Hallazgo 2" documenta exactamente este defecto con dos opciones de remediación.

### F2.5.10 → `front/2026-09-03-tool-ci-gates`

**Falta el script `lint` en `frontend/package.json`.**

Presente: `frontend/package.json` lista `ng`, `start`, `build`, `watch`, `test`, `test:e2e`.
No `lint`.

Además: `tsc --noEmit` es un no-op desde siempre: `frontend/tsconfig.json` es *solution* 
(`"files": []`), así que compila la lista vacía y sale 0. Toda verificación de tipos del 
frontend histórica fue un no-op.

**Propietario verificado**: `front/2026-09-03-tool-ci-gates` B.1 ya lo adoptó.

### F2.5.11 → `front/2026-09-03-e2e-test-user-and-credentials`

**Contraseña literal en los e2e de catálogos.**

Presente: `catalogs-crud.e2e.ts` y `catalogs-permissions.e2e.ts` llevan 
`const PASSWORD = 'ChangeMe!Demo2026';` verbatim.

Contra la regla: «contraseña llega por variable de entorno, nunca literal en repo».

**Propietario verificado**: `front/2026-09-03-e2e-test-user-and-credentials/tasks.md` 
§B.9 nombra ambos archivos explícitamente (se añadió al scope porque son posteriores a 
B.3/B.4 que enumeraban solo auth-flow/comment-flow/menu-navigation).

---

## Integración en openspec

**Delta spec**: `openspec/changes/front/2026-08-29-f2-catalogs-crud/specs/frontend-catalogs/spec.md`

Copiado a `openspec/specs/frontend-catalogs/spec.md` (capacidad NUEVA, no existía).

Modelo: capabilidad `frontend-catalogs` documenta el contrato UI compartido por los tres 
catálogos — listado con búsqueda/filtros, formulario, borrado confirmado — más la variante 
árbol de Ubicaciones. Independiente de cambios backend.

---

## Notas históricas

Esta fase tuvo tres pasadas de verificación:

| Pasada | Resultado | Hallazgo clave |
|---|---|---|
| 1 | FAIL | Árbol capado a 100, `updated_at` fantasma, `permissionGuard` rebotaba, specs de tree/location-list faltaban |
| 2 | PASS WITH WARNINGS | 3 warnings (docs con `pais` fake, copy en inglés, location-form spec faltante) + 4 SUGGESTION |
| 3 | PASS | Todas las warnings cerradas, sin regressions, 0 CRITICAL, 0 WARNING, 4 SUGGESTION mantenidas |

**El patrón recurrente**: defectos que pasaban tests con datos ordenados pero fallaban con 
datos reales. Documentado en la sección "Learned" de apply-progress.md y verificable en 
commit history (SC-209 precedente, mismo problema).

---

## Verificación: cifras finales

- **Suite**: 406/406 tests, 59/59 suites (frontend completo, no F2-scoped)
- **Build**: `npm run build` → exit 0, lazy chunks presentes
- **E2E**: `test:e2e` locally 5/5 skipped (sin BASE_URL); en CI corren con backend real
- **Completeness**: 41/45 tasks done (marcadas `[x]`), 1 partial `[~]` (F2.4.4, registra deuda ajena), 3 reasignadas `[→]`, 0 abiertos

---

## Status: Listo para Producción

- ✅ Cero CRITICAL
- ✅ Cero WARNING  
- ⚠️ 4 SUGGESTION (ninguno toca F2, todos opcionales)
- ✅ Scope boundary verificado (Engram #669)
- ✅ Regressions de Pass 1 intactas (tree pagination, updated_at, guard race)
- ✅ Delta spec integrada en openspec
- ✅ Handoffs explícitos a propietarios (3 items)

**Resultado**: F2 — Catálogos está CERRADO y ARCHIVADO.

---

## Observaciones de Engram referenciadas

- **#667** — Pass 3 verify report (full detail)
- **#669** — Scope reassignment decision (3 items handed off)
- **#670** — Adversarial trace of `@IsOptional()` behavior (F2.5.7 analysis)
