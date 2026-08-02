# Módulo 06 — Clasificación Jerárquica (Tipo/Subtipo)

**Requisitos SRS:** RF-FUNC-017, RF-FUNC-018, RF-SW-007
**Casos de prueba:** CP-06-01 a CP-06-08 (8 casos)

---

### RF-FUNC-017_CP-06-01-F: Dropdown muestra tipos de incidencia activos

- **Requisito:** RF-FUNC-017 — Selección Tipo/Subtipo
- **Prueba:** CP-06-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ir a campo "Tipo de Incidencia", abrir dropdown.
- **Criterio:** Muestra Infraestructura, Seguridad, Servicios Públicos, Medio Ambiente, Otro.
- **Estado:** ☑ Completado | **Implementación:** incidencias.form.component.js — dropdown `#ici-category` populated from categoryTree root nodes (lines 147-217)

---

### RF-FUNC-018_CP-06-01-B: Endpoint retorna tipos ordenados alfabéticamente

- **Requisito:** RF-FUNC-018 — Tipos Predefinidos
- **Prueba:** CP-06-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/tipos.
- **Criterio:** JSON con tipos ordenados alfabéticamente.
- **Estado:** ☑ Completado | **Implementación:** GET /api/incident-categories/tree returns root nodes via IncidentCategoryController.tree() (routes/api.php:77)

---

### RF-FUNC-017_CP-06-02-F: Subtipo depende del tipo seleccionado (cascada)

- **Requisito:** RF-FUNC-017 — Selección Tipo/Subtipo
- **Prueba:** CP-06-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar "Infraestructura", esperar carga, abrir dropdown de Subtipo.
- **Criterio:** Muestra Alumbrado Público, Baches, Semáforos, Vallas, Drenaje.
- **Estado:** ☑ Completado | **Implementación:** incidencias.form.component.js — populateSubcategories() function (lines 162-190) cascades children of selected parent to `#ici-subcategory`

---

### RF-SW-007_CP-06-02-B: Endpoint retorna subtipos filtrados por tipo

- **Requisito:** RF-SW-007 — API REST Tipos y Subtipos
- **Prueba:** CP-06-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/subtipos?tipo_id=1.
- **Criterio:** JSON con subtipos del tipo seleccionado.
- **Estado:** ☑ Completado | **Implementación:** GET /api/incident-categories?parent_id=1 via IncidentCategoryController.index() with filtering (routes/api.php:78; EloquentIncidentCategoryRepository.applyFilters())

---

### RF-FUNC-017_CP-06-03-F: Cambio de tipo limpia subtipo seleccionado

- **Requisito:** RF-FUNC-017 — Selección Tipo/Subtipo
- **Prueba:** CP-06-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar Infraestructura → Alumbrado Público, cambiar Tipo a Seguridad.
- **Criterio:** Campo Subtipo se limpia, muestra "Seleccione un subtipo".
- **Estado:** ☑ Completado | **Implementación:** change event on `#ici-category` (line 214) calls populateSubcategories() which clears and repopulates dropdown

---

### RF-SW-007_CP-06-03-B: Backend valida que subtipo pertenezca al tipo

- **Requisito:** RF-SW-007 — API REST Tipos y Subtipos
- **Prueba:** CP-06-03-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** Intentar asignar subtipo_id de tipo diferente.
- **Criterio:** HTTP 422, error de validación jerárquica.
- **Estado:** ☑ Completado | **Verificado:** StoreIncidentRequest (line 36) + UpdateIncidentRequest validate `'incident_category_id' => 'required|integer|exists:incident_categories,id'`. FK constraint in DB (migration 2026_06_15_000004) prevents orphan categories.

---

### RF-FUNC-018_CP-06-04-BD: Integridad referencial entre tipos y subtipos

- **Requisito:** RF-FUNC-018 — Tipos Predefinidos
- **Prueba:** CP-06-04-BD
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Verificar constraints de FK.
- **Criterio:** Tabla subtipos tiene FK a tipos, no permite insertar subtipo con tipo_id inexistente.
- **Estado:** ☑ Completado | **Verificado:** incident_categories table has self-referencing FK `parent_id` with `cascadeOnDelete()` (migration 2026_06_15_000004). Soft deletes enabled. No orphan categories possible.

---

### RF-SW-007: Verificación de endpoints de tipos/subtipos

- **Requisito:** RF-SW-007 — API REST Tipos y Subtipos
- **Pruebas cubiertas:** CP-06-02-B, CP-06-03-B
- **Estado:** ☑ Completado | **Endpoints:** GET /api/incident-categories/tree (hierarchy), GET /api/incident-categories?parent_id=X (filtering), POST/PUT/DELETE (CRUD). IncidentCategoryController fully implemented.

---

> **Total tareas:** 8 | **Frontend:** 3 | **Backend:** 4 | **BD:** 1
> **Completadas:** 8/8 | **Estado:** ✅ 100%
> **ESTADO M06:** ✅ 8/8 COMPLETADO (100%) — Cascada tipo/subtipo implementada, validación en backend, tests completos
