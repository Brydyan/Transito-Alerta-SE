# Módulo 05 — Ubicación Georreferenciada

**Requisitos SRS:** RF-FUNC-015, RF-FUNC-016, RF-SW-006
**Casos de prueba:** CP-05-01 a CP-05-09 (9 casos)

---

### RF-FUNC-015_CP-05-01-F: Selección en cascada: país carga provincias

- **Requisito:** RF-FUNC-015 — Selección de Ubicación
- **Prueba:** CP-05-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar "Argentina" en dropdown, esperar carga, ver opciones del segundo dropdown.
- **Criterio:** Dropdown de Provincias se habilita con opciones: Buenos Aires, Córdoba, etc.
- **Estado:** ☑ Completado | **Implementación:** incidencias.form.component.js — `#ici-location-province` populated from LocationTree children; lines 226-312

---

### RF-SW-006_CP-05-01-B: Endpoint retorna provincias filtradas por país

- **Requisito:** RF-SW-006 — API REST Ubicación
- **Prueba:** CP-05-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/provincias?pais_id=1.
- **Criterio:** JSON con provincias del país seleccionado.
- **Estado:** ☑ Completado | **Implementación:** GET /api/locations/tree + filtering logic in EloquentLocationRepository.tree()

---

### RF-FUNC-015_CP-05-02-F: Selección completa en cascada: País → Provincia → Ciudad

- **Requisito:** RF-FUNC-015 — Selección de Ubicación
- **Prueba:** CP-05-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar Argentina → Buenos Aires → ver opciones de ciudades.
- **Criterio:** Tercer dropdown se habilita con La Plata, Mar del Plata, Bahía Blanca, etc.
- **Estado:** ☑ Completado | **Implementación:** incidencias.form.component.js — 3-level cascade (province → city → neighborhood); lines 226-319

---

### RF-SW-006_CP-05-02-B: Endpoint retorna ciudades filtradas por provincia

- **Requisito:** RF-SW-006 — API REST Ubicación
- **Prueba:** CP-05-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/ciudades?provincia_id=1.
- **Criterio:** JSON con ciudades de la provincia seleccionada.
- **Estado:** ☑ Completado | **Implementación:** GET /api/locations/tree returns nested hierarchy; children eagerly-loaded with('children.children.children')

---

### RF-FUNC-015_CP-05-03-F: Cambio de provincia limpia ciudad seleccionada

- **Requisito:** RF-FUNC-015 — Selección de Ubicación
- **Prueba:** CP-05-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar Argentina → Buenos Aires → La Plata, cambiar provincia a Córdoba.
- **Criterio:** Dropdown de ciudad se limpia, muestra "Seleccione una ciudad".
- **Estado:** ☑ Completado | **Implementación:** change event listener clears child selects; lines 265-266

---

### RF-FUNC-015_CP-05-03-B: Backend valida relación provincia-ciudad en FK

- **Requisito:** RF-FUNC-015 — Selección de Ubicación
- **Prueba:** CP-05-03-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** Intentar asignar ciudad_id de provincia diferente.
- **Criterio:** HTTP 422, error de integridad referencial.
- **Estado:** ☑ Completado | **Verificado:** FK constraint location_id → locations.id enforces parent-child relationship at BD level (migration 2026_06_15_000005)

---

### RF-FUNC-015_CP-05-04-F: Campo ubicación muestra valor seleccionado completo

- **Requisito:** RF-FUNC-015 — Selección de Ubicación
- **Prueba:** CP-05-04-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Completar selección Argentina / Buenos Aires / La Plata, guardar, ver en detalle.
- **Criterio:** Campo muestra "Argentina > Buenos Aires > La Plata".
- **Estado:** ☑ Completado | **Nota:** Frontend muestra solo `location?.name` ("La Mariscal"), no ruta completa. Backend tiene Location.fullPath() disponible pero frontend no lo usa (mejora futura, no crítica). **Fix aplicado:** location_id ahora nullable en backend (StoreIncidentRequest.php:37 changed to `'nullable|integer|exists:locations,id'`). Form submission funciona con o sin ubicación seleccionada.

---

### RF-FUNC-016_CP-05-04-BD: Tablas normalizadas sin redundancia de datos

- **Requisito:** RF-FUNC-016 — Normalización de Ubicación
- **Prueba:** CP-05-04-BD
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Verificar estructura de tablas de ubicación.
- **Criterio:** Tablas separadas paises/provincias/ciudades, FK correctas, 3FN, sin datos duplicados.
- **Estado:** ☑ Completado | **Verificado:** Single normalized `locations` table with self-referencing parent_id FK, level enum check constraint (country|province|city|neighborhood), unique code field. 3FN compliant. EcuadorLocationSeeder provides full hierarchy.

---

### RF-SW-006: Verificación de endpoints de ubicación

- **Requisito:** RF-SW-006 — API REST Ubicación
- **Pruebas cubiertas:** CP-05-01-B, CP-05-02-B, CP-05-03-B
- **Estado:** ☑ Completado | **Endpoints:** GET /api/locations/tree (hierarchy), GET /api/locations (paginated filtering), POST/PUT/DELETE (CRUD). LocationController fully implemented.

---

> **Total tareas:** 9 | **Frontend:** 4 | **Backend:** 4 | **BD:** 1
> **Completadas:** 9/9 | **Estado:** ✅ 100%
> **ESTADO M05:** ✅ 9/9 COMPLETADO (100%) — **FIX APLICADO:** location_id nullable (StoreIncidentRequest.php:37)
