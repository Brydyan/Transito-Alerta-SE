# Módulo 04 — Sistema de Comentarios

**Requisitos SRS:** RF-FUNC-012, RF-FUNC-013, RF-FUNC-014, RF-SW-005
**Casos de prueba:** CP-04-01 a CP-04-10 (10 casos)

---

### RF-FUNC-012_CP-04-01-F: Agregar comentario con texto válido

- **Requisito:** RF-FUNC-012 — Agregar Comentario
- **Prueba:** CP-04-01-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ir a "Comentarios", escribir texto, click en "Comentar".
- **Criterio:** Comentario aparece con texto, autor, fecha y hora relativa.
- **Estado:** ☑️ Completado

---

### RF-FUNC-012_CP-04-01-B: POST crea comentario con usuario y timestamps

- **Requisito:** RF-FUNC-012 — Agregar Comentario
- **Prueba:** CP-04-01-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST /api/incidents/{id}/comments (ruta corregida).
- **Criterio:** HTTP 201, registro creado en tabla comments con todos los campos.
- **Estado:** ☑️ Completado

---

### RF-FUNC-012_CP-04-02-F: Comentario vacío rechazado en frontend

- **Requisito:** RF-FUNC-012 — Agregar Comentario
- **Prueba:** CP-04-02-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Dejar campo de texto vacío, intentar click en "Comentar".
- **Criterio:** Botón "Comentar" deshabilitado o mensaje de error.
- **Estado:** ☑️ Completado

---

### RF-FUNC-012_CP-04-02-B: Backend rechaza texto vacío con validación

- **Requisito:** RF-FUNC-012 — Agregar Comentario
- **Prueba:** CP-04-02-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** POST con mensaje vacío `{ "message": "" }`.
- **Criterio:** HTTP 422, `"errors": {"message": ["The message field is required"]}` (FormRequest Laravel).
- **Estado:** ☑️ Completado

---

### RF-FUNC-012_CP-04-03-F: Contador de caracteres visible y funcional

- **Requisito:** RF-FUNC-012 — Agregar Comentario
- **Prueba:** CP-04-03-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Escribir texto en textarea, observar contador.
- **Criterio:** Contador muestra "X/5000", cambia en tiempo real, se pone rojo al acercarse al límite (≥80%).
- **Estado:** ☑️ Completado

---

### RF-FUNC-013_CP-04-04-F: Ver comentarios ordenados por fecha (más reciente primero)

- **Requisito:** RF-FUNC-013 — Listar Comentarios
- **Prueba:** CP-04-04-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Agregar comentario A, esperar, agregar B, ver lista.
- **Criterio:** Comentario B aparece primero (más reciente), seguido de A.
- **Estado:** ☑️ Completado

---

### RF-FUNC-013_CP-04-04-B: GET retorna comentarios ordenados por created_at DESC

- **Requisito:** RF-FUNC-013 — Listar Comentarios
- **Prueba:** CP-04-04-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** GET /api/incidents/{id}/comments.
- **Criterio:** Array JSON ordenado por created_at DESC (EloquentCommentRepository::applyFilters).
- **Estado:** ☑️ Completado

---

### RF-FUNC-014_CP-04-05-F: Eliminar propio comentario

- **Requisito:** RF-FUNC-014 — Eliminar Comentario
- **Prueba:** CP-04-05-F
- **Capa:** Frontend (F) | **Responsable:** Integrante 1
- **Descripción:** Ver comentario propio, click en "Eliminar", confirmar.
- **Criterio:** Comentario desaparece de la lista, confirm modal de confirmación.
- **Estado:** ☑️ Completado

---

### RF-FUNC-014_CP-04-05-B: DELETE soft delete del comentario

- **Requisito:** RF-FUNC-014 — Eliminar Comentario
- **Prueba:** CP-04-05-B
- **Capa:** Backend (B) | **Responsable:** Integrante 2
- **Descripción:** DELETE /api/comments/{id}.
- **Criterio:** HTTP 204, campo deleted_at actualizado, comentario no visible en consultas (SoftDeletes trait).
- **Estado:** ☑️ Completado

---

### RF-SW-005: Verificación de endpoints de comentarios

- **Requisito:** RF-SW-005 — API REST Comentarios
- **Pruebas cubiertas:** CP-04-01-B (POST 201), CP-04-02-B (validación 422), CP-04-04-B (GET DESC), CP-04-05-B (DELETE 204)
- **Estado:** ☑️ Completado

---

> **Total tareas:** 10 | **Frontend:** ✅ 5/5 Completado | **Backend:** ✅ 5/5 Completado | **BD:** 0
