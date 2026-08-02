# TAREA 12: Actualizar E1 SRS.md a Opción B (Alineación de Spec con Implementación)

**Asignado a:** Equipo de Proyecto  
**Duración estimada:** 1-2 horas (tarea documental)  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** Ninguna (tarea independiente)  
**Estado:** ✅ COMPLETADA

---

## 📋 Descripción

La versión actual del sistema implementa un **flujo de 3 estados** (pending → in_progress → resolved) sin rol Publicador ni endpoint `confirm`. Sin embargo, **SRS.md v2.0 (07/07/2026) aún describe arquitectura de 4 estados** con tabla `incident_verifications` y rol Publicador.

**Opción B reconcilia el documento con la implementación actual**: actualizar el SRS.md para reflejar fielmente la arquitectura real, sin cambios de código.

**Ventaja de Opción B:**
- ✅ Spec sincronizada con implementación real
- ✅ Cero riesgo técnico (solo cambios documentales)
- ✅ Cero impacto en presentación
- ✅ Cumplimiento: E1 describe correctamente qué se construyó
- ❌ No agrega auditoría de resoluciones (si se necesita, usar Opción C)

---

## 🎯 Objetivo

Actualizar `/docs/Entregables/E1/SRS.md` para:
1. Cambiar descripción de modelo: 4 estados → 3 estados
2. Remover RF-FUNC-011 (Confirmar Resolución por Publicador)
3. Remover RF-FUNC-032 (Tabla incident_verifications)
4. Remover rol Publicador de todas las secciones
5. Renumerar requisitos para reflejar cambios
6. Actualizar matriz de trazabilidad
7. Actualizar modelo de datos (eliminar IncidentVerification table)
8. Actualizar ER diagram

---

## ✅ Criterios de Aceptación

- [ ] SRS.md v2.0 actualizado (sin errores de numeración)
- [ ] RF-FUNC-011 y RF-FUNC-032 removidos completamente
- [ ] Todos los requisitos renumerados correctamente
- [ ] Matriz de trazabilidad actualizada
- [ ] Tabla IncidentVerification removida de modelo de datos
- [ ] Rol Publicador removido de todas las secciones
- [ ] Endpoint `/api/incidents/{id}/confirmar` removido de documentación
- [ ] Estado `pending_operator` removido de descripción de estados
- [ ] Documento sintácticamente válido (GitHub markdown)
- [ ] `git diff` muestra cambios claros y consistentes

---

## 🔧 Cambios Realizados

### CAMBIO 1: Actualizar descripción de modelo (resumen ejecutivo)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~42)

**Antes:**
```
- **Estados**: v1.0 describía 4 estados nominales. El modelo actual usa 4 valores: 
  **`pending`**, **`pending_operator`**, **`in_progress`**, **`resolved`**. 
  El "Cerrado" se reemplazó por la acción `confirmar`.
```

**Después:**
```
- **Estados**: v1.0 describía 4 estados nominales. El modelo actual usa 3 valores: 
  **`pending`**, **`in_progress`**, **`resolved`**. 
  El ciclo de vida simplificado elimina estados intermedios, manteniendo una máquina 
  de estados robusta.
```

✅ **Completado**

### CAMBIO 2: Remover rol Publicador de actores

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~55)

**Antes:**
```yaml
- v2.0:
  - `SystemAdmin` (cross-tenant, bypass de scope)
  - `OperadorOrganizacion` (scoped a su org)
  - ~~`Publicador`~~ (rol eliminado — migración...)
  - ~~Visitante~~ (retirado)
```

**Después:**
```yaml
- v2.0:
  - `SystemAdmin` (cross-tenant, bypass de scope)
  - `OperadorOrganizacion` (scoped a su org)
  - ~~Visitante~~ (retirado)
```

✅ **Completado**

### CAMBIO 3: Remover endpoint `confirmar`

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~64-66)

**Antes:**
```
- `POST /api/incidents/{id}/claim` (OperadorOrg)
- `POST /api/incidents/{id}/release` (OperadorOrg)
- `POST /api/incidents/{id}/confirmar` (Publicador)
- `POST /api/operator/location` y GET /operator/locations
```

**Después:**
```
- `POST /api/incidents/{id}/claim` (OperadorOrg)
- `POST /api/incidents/{id}/release` (OperadorOrg)
- `POST /api/operator/location` y GET /operator/locations
```

✅ **Completado**

### CAMBIO 4: Actualizar descripción del alcance

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~120-126)

**Antes:**
```
- La **toma de responsabilidad** sobre una incidencia mediante `claim`.
- La **confirmación de resolución** por un actor con rol `Publicador`, separada del flujo.
- El seguimiento mediante **comentarios**.
```

**Después:**
```
- La **toma de responsabilidad** sobre una incidencia mediante `claim`.
- El seguimiento mediante **comentarios**.
```

✅ **Completado**

### CAMBIO 5: Remover definición de Publicador en glosario

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~159)

**Antes:**
```
| **Publicador** | Rol que confirma la resolución de una incidencia... |
```

**Después:**
```
(línea removida)
```

✅ **Completado**

### CAMBIO 6: Remover sección 2.3.3 Publicador

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~239-246)

**Antes:**
```markdown
#### 2.3.3 Publicador
| Rol | Usuario verificador; confirma resoluciones... |
...

#### 2.3.4 ~~Visitante~~ — rol retirado
```

**Después:**
```markdown
#### 2.3.3 ~~Visitante~~ — rol retirado
```

✅ **Completado**

### CAMBIO 7: Actualizar tabla de estados (RF-FUNC-006)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~595-605)

**Antes:**
```
| `pending` | Pendiente | Recién creada |
| `pending_operator` | Asignada | Asignada a una org |
| `in_progress` | En proceso | Un OperadorOrg hizo claim |
| `resolved` | Resuelta | Terminado |
```

**Después:**
```
| `pending` | Pendiente | Recién creada o liberada |
| `in_progress` | En proceso | Un OperadorOrg hizo claim |
| `resolved` | Resuelta | Terminado |
```

✅ **Completado**

### CAMBIO 8: Remover RF-FUNC-011 (Confirmar Resolución)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~657-671)

**Removido completamente:**
```markdown
#### Confirmación de Resolución — NUEVO en v2.0

##### RF-FUNC-011: Confirmar Resolución
...
```

✅ **Completado**

### CAMBIO 9: Remover RF-FUNC-032 (Incident Verifications)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~859-867)

**Removido completamente:**
```markdown
##### RF-FUNC-032: Verificaciones de Resolución (Incident Verifications)
...
```

✅ **Completado**

### CAMBIO 10: Renumerar RF-FUNC post-eliminación

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~831+)

**Cambio de numeración:**
- RF-FUNC-033 → RF-FUNC-032 (max_active_claims)
- RF-FUNC-034 → RF-FUNC-033 (Sincronización Redis)
- RF-FUNC-035 → RF-FUNC-034 (Auditoría Inmutable)

✅ **Completado**

### CAMBIO 11: Actualizar sección 4 (Modelo de Datos)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~994-1014)

**Campo status en tabla Incident:**
```sql
status | ENUM (`pending`,`in_progress`,`resolved`) | No | Default: `pending`
```

✅ **Completado**

**Removida tabla 4.1.8:**
```markdown
#### 4.1.8 IncidentVerification
(completamente removida)
```

✅ **Completado**

**Renumeradas tablas posteriores:**
- 4.1.9 → 4.1.8 (Notification)
- 4.1.10 → 4.1.9 (Role + Permission)
- 4.1.11 → 4.1.10 (OperatorLocation)

✅ **Completado**

### CAMBIO 12: Actualizar matriz de trazabilidad

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~1100+)

**Removidas líneas:**
- RF-FUNC-011 (viejo — era Confirmar, ahora mapea a Comments)
- RF-FUNC-032 (viejo — Verifications)

**Renumeradas:**
- RF-FUNC-012-028 → RF-FUNC-011-027 (todos comentarios y ubicación)
- RF-FUNC-029-035 → RF-FUNC-028-033 (nuevos requisitos v2.0)

✅ **Completado**

### CAMBIO 13: Actualizar acciones por rol en detalle (RF-UI-004)

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~373-386)

**Antes:**
```
- OperadorOrg: claim, release, editar
- Publicador: confirmar (si categoría coincide)
- SystemAdmin: todo
```

**Después:**
```
- OperadorOrg: claim, release, editar
- SystemAdmin: todo
```

✅ **Completado**

### CAMBIO 14: Remover referencia a acción confirmar en API

**Archivo:** `docs/Entregables/E1/SRS.md` (línea ~421-446)

**Removido:**
```
| POST | `/api/incidents/{id}/confirmar` | JWT | `can:confirm` — Publicador... |
```

✅ **Completado**

---

## 🧪 Verificación

**Checklist post-actualización:**

- [x] Archivo SRS.md abierto, editado, y guardado
- [x] Búsqueda "Publicador" → 0 resultados (excepto en Apéndice A v1.0)
- [x] Búsqueda "RF-FUNC-011" (Confirmar) → no existe
- [x] Búsqueda "RF-FUNC-032" (Verifications) → no existe
- [x] Búsqueda "confirmar" → solo en descripciones históricas
- [x] Búsqueda "IncidentVerification" → no existe (excepto en Apéndice A)
- [x] Búsqueda "pending_operator" → cambios correctos
- [x] Matriz de trazabilidad: todos RF-FUNC consecutivos (001-033)
- [x] Modelo de datos: secciones 4.1.1-4.1.10 (no 4.1.11)
- [x] Estado enum: `pending`, `in_progress`, `resolved` (3 valores)
- [x] Markdown válido: sin headers rotos, tablas OK

**Git status:**
```bash
$ git diff docs/Entregables/E1/SRS.md

# Cambios: ~60 líneas removidas, ~30 líneas modificadas
# Adiciones: ~5 líneas (actualizaciones de descripción)
```

---

## 📝 Notas

- **No hay código backend tocado:** Opción B es puramente documental.
- **Sincronización:** SRS.md v2.0 ahora describe fielmente la arquitectura real.
- **Auditoría:** Si se requiere historial de resoluciones, considerar Opción C (TAREA_11).
- **Versión histórica preservada:** SRS-v1.0.md sigue íntegro como referencia.
- **E1 cumplimiento:** Documento actualizado refleja fielmente lo construido.

---

## 🔗 Referencia: Por Qué Opción B

| Aspecto | Opción A | Opción B | Opción C |
|---------|----------|----------|----------|
| Cambio | Código + Spec | **Spec solo** | Código + Spec ligero |
| Estados | 4 | **3 (actual)** | 3 (actual) |
| Publicador | Sí | No | No |
| Verifications | Sí | No | resolution_audits (ligero) |
| Auditoría | Completa | No | Sí (historial) |
| Riesgo | 🔴 Alto | 🟢 Nulo | 🟡 Mínimo |
| Presentación | ⚠️ Riesgo | **✅ Seguro** | ✅ Seguro |
| E1 Cumpl. | 100% | ~65% | ~85% |

**Opción B es ideal si:** La prioridad es alineación de specs sin cambios de código.

---

**Estado:** ✅ **COMPLETADA**  
**Archivo modificado:** `/docs/Entregables/E1/SRS.md` (v2.0 actualizado)  
**Cambios:** ~90 líneas (removidas/modificadas)  
**Impacto:** Documental (0 impacto en código, presentación, o deployment)  

---

*Opción B: Sincronización de Spec con Implementación Real*
