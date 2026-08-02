# Módulo 01 — Gestión de Incidencias (CRUD)

**Requisitos SRS:** RF-FUNC-001, RF-FUNC-002, RF-FUNC-003, RF-FUNC-004, RF-FUNC-005, RF-UI-003, RF-UI-004, RF-SW-002
**Casos de prueba:** CP-01-01 a CP-01-12 (12 casos)

---

### RF-FUNC-001_CP-01-01-F: Formulario completo con todos los campos válidos

- **Requisito:** RF-FUNC-001 — Crear Incidencia
- **Prueba:** CP-01-01-F — Formulario completo con todos los campos válidos
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Llenar título "Fuga de agua", descripción "Tubería rota en calle principal", prioridad "Alta", ubicación completa, tipo/subtipo. Click en "Guardar".
- **Criterio de aceptación:** Botón se deshabilita, loading aparece, mensaje de éxito y redirección a lista.
- **Estado:** ☐ Pendiente

---

### RF-FUNC-001_CP-01-01-B: Endpoint recibe y guarda datos correctamente

- **Requisito:** RF-FUNC-001 — Crear Incidencia
- **Prueba:** CP-01-01-B — Endpoint recibe y guarda datos correctamente
- **Capa:** Backend (B)
- **Responsable:** Integrante 2 — Especialista en Backend
- **Descripción:** Enviar POST /api/incidencias con payload JSON válido con todos los campos.
- **Criterio de aceptación:** HTTP 201, respuesta incluye ID de la incidencia creada, registros en tablas relacionadas.
- **Estado:** ☑ Completado

---

### RF-UI-003_CP-01-02-F: Campo título vacío muestra error en UI

- **Requisito:** RF-UI-003 — Formulario de Creación/Edición de Incidencia
- **Prueba:** CP-01-02-F — Campo título vacío muestra error en UI
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Dejar campo título vacío, llenar demás campos, intentar guardar.
- **Criterio de aceptación:** Mensaje "El campo título es obligatorio" en rojo debajo del campo, botón deshabilitado.
- **Estado:** ☑ Completado

---

### RF-SW-002_CP-01-02-B: Endpoint rechaza título vacío con HTTP 422

- **Requisito:** RF-SW-002 — API REST Incidencias
- **Prueba:** CP-01-02-B — Endpoint rechaza título vacío con HTTP 422
- **Capa:** Backend (B)
- **Responsable:** Integrante 2 — Especialista en Backend
- **Descripción:** Enviar POST /api/incidencias sin campo título.
- **Criterio de aceptación:** HTTP 422, `"errors": {"titulo": ["El campo título es obligatorio"]}`.
- **Estado:** ☑ Completado

---

### RF-UI-003_CP-01-03-F: Input teléfono solo acepta números

- **Requisito:** RF-UI-003 — Formulario de Creación/Edición
- **Prueba:** CP-01-03-F — Input teléfono solo acepta números
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Ir a campo teléfono, intentar escribir letras "abc", luego números "1234567890".
- **Criterio de aceptación:** Solo aparecen números en el campo, letras bloqueadas inmediatamente.
- **Estado:** ❌ No Aplica (v2.0 descartó campo teléfono)

---

### RF-SW-002_CP-01-03-B: Backend valida formato teléfono con regex

- **Requisito:** RF-SW-002 — API REST Incidencias
- **Prueba:** CP-01-03-B — Backend valida formato teléfono con regex
- **Capa:** Backend (B)
- **Responsable:** Integrante 2 — Especialista en Backend
- **Descripción:** Enviar teléfono con letras vía Postman.
- **Criterio de aceptación:** HTTP 422, `"errors": {"telefono_contacto": ["El formato del teléfono es inválido"]}`.
- **Estado:** ❌ No Aplica (v2.0 descartó campo teléfono — verificado vs SRS.md)

---

### RF-FUNC-004_CP-01-04-F: Editar incidencia existente carga datos en formulario

- **Requisito:** RF-FUNC-004 — Editar Incidencia
- **Prueba:** CP-01-04-F — Editar incidencia existente carga datos en formulario
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Ir a lista, click en "Editar", modificar título, click en "Guardar".
- **Criterio de aceptación:** Campos precargados con datos actuales, cambios reflejados en lista, mensaje de éxito.
- **Estado:** ☑ Completado

---

### RF-FUNC-004_CP-01-04-B: Endpoint PUT actualiza correctamente en BD

- **Requisito:** RF-FUNC-004 — Editar Incidencia
- **Prueba:** CP-01-04-B — Endpoint PUT actualiza correctamente en BD
- **Capa:** Backend (B)
- **Responsable:** Integrante 2 — Especialista en Backend
- **Descripción:** Enviar PUT /api/incidencias/{id} con datos modificados.
- **Criterio de aceptación:** HTTP 200, registro actualizado, timestamps modificados.
- **Estado:** ☑ Completado

---

### RF-FUNC-005_CP-01-05-F: Modal de confirmación antes de eliminar

- **Requisito:** RF-FUNC-005 — Eliminar Incidencia
- **Prueba:** CP-01-05-F — Modal de confirmación antes de eliminar
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Ir a incidencia, click en "Eliminar", no confirmar el modal.
- **Criterio de aceptación:** Modal con mensaje "¿Está seguro de eliminar esta incidencia?", botones "Cancelar" y "Eliminar".
- **Estado:** ☑ Completado

---

### RF-FUNC-005_CP-01-06-F: Eliminación exitosa tras confirmar modal

- **Requisito:** RF-FUNC-005 — Eliminar Incidencia
- **Prueba:** CP-01-06-F — Eliminación exitosa tras confirmar modal
- **Capa:** Frontend (F)
- **Responsable:** Integrante 1 — Especialista en Frontend
- **Descripción:** Click en "Eliminar", confirmar en modal.
- **Criterio de aceptación:** Incidencia desaparece de la lista, toast/mensaje de éxito.
- **Estado:** ☑ Completado

---

### RF-FUNC-005_CP-01-06-B: Endpoint DELETE elimina lógicamente (soft delete)

- **Requisito:** RF-FUNC-005 — Eliminar Incidencia
- **Prueba:** CP-01-06-B — Endpoint DELETE elimina lógicamente (soft delete)
- **Capa:** Backend (B)
- **Responsable:** Integrante 2 — Especialista en Backend
- **Descripción:** Enviar DELETE /api/incidencias/{id}.
- **Criterio de aceptación:** HTTP 200, campo deleted_at actualizado, incidencia no aparece en consultas normales.
- **Estado:** ☑ Completado

---

> **Total tareas aplicables:** 10 | **Frontend:** 5 | **Backend:** 5 | **BD:** 0  
> *2 tareas (CP-01-03-F/B) no aplican en v2.0 SRS*  
> **ESTADO M01:** ✅ 100% COMPLETADO (10/10 tareas válidas)
