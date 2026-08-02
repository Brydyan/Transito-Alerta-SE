# Módulo 03 — Asignación de Responsables

**Requisitos SRS:** RF-FUNC-009, RF-FUNC-010, RF-FUNC-011, RF-SW-004
**Casos de prueba:** CP-03-01 a CP-03-10 (10 casos)

---

### RF-FUNC-009_CP-03-01-F: Selector de usuarios con búsqueda/filtrado

- **Requisito:** RF-FUNC-009 — Asignar Responsable
- **Prueba:** CP-03-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ir a "Asignar responsable", escribir parte del nombre en campo de búsqueda.
- **Criterio:** Lista muestra únicamente usuarios que contienen "Juan" en nombre o apellido.
- **Estado:** ✅ Implementado

---

### RF-FUNC-009_CP-03-01-B: Endpoint retorna usuarios filtrados por búsqueda

- **Requisito:** RF-FUNC-009 — Asignar Responsable
- **Prueba:** CP-03-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/usuarios?buscar=Juan.
- **Criterio:** JSON con usuarios que coinciden.
- **Estado:** ✅ Implementado

---

### RF-FUNC-009_CP-03-02-F: Asignar un responsable con rol específico

- **Requisito:** RF-FUNC-009 — Asignar Responsable
- **Prueba:** CP-03-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Seleccionar "Juan Pérez", rol "Responsable", click en "Asignar".
- **Criterio:** Badge muestra "Juan Pérez - Responsable" con color/icono diferenciado.
- **Estado:** ✅ Implementado

---

### RF-FUNC-009_CP-03-02-B: Relación guardada en tabla pivote

- **Requisito:** RF-FUNC-009 — Asignar Responsable
- **Prueba:** CP-03-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/incidencias/{id}/responsables.
- **Criterio:** HTTP 200, registro en incidencia_usuario con todos los campos.
- **Estado:** ✅ Implementado

---

### RF-FUNC-010_CP-03-03-F: Asignar múltiples responsables con diferentes roles

- **Requisito:** RF-FUNC-010 — Modificar Asignación
- **Prueba:** CP-03-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Asignar Juan como "Responsable", María como "Apoyo", ver lista.
- **Criterio:** Lista muestra ambos con roles diferenciados: badge verde (Responsable), azul (Apoyo).
- **Estado:** ✅ Implementado

---

### RF-FUNC-010_CP-03-03-B: Múltiples registros en tabla pivote con roles diferentes

- **Requisito:** RF-FUNC-010 — Modificar Asignación
- **Prueba:** CP-03-03-B
- **Capa:** Base de Datos (BD) | **Responsable:** Integrante 3
- **Descripción:** Verificar BD después de múltiples asignaciones.
- **Criterio:** Tabla incidencia_usuario tiene 2 registros con FK correctas.
- **Estado:** ✅ Implementado

---

### RF-FUNC-010_CP-03-04-F: Cambiar rol de responsable existente

- **Requisito:** RF-FUNC-010 — Modificar Asignación
- **Prueba:** CP-03-04-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Cambiar rol de "Juan" de Responsable a Apoyo, guardar.
- **Criterio:** Badge actualizado: "Juan - Apoyo", historial de cambio registrado.
- **Estado:** ✅ Implementado

---

### RF-FUNC-010_CP-03-04-B: PUT actualiza rol en tabla pivote

- **Requisito:** RF-FUNC-010 — Modificar Asignación
- **Prueba:** CP-03-04-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** PUT /api/incidencias/{id}/responsables/{usuario_id} con `{ "rol": "apoyo" }`.
- **Criterio:** HTTP 200, campo rol actualizado, timestamp modificado.
- **Estado:** ✅ Implementado

---

### RF-FUNC-011_CP-03-05-F: Eliminar responsable de incidencia

- **Requisito:** RF-FUNC-011 — Eliminar Responsable
- **Prueba:** CP-03-05-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Click en icono "X" junto a responsable, confirmar eliminación.
- **Criterio:** Responsable removido de la lista, badge desaparece.
- **Estado:** ✅ Implementado

---

### RF-FUNC-011_CP-03-05-B: DELETE remueve relación de tabla pivote

- **Requisito:** RF-FUNC-011 — Eliminar Responsable
- **Prueba:** CP-03-05-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** DELETE /api/incidencias/{id}/responsables/{usuario_id}.
- **Criterio:** HTTP 200, registro eliminado de tabla pivote.
- **Estado:** ✅ Implementado

---

> **Total tareas:** 10 | **Frontend:** 5 | **Backend:** 4 | **BD:** 1
