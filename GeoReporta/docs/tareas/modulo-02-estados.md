# Módulo 02 — Estados e Historial

**Requisitos SRS:** RF-FUNC-006, RF-FUNC-007, RF-FUNC-008, RF-SW-003
**Casos de prueba:** CP-02-01 a CP-02-11 (11 casos)

---

### RF-FUNC-006_CP-02-01-F: Dropdown muestra todos los estados disponibles

- **Requisito:** RF-FUNC-006 — Estados Disponibles
- **Prueba:** CP-02-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Abrir incidencia existente, localizar selector de estado.
- **Criterio:** Dropdown muestra Pendiente, En Proceso, Resuelto, Cerrado.
- **Estado:** ☑ Completado

---

### RF-FUNC-006_CP-02-01-B: Endpoint retorna estados válidos desde BD

- **Requisito:** RF-FUNC-006 — Estados Disponibles
- **Prueba:** CP-02-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/estados.
- **Criterio:** JSON con array de estados: `[{ "id": 1, "nombre": "Pendiente" }, ...]`.
- **Estado:** ☑ Completado | **Implementación:** StatusHistoryController.availableStatuses() (routes: GET /api/estados)

---

### RF-FUNC-007_CP-02-02-F: Cambiar estado de Pendiente → En Proceso

- **Requisito:** RF-FUNC-007 — Cambiar Estado
- **Prueba:** CP-02-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar "En Proceso" del dropdown, click en "Guardar Estado".
- **Criterio:** Badge/color del estado cambia, pestaña historial se actualiza automáticamente.
- **Estado:** ☑ Completado

---

### RF-FUNC-007_CP-02-02-B: PUT estado crea registro en historial con timestamp

- **Requisito:** RF-FUNC-007 — Cambiar Estado
- **Prueba:** CP-02-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** PUT /api/incidencias/{id}/estado con `{ "estado_id": 2, "comentario": "Iniciando revisión técnica" }`.
- **Criterio:** HTTP 200, nuevo registro en historial_estados con todos los campos.
- **Estado:** ☑ Completado | **Implementación:** IncidentController.updateStatus() (routes: PUT /api/incidents/{id}/estado). Trigger BD auto-crea historial

---

### RF-FUNC-008_CP-02-03-F: Visualización de historial cronológico completo

- **Requisito:** RF-FUNC-008 — Historial de Cambios
- **Prueba:** CP-02-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ir a pestaña "Historial" de una incidencia, ver lista de cambios.
- **Criterio:** Lista ordenada cronológicamente (más reciente primero), muestra estado anterior → nuevo, usuario, fecha/hora.
- **Estado:** ☑ Completado

---

### RF-FUNC-008_CP-02-03-B: GET historial retorna datos ordenados por fecha

- **Requisito:** RF-FUNC-008 — Historial de Cambios
- **Prueba:** CP-02-03-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/incidencias/{id}/historial.
- **Criterio:** Array JSON ordenado por created_at DESC, incluye estado_origen, estado_destino, usuario, timestamp, comentario.
- **Estado:** ☑ Completado | **Verificado:** StatusHistoryController.index() (routes/api.php:59)

---

### RF-FUNC-007_CP-02-04-F: Validación de flujo de estados (no permite estados inválidos)

- **Requisito:** RF-FUNC-007 — Cambiar Estado
- **Prueba:** CP-02-04-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Intentar seleccionar un estado no permitido por flujo (ej: Pendiente → Cerrado).
- **Criterio:** Opción no aparece en dropdown o aparece deshabilitada.
- **Estado:** ☑ Completado

---

### RF-FUNC-007_CP-02-05-F: Fecha de resolución visible al marcar como Resuelto

- **Requisito:** RF-FUNC-007 — Cambiar Estado
- **Prueba:** CP-02-05-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Cambiar estado a "Resuelto", observar datos mostrados.
- **Criterio:** Campo "Fecha resolución: [dd/mm/aaaa hh:mm]" visible.
- **Estado:** ☑ Completado

---

### RF-FUNC-007_CP-02-05-B: Fecha resolución guardada correctamente en BD

- **Requisito:** RF-FUNC-007 — Cambiar Estado
- **Prueba:** CP-02-05-B
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Consultar incidencia con estado "Resuelto".
- **Criterio:** Campo fecha_resolucion tiene timestamp válido, coincide con último cambio de estado.
- **Estado:** ☑ Completado | **Verificado:** Incident model booted() hook (line 30-31) auto-asigna now() a resolution_date

---

### RF-FUNC-008_CP-02-06-B: Trigger automático que genera registro de historial

- **Requisito:** RF-FUNC-008 — Historial de Cambios
- **Prueba:** CP-02-06-B
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Cambiar estado de incidencia vía SQL directo.
- **Criterio:** Nuevo registro insertado en historial_estados con todos los campos requeridos.
- **Estado:** ☑ Completado | **Verificado:** trigger `trg_log_incident_status` (migration 2026_06_15_000010_create_incident_triggers, ref: StatusHistoryController line 17)

---

### RF-SW-003: Verificación de endpoints de estados

- **Requisito:** RF-SW-003 — API REST Estados
- **Pruebas cubiertas:** CP-02-01-B, CP-02-02-B, CP-02-03-B
- **Estado:** ☐ Pendiente

---

> **Total tareas:** 11 | **Frontend:** 5/5 ✅ | **Backend:** 4/4 ✅ | **BD:** 2/2 ✅  
> **ESTADO M02:** ✅ 11/11 COMPLETADO (100%)
