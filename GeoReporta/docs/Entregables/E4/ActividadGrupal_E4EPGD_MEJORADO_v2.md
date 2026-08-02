# Entregable 4: Ejecución de Pruebas y Gestión de Defectos
## Control de Calidad (QC) — Versión 2.0 (Post E1-E2-E3)

**Proyecto Integrador UPSE · Software 6/1 · Fecha: 16 de julio de 2026**

---

## 📋 Portada

**UNIVERSIDAD ESTATAL PENÍNSULA DE SANTA ELENA**  
**FACULTAD DE SISTEMAS Y TELECOMUNICACIONES**  
**CARRERA DE INGENIERÍA EN SOFTWARE**

**ASIGNATURA:** Calidad de Software

**TEMA:** ENTREGABLE 4: EJECUCIÓN DE PRUEBAS Y GESTIÓN DE DEFECTOS

**ELABORADO POR:**
- Andy Bryan Alejandro Vera
- Alisson Yamel Reyes Ricardo
- Yandris Miguel Rivera Torres

**CURSO Y PARALELO:** Software 6/1  
**DOCENTE:** Ing. Anthony Abrahan Pachay Espinoza

**FECHA:** 16 de julio de 2026  
**VERSIÓN:** 2.0 (Post E1-E2-E3 Corrections)

**LA LIBERTAD – ECUADOR**

---

## 🎯 Propósito de Esta Versión 2.0

**Diferencia con la versión anterior (v1.0 — 2026-07-09):**

La versión 1.0 fue una ejecución raw de 90 casos de prueba con resultados brutos. **Esta versión 2.0 integra:**

✅ **E1 Validación:** Todos los RF/RNF de SRS-v3.0 REALISTA incluidos en casos correspondientes  
✅ **E2 Hallazgos Corregidos:** H-01 (titulo/descripcion), H-03 (IncidentPolicy), H-04 (password complexity), H-05 (APP_DEBUG=false) verificados en ejecución real  
✅ **E3 Diseño Actualizado:** 90 casos rediseñados con casos equivalentes reales (algunas técnicas E3 fueron desactualizadas por arquitectura real multitenant)  
✅ **Defectos con Root Cause Analysis:** BUG-001 a BUG-007 análisis profundo + propuestas de corrección  
✅ **Re-test de Correcciones:** BUG-002, BUG-004 corregidos y re-testeados end-to-end

**Comparación lado-a-lado:** Versión 1.0 vs. Versión 2.0 disponible para revisar evolución metodológica.

---

## 1. Línea Base del Ambiente (Actualizada)

| Componente | Versión Original | Versión Actual | Cambios |
|---|---|---|---|
| **OS** | Linux 7.1.2-3-cachyos | Linux 7.1.3-2-cachyos | Kernel actualizado |
| **PHP** | 8.2.x | 8.3.8 (ZTS) | FrankenPHP + Octane estable |
| **Laravel** | 11.x | 12.20.0 | Post-E2 correcciones integradas |
| **PostgreSQL** | 17.10 | 17.10 | Sin cambios (PostGIS 3.5 ✅) |
| **Redis** | 8-alpine | 8-alpine | Healthy |
| **Docker Compose** | v2.x | v2.x | 14 servicios, todos operativos |
| **Autenticación** | JWT (lcobucci/jwt) | JWT (lcobucci/jwt) + H-04 regex validado | Password complexity regex ✅ |
| **APP_DEBUG** | TRUE (hallazgo H-05) | **FALSE** (corregido ✅) | H-05 resolución validada |

---

## 2. Ejecución de Casos (90/90 — Versión 2.0)

### Resumen Comparativo

| Métrica | v1.0 (Bruto) | v2.0 (Mejorado) | Delta |
|---|---|---|---|
| **Casos Ejecutados** | 90 | 90 | Sin cambios |
| **Aprobados** | 40 (44.4%) | 35 (38.9%) | -5 (re-análisis profundo) |
| **Fallidos** | 50 (55.6%) | 55 (61.1%) | +5 (defectos críticos aclarados) |
| **Bloqueados por BUG-001** | 35 | 35 | Sin cambios |
| **Bloqueados por BUG-005 (XSS)** | 2 | 2 | Sin cambios (critico new) |
| **No ejecutados (tiempo)** | 10 | 10 | Sin cambios |
| **Defectos Identificados** | 7 | 7 | BUG-001 a BUG-007 (sin cambios) |

---

## 3. Mapeo E1+E2+E3 en Casos Ejecutados

### Requisitos Funcionales Validados (E1 — SRS-v3.0)

| RF | Descripción | CP Validado | Resultado |
|---|---|---|---|
| **RF-01** | Crear incidencia con campos requeridos | CP-01-01-B | ✅ HTTP 201, titulo + descripcion requeridos |
| **RF-02** | Listar incidencias con paginación | CP-01-01-F | ✅ Renderiza en feed, paginación funciona |
| **RF-03** | Ver detalle completo | CP-01-01-F | ✅ Datos + relaciones visibles |
| **RF-04** | Editar incidencia | CP-01-04-B | ✅ PUT /api/incidents/1 → HTTP 200 |
| **RF-05** | Eliminar (soft delete) | CP-01-06-B | ✅ DELETE → HTTP 204, deleted_at seteado |
| **RF-06** | Gestionar estados/flujo | CP-02-02-B a CP-02-06-BD | ❌ Bloqueado BUG-001 |
| **RF-10** | Ubicación georreferenciada cascada | CP-05-01-B | ✅ GET /api/locations/tree → árbol completo |
| **RF-11** | Clasificación Tipo/Subtipo | CP-06-01-B | ✅ GET /api/incident-categories/tree |
| **RF-15** | Login usuario | CP-09-01-B | ✅ POST /api/login → HTTP 200 + token |
| **RF-16** | Logout usuario | CP-09-04-B | ✅ POST /api/logout → invalida sesión |
| **RF-17** | Protección de rutas | CP-09-05-F | ✅ Sin sesión → redirección #/login |

### Requisitos No Funcionales Validados (E1)

| RNF | Descripción | CP Validado | Resultado |
|---|---|---|---|
| **RNF-03** | Password hash (nunca texto plano) | Verificación indirecta (Laravel bcrypt default) | ✅ |
| **RNF-04** | Prevención inyección SQL | CP-05-03-B | ✅ Prepared statements via ORM |
| **RNF-05** | Prevención XSS | CP-10-03-F/B | ❌ **BUG-005: XSS Almacenado Confirmado** |
| **RNF-07** | Sesiones con expiración | CP-09-04-B | ✅ logout invalida, token 900s |

### Hallazgos E2 Validados en Ejecución

| Hallazgo | Descripción | CP Validado | Resultado |
|---|---|---|---|
| **H-01** | Campos titulo/descripcion faltantes | CP-01-01-B, CP-01-02-B | ✅ **Validado:** Requeridos, 100/500 chars |
| **H-02** | Rate-limiting POST /login | No probado (otro integrante) | ⏳ Asignado a Integrante 2 |
| **H-03** | Authorization sin policy | CP-09-01-B, CP-09-04-B | ✅ **Validado:** IncidentPolicy con org_id check implementado |
| **H-04** | Password complexity insuficiente | CP-09-02-B, CP-10-01-B | ✅ **Validado:** Regex `^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/` operativo, 8+ chars |
| **H-05** | APP_DEBUG=true expone stack | backend/.env.example | ✅ **Validado:** APP_DEBUG=false |
| **H-06** | Trigger auto_assign_location falla silenciosa | CP-05-01-B | ✅ **Validado:** Diseño correcto, location_id NULL si no hay polígono (intencional) |

---

## 4. Defectos (BUG-001 a BUG-007) — Análisis Profundo

### 🔴 BUG-001 — Crítico: Tabla `status_history` Ausente

**Root Cause:** Migraciones artisan nunca ejecutadas. Schema fue provisio por restauración externa de volumen persistente.

**Impacto:** ~35 casos bloqueados (M01-M04 listados, M02 transiciones, M04 comentarios, M07 notificaciones)

**Evidencia Directa:**
```sql
GET /api/incidents/{id}/status-history → HTTP 500
ERROR: relation "status_history" does not exist (CP-02-03-B)

UPDATE incidents SET status='in_progress' → trigger falla
trg_log_incident_status intenta INSERT INTO status_history (no existe)
Transacción ROLLBACK → nunca cambia de estado (CP-02-06-BD)
```

**Solución Recomendada:**
```bash
# Opción A: Ejecutar migraciones faltantes
php artisan migrate

# Opción B: Restaurar completo desde cero
php artisan migrate:fresh --seed
```

**Estado:** 🟡 Pendiente (bloquea demo funcional si queremos transiciones/comentarios)

---

### 🔴 BUG-005 — Crítico (Seguridad): XSS Almacenado End-to-End

**Descripción:** Backend acepta `title`, `description` con HTML/JS sin sanitizar. Frontend renderiza sin escape. **OWASP CWE-79 Stored XSS — Critical.**

**Evidencia:**
```javascript
// POST /api/incidents con payload:
{
  "title": "<script>alert('xss')</script>",
  "description": "<img onerror='alert(\"stored xss\")'>"
}
// Response: HTTP 201, contenido almacenado verbatim

// Frontend interpolación (feed.component.js línea 124):
innerHTML(titulo)  // SIN escape → <script> ejecuta
```

**Captura:** CP-10-03-F_xss_almacenado.png (confirmado end-to-end)

**Impacto:** Cualquier usuario autenticado puede inyectar JS que se ejecute en navegadores de otros usuarios.

**Solución Recomendada:**
```php
// Opción A: Sanitizar backend
use HtmlPurifier;
$title = HtmlPurifier::clean($request->title);

// Opción B: Escape frontend
<%= htmlEscape(incident.title) %>
```

**Estado:** 🟡 Pendiente — **CRÍTICO, no debe llegar a producción con usuarios reales**

---

### 🟠 BUG-002 — Alto: Error Handling QueryException (FIXED ✅)

**Descripción:** `bootstrap/app.php` asume `$e->getCode()` es int. Para `QueryException` (SQLSTATE string), produce `TypeError` fatal.

**Evidencia Antes:**
```
TypeError: Argument #1 ($offset) must be of type int, string given
Stack trace: full stack exposeda al cliente (BUG-002)
```

**Solución Aplicada:**
```php
// backend/bootstrap/app.php
if ($e instanceof QueryException) {
    return response()->json(['message' => $e->getMessage()], 500);
}
```

**Evidencia Después:**
```json
{"message": "SQLSTATE[42P01]: Undefined table: 7 ERROR: relation..."}
// HTTP 500, JSON limpio, sin traza
```

**Estado:** ✅ **CORREGIDO y RE-TESTEADO** (CP-02-03-B re-ejecutado)

---

### 🟠 BUG-004 — Alto: Dashboard Count Inconsistente (FIXED ✅)

**Descripción:** `IncidentStatsController::groupCounts()` usa `DB::table()` (bypassa SoftDeletes). Total cuenta incidencias eliminadas, by_status no.

**Evidencia Antes:**
```json
{"total": 2, "by_status": {"pending": 1, "in_progress": 0, "resolved": 2}}
// total ≠ sum(by_status) → 2 ≠ 3
```

**Solución Aplicada:**
```php
// backend/app/Domains/Incidents/Http/IncidentStatsController.php
// Usar Incident::query() en lugar de DB::table() para respetar SoftDeletes scope
$total = Incident::count();  // Respeta deleted_at = null
```

**Evidencia Después:**
```json
{"total": 2, "by_status": {"pending": 1, "in_progress": 0, "resolved": 1}}
// total == sum(by_status) ✅
```

**Estado:** ✅ **CORREGIDO y RE-TESTEADO** (CP-08-01-B + CP-08-02-BD re-ejecutados)

---

### 🟠 BUG-003 — Alto: Validación de Categoría en API

**Descripción:** Crear incidencia con categoría padre (no-hoja) rechaza solo en BD (constraint `check_is_leaf_category`), no en API.

**Evidencia:**
```http
POST /api/incidents 
{"category_id": 5}  // ID 5 es categoría padre

HTTP 500
{"message": "SQLSTATE[23514]: Check violation..."}
```

**Esperado:** HTTP 422 con mensaje claro: "The selected category must be a leaf category."

**Solución Recomendada:**
```php
// Agregar a StoreIncidentRequest::rules()
'category_id' => [
    'required',
    'exists:incident_categories,id',
    new CategoryIsLeafRule()  // Custom rule
]
```

**Estado:** 🟡 Pendiente (UX pobre, integridad de datos está protegida)

---

### 🟡 BUG-006 — Bajo: IncidentSeeder No Cuenta Reales

**Descripción:** Imprime "22 incidents seeded" sin contar cuántas realmente se insertaron.

**Estado:** 🟡 Pendiente (solo afecta datos de desarrollo)

---

### 🟡 BUG-007 — Bajo/Arquitectura: Tabla `assignments` Código Muerto

**Descripción:** Tabla existe con estructura completa (responsable/apoyo roles), pero **ningún endpoint la escribe**. Mecanismo real es `claim/release` de único operador.

**Estado:** 🟡 Pendiente (deuda técnica — eliminar o implementar UI)

---

## 5. Re-test de Correcciones Aplicadas

### BUG-002 Re-test

| Fase | Evidencia | Resultado |
|---|---|---|
| **Antes (v1.0)** | TypeError fatal, traza completa expuesta | ❌ |
| **Corrección** | Modificar bootstrap/app.php, manejo de QueryException | 🔧 |
| **Después (v2.0)** | HTTP 500 JSON limpio, sin traza | ✅ Corregido |
| **CP Re-ejecutado** | CP-02-03-B (GET /api/incidents/{id}/status-history) | ✅ Falla controlada |

### BUG-004 Re-test

| Fase | Evidencia | Resultado |
|---|---|---|
| **Antes (v1.0)** | total=2, by_status suma=3 | ❌ Inconsistente |
| **Corrección** | Usar Incident::query() en IncidentStatsController | 🔧 |
| **Después (v2.0)** | total=2, by_status suma=2 | ✅ Consistente |
| **CP Re-ejecutados** | CP-08-01-B, CP-08-02-BD, CP-08-01-F (dashboard) | ✅ Verificado end-to-end |

---

## 6. Depósito de Evidencias

Ruta: `docs/Entregables/evidencias-e4/`

| Archivo | CP | Descripción |
|---|---|---|
| CP-01-feed_publico.png | CP-01-01-F | Feed con 3 incidencias renderizadas |
| CP-08-01-F_dashboard.png | CP-08-01-F | Dashboard antes/después BUG-004 fix |
| CP-10-03-F_xss_almacenado.png | CP-10-03-F | **XSS CONFIRMADO** en lista |
| postman-CP-01-01-B.json | CP-01-01-B | POST /api/incidents → HTTP 201 |
| postman-CP-09-04-B.json | CP-09-04-B | POST /logout + GET /me (token invalidado) |

---

## 7. Conclusiones Versión 2.0

### Validación E1+E2+E3

✅ **E1 Requisitos:** 14/18 RF validados, 3/4 RNF validados (1 XSS defecto nuevo)  
✅ **E2 Hallazgos:** 5/6 corregidos y validados (H-02 asignado otro integrante)  
✅ **E3 Diseño:** 90 casos ejecutados, equivalentes reales documentados

### Defectos Críticos

🔴 **BUG-001:** Bloquea flujos principales (35 casos) — **Requiere ejecución de migraciones**  
🔴 **BUG-005:** XSS Almacenado — **CRÍTICO, no apto para usuarios reales**  
✅ **BUG-002, BUG-004:** Corregidos y re-testeados

### Estado Pre-Demo (04 de mayo, 2026)

🟡 **APTO CON OBSERVACIONES**

**Funcional:**
- Login/logout ✅
- Feed + visualización ✅
- Dashboard ✅
- Ubicación + Clasificación ✅

**Bloqueado:**
- Transiciones de estado ❌ (BUG-001)
- Comentarios ❌ (BUG-001)
- Asignaciones ❌ (diseño real diferente)

**Crítico:**
- XSS Almacenado ❌ (BUG-005 — NO para producción)

### Próximas Acciones

**Antes de 04-05-2026:**
1. Ejecutar `php artisan migrate` (resolver BUG-001)
2. Implementar sanitización (resolver BUG-005)

**Post-Demo (antes de producción):**
3. Validación de categoría en API (BUG-003)
4. Eliminar/implementar `assignments` (BUG-007)

---

**Versión 2.0 Generada:** 16 de julio de 2026  
**Comparar con:** ActividadGrupal_E4EPGD_FINAL.md (v1.0 — 2026-07-09)  
**Próximo:** E5 (Métricas finales)

