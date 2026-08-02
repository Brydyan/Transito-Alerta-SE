# E2: Plan de Mejoras de Calidad — Adaptado a SRS-v3.0

**Documento:** Análisis de Riesgos y Revisión Técnica (E2)  
**Fecha:** 15 de julio de 2026  
**Asignatura:** Calidad de Software  
**Proyecto:** Sistema Web de Gestión de Incidencias Georreferenciadas  
**Estado:** 📋 Documentación (SIN implementación de código — 0 impacto en presentación)  

---

## 📋 Objetivo

Documentar hallazgos técnicos de E2 (6 defectos + riesgos OWASP) y proponer plan de mejoras **adaptado a la realidad implementada en SRS-v3.0**, diferenciando:
- 🔴 **Críticos** — deben corregirse antes de 04 May 2026
- 🟡 **Medianos** — pueden esperar post-presentación
- 🟢 **Bajos** — mejoras futuras

---

## 1. Mapeo: E2 Hallazgos ↔ SRS-v3.0

### 1.1 Estado General vs. SRS-v3.0

| Aspecto | SRS-v3.0 Especifica | Implementación Actual | Brecha |
|---|---|---|---|
| **Estados Incidencia** | 3 (pending, in_progress, resolved) | ✅ Implementado | ✅ Nada |
| **Rol Publicador** | Removido (Opción B) | ✅ No existe | ✅ Nada |
| **Campos titulo/descripcion** | ✅ Requeridos en RF-FUNC-001 | ❌ Tabla NO los tiene | 🔴 **CRÍTICO** |
| **Rate-limiting login** | ✅ Implícito en seguridad | ❌ No implementado | 🔴 **CRÍTICO** |
| **Authorization por recurso** | ✅ RF-FUNC-031 (Scoping) | ⚠️ Solo by role | 🔴 **CRÍTICO** |
| **Password complexity** | ✅ Implícito (seguridad) | ❌ Solo min:8 | 🟡 **MEDIA** |
| **APP_DEBUG deshabilitado** | ✅ Implícito (prod safety) | ❌ DEBUG=true | 🟡 **MEDIA** |
| **Auto-location error handling** | ✅ Robusto (RF-FUNC-031) | ⚠️ Falla silenciosa | 🟡 **MEDIA** |

---

## 2. 🔴 Hallazgos CRÍTICOS (Antes de 04 May 2026)

### H-01: Campos `titulo` / `descripcion` faltantes en tabla `incidents`

**Problema:**  
RF-FUNC-001 especifica que incidencia debe tener `titulo` (max 100) y `descripcion` (max 500). Frontend valida estos campos. Pero tabla `incidents` NO los tiene — desalineación spec/implementación.

**Impacto:**
- Formulario frontend captura datos que backend ignora silenciosamente
- Datos perdidos sin error visible
- Incumplimiento de requisito funcional documentado

**Solución Documentada (sin código):**
```
Acción: Crear migration addTitleDescriptionToIncidents
- Agregar: title VARCHAR(100) NOT NULL
- Agregar: description VARCHAR(500) NOT NULL
- Ejecutar post-E2, pre-presentación
- Validar: StoreIncidentRequest ya tiene reglas; backend ahora las procesa
```

**Estado:** 📋 Documentado, **REQUIERE EJECUCIÓN**

---

### H-02: POST `/api/login` sin rate-limiting → Brute Force

**Problema:**  
Endpoint de autenticación no tiene middleware throttle. Usuario puede intentar ilimitadas contraseñas sin bloqueo.

**Impacto:**
- OWASP: Authentication Failures
- Riesgo crítico en producción
- No documentado en SRS-v3.0 (asumía implementación)

**Solución Documentada:**
```
Acción: Agregar middleware throttle:5,1 a POST /login
- routes/api.php línea ~38:
  Route::middleware('throttle:5,1')->post('/login', [...])
- Limita 5 intentos por minuto por IP
- Devuelve HTTP 429 (Too Many Requests)
```

**Estado:** 📋 Documentado, **REQUIERE EJECUCIÓN**

---

### H-03: JwtAuthenticate autentica pero NO verifica ownership

**Problema:**  
Middleware JwtAuthenticate verifica token válido, pero IncidentController::show() no verifica que incidencia pertenezca al usuario (scope).

**Caso de ataque:**
```
OperadorOrg User A: GET /api/incidents/999
→ Si incident_id=999 existe en User B's org:
   → User A puede ver datos de User B (si no hay otro filtro)
```

**Impacto:**
- OWASP: Broken Access Control (Crítico)
- Vulnerabilidad multitenant
- SRS-v3.0 RF-FUNC-031 requiere scoping automático

**Solución Documentada:**
```
Acción: Implementar Laravel Policy (IncidentPolicy)
- En IncidentController::show():
  $this->authorize('view', $incident);
- IncidentPolicy::view():
  return $incident->organization_id === $user->organization_id
      || $user->is_system_admin;
```

**Estado:** 📋 Documentado, **REQUIERE EJECUCIÓN**

---

## 3. 🟡 Hallazgos MEDIANOS (Post-presentación, antes de producción)

### H-04: Password Complexity insuficiente

**Problema:**  
StoreUserRequest solo valida `min:8`. No requiere mayúsculas, números, símbolos.

**Impacto:**
- OWASP: Weak Authentication
- Contraseña débil: "password" pasa validación
- Riesgo bajo en dev/demo, crítico en prod

**Solución Documentada:**
```
Acción: Actualizar StoreUserRequest password rule
- De: 'password' => 'required|min:8'
- A: 'password' => 'required|min:8|regex:/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'
- Mensaje: "Password debe tener mayúscula, número y símbolo"
- Timeline: Post-presentación (antes de auth.upse.edu.ec)
```

**Estado:** 📋 Documentado

---

### H-05: APP_DEBUG=true expone stack traces

**Problema:**  
.env desarrollo tiene `APP_DEBUG=true`. En producción, errores HTTP muestran rutas de archivos, variables de entorno.

**Impacto:**
- OWASP: Information Disclosure
- Facilita reconnaissance a atacantes
- Baja criticidad si .env se cambia en deploy

**Solución Documentada:**
```
Acción: Validar .env.production
- APP_DEBUG=false
- APP_ENV=production
- Incluir en checklist pre-deploy
- Verificar via GET /api/incidents/invalid → no debe mostrar stack
```

**Estado:** 📋 Documentado

---

### H-06: auto_assign_location() falla silenciosamente

**Problema:**  
Función PL/pgSQL `auto_assign_location()` en trigger intenta asignar `location_id` via ST_Contains, pero falla si no hay polígonos. No registra error, incidencia queda con location_id=NULL.

**Impacto:**
- Incidencia sin ubicación normalizada
- Usuario no sabe por qué
- Riesgo medio (datos incompletos, no quebrada)

**Solución Documentada:**
```
Acción: Mejorar manejo de errores en trigger
- RAISE WARNING 'Location not found for geom: %', NEW.geom;
- Crear tabla geospatial_warnings para auditar casos fallidos
- Post-presentación: revisar polígonos en BD
```

**Estado:** 📋 Documentado

---

## 4. 🟢 Riesgos OWASP Evaluados

| Riesgo OWASP | ¿Existe? | Mitigación | Post-Presentación |
|---|---|---|---|
| **Broken Access Control** | ✅ Sí (H-03) | Implementar Policies | 🔴 CRÍTICO |
| **Auth Failures** | ✅ Sí (H-02, H-04) | Rate-limit + complexity | 🔴 CRÍTICO |
| **Injection** | ❌ No | ORM + Eloquent Spatial | ✅ OK |
| **Security Misconfig** | ✅ Sí (H-05) | Cambiar .env | 🟡 MEDIA |
| **Cryptographic Failures** | 🟢 Bajo | Hash::make + JWT + .env | ✅ OK |

---

## 5. 📊 Resumen de Acciones

### Antes de 04 May 2026 (Presentación)

| # | Hallazgo | Acción | Esfuerzo | Riesgo Código |
|---|---|---|---|---|
| H-01 | Campos titulo/descripcion | Add migration | 30 min | ⬆️ Mínimo |
| H-02 | Rate-limiting login | Add middleware | 15 min | ⬇️ Nulo |
| H-03 | Authorization/Policy | Add Policy class | 45 min | ⬆️ Bajo |
| **TOTAL CRÍTICO** | — | — | **~90 min** | — |

### Después de Presentación (Pre-Producción)

| # | Hallazgo | Acción | Timeline |
|---|---|---|---|
| H-04 | Password complexity | Update validation | Agosto 2026 |
| H-05 | APP_DEBUG deshabilitado | Actualizar .env | Agosto 2026 |
| H-06 | Location error handling | Mejorar trigger | Post-demo |

---

## 6. ✅ Lo que SRS-v3.0 CUMPLE

| Requisito | Estado |
|---|---|
| **3-state workflow** | ✅ Implementado |
| **JWT authentication** | ✅ Implementado |
| **Soft deletes** | ✅ Implementado |
| **PostGIS geospatial** | ✅ Implementado |
| **Triggers auditoría** | ✅ Implementado |
| **Multitenant scoping** | ⚠️ Por role (no por recurso aún) |
| **Validación doble (frontend+backend)** | ⚠️ Parcial (campos titulo/descripcion falta en BD) |

---

## 7. 📅 Plan de Ejecución (Recomendado)

**SEMANA 1 (16-20 julio):**
- ✅ H-01: Ejecutar migration (30 min)
- ✅ H-02: Agregar throttle (15 min)
- ✅ H-03: Crear Policy + registrar (45 min)
- ✅ Testing: Validar cambios no rompen demo

**SEMANA 2-4 (21 julio - 04 mayo):**
- ✅ Completar módulos frontend faltantes (UI)
- ✅ TAREA_01 cache stats
- ✅ Responsive design (TAREA_08-10)

**POST-PRESENTACIÓN (Mayo+):**
- 🟡 H-04, H-05, H-06
- 🟡 Preparar para ambiente `auth.upse.edu.ec`

---

## 8. 📅 Desglose Horario (Semana 1 - CRÍTICOS)

**16-17 julio (Día 1-2):**
```
H-01: Migration (30 min)
  ✓ Crear archivo: database/migrations/XXXX_add_title_description_to_incidents.php
  ✓ Agregar columnas: title VARCHAR(100), description VARCHAR(500)
  ✓ Ejecutar: php artisan migrate
  ✓ Validar: Incidencia nueva guarda título/descripción en BD

H-02: Rate-limiting (15 min)
  ✓ routes/api.php: agregar middleware throttle:5,1 a POST /login
  ✓ Test: 6to intento fallido → HTTP 429
  
H-03: Authorization Policy (45 min)
  ✓ Crear: app/Policies/IncidentPolicy.php
  ✓ Registrar en AuthServiceProvider
  ✓ Agregar authorize('view', $incident) en IncidentController
  ✓ Test: User A no ve datos de User B
  
SUBTOTAL: ~90 min → TODO COMPLETO DÍA 1-2
```

**18-20 julio (Día 3-5):**
- Testing completo (happy path)
- Validar que demo no quebra
- Documento técnico para presentación (8-12 páginas)

---

## 9. ✅ Checklist PRE-DEMO (04 Mayo 2026)

### 72 horas antes (01 Mayo)

- [ ] **H-01 Implementado** — BD: title/description guardadas ✓
- [ ] **H-02 Implementado** — throttle en POST /login activo ✓
- [ ] **H-03 Implementado** — IncidentPolicy + authorize() en controller ✓
- [ ] Backend tests pasan (al menos happy path) ✓
- [ ] Frontend: login → dashboard → listar → crear → detalle fluye OK ✓
- [ ] Mapa interactivo (Leaflet + OpenStreetMap) funciona ✓
- [ ] Filtros (estado, prioridad, ubicación) funcionan ✓
- [ ] Soft deletes funciona ✓
- [ ] Docker compose up sin errores ✓

### 24 horas antes (03 Mayo)

- [ ] Demo script escrito (qué mostrar en 10 minutos)
  ```
  1. Login Google (10 seg)
  2. Dashboard: stats básicos (10 seg)
  3. Crear incidencia: llenar formulario + ubicación en mapa (30 seg)
  4. Listar incidencias: filtrar por estado (20 seg)
  5. Ver detalle: título, descripción, mapa, estado (20 seg)
  6. Explicar arquitectura: DDD backend + triggers (30 seg)
  → TOTAL: ~2-3 minutos = mucho margin para Q&A
  ```
- [ ] Credenciales de prueba listas (systemadmin + operadororg + operadororg otra org)
- [ ] Screenshots capturadas (home, lista, detalle, mapa)
- [ ] Equipo ensayó demo (sin leer)

### DEMO DAY (04 Mayo)

- [ ] Login Google funciona (o usuario/pass de fallback)
- [ ] Crear 1 incidencia "Pozo destapado en Calle X"
- [ ] Cambiar estado: pending → in_progress → resolved
- [ ] Ver detalle: mostrando título, descripción, ubicación en mapa, prioridad
- [ ] Filtrar por estado: solo "pending" aparecen
- [ ] Mostrar DB: SELECT * FROM incidents (título/descripción visibles)
- [ ] Explicar: "Sistema funcional para MVP de gestión de incidencias con georreferenciación"

---

## 10. 🎯 RESUMEN: 3 COSAS SIMPLES

**Si tuvieras que elegir 3 cosas antes de demo:**

| # | Qué | Por qué | Esfuerzo | Riesgo |
|---|---|---|---|---|
| 🔴 **H-01** | Migration title/description | Cumple RF-FUNC-001 (BD = Frontend) | 30 min | Nulo |
| 🔴 **H-02** | Throttle login | Seguridad básica (anti brute-force) | 15 min | Nulo |
| 🔴 **H-03** | IncidentPolicy authorize() | Multitenant seguro (User A ≠ User B) | 45 min | Bajo |
| **TOTAL** | — | Alineación + seguridad crítica | **90 min** | **MÍNIMO** |

**Resultado:** Sistema 40-50% completado. Seguro demostrar sin que quiebre.

---

## 11. 📊 Estado Actual vs. Especificado

| Componente | SRS-v3.0 Dice | Existe en Código | Gap | Acción Pre-Demo |
|---|---|---|---|---|
| **Gestión Incidencias** | CRUD completo | ✅ Endpoints OK | Falta UI botones | No bloquea demo |
| **Estados (3)** | pending → in_progress → resolved | ✅ Triggers OK | Frontend dropdown falta | Demo via API |
| **Título/Descripción** | Required, max 100/500 | ✅ Validación frontend | ❌ BD no guarda | 🔴 **H-01 FIX** |
| **Rate-limiting** | Implícito (seguridad) | ❌ No existe | Sin protección | 🔴 **H-02 FIX** |
| **Autorización** | RF-FUNC-031 scoping | ⚠️ Por role nomás | No hay Policy | 🔴 **H-03 FIX** |
| **Georreferenciación** | PostGIS + Leaflet | ✅ OK | Solo visualización | No bloquea demo |
| **Soft deletes** | Todas entidades | ✅ OK | — | OK |
| **Notificaciones** | Modelo + API | ✅ Endpoints listos | Frontend falta | UI post-demo |
| **Comentarios** | CRUD + modelo | ✅ Endpoints listos | Frontend falta | UI post-demo |

---

## 12. 🚀 Roadmap POST-PRESENTACIÓN (Mayo+)

**INMEDIATO (semana 1 post-demo):**
- [ ] H-04: Password regex complexity (min:8 + mayúscula + número + símbolo)
- [ ] H-05: APP_DEBUG=false en .env.production
- [ ] H-06: Mejorar trigger auto_assign_location (RAISE WARNING + logging)

**SEMANA 2-4 (Mayo-Junio):**
- [ ] UI: Botones Claim/Release en detalle incidencia
- [ ] UI: Dropdown cambiar estado (pending → in_progress → resolved)
- [ ] UI: Formulario comentarios en detalle incidencia
- [ ] UI: Campana notificaciones + centro notificaciones
- [ ] TAREA_01: Cache stats endpoint (si no implementado)
- [ ] TAREA_08-10: Responsive design (tablet/mobile)

**JUNIO+ (antes production auth.upse.edu.ec):**
- [ ] Admin panel: Gestión roles/permisos (UI)
- [ ] Métricas: Dashboard KPIs (tiempo promedio resolución, incidencias por zona)
- [ ] Testing: Suite automatizada Pest (ahora solo manual)
- [ ] Performance: Índices GIST en geometrías, caché Redis optimization

---

## 13. 📄 Documento Técnico para Presentación (8-12 pgs)

**Estructura recomendada:**

```
PORTADA
  Título, asignaturas, equipo, docentes, fecha

1. DESCRIPCIÓN EJECUTIVA (1 pág)
   "Sistema web MVP de gestión de incidencias georreferenciadas.
   Workflow: crear → asignar → resolver. 
   3 estados. Autenticación Google + JWT. DB PostgreSQL + PostGIS."

2. ARQUITECTURA (1 pág)
   Diagrama: Frontend (HTML+Bootstrap+Leaflet) → Backend (Laravel API)
   → DB (PostgreSQL) → Redis (cache/queue) en Docker
   DDD: 13 dominios organizados por subdominios

3. FUNCIONALIDADES IMPLEMENTADAS (2 pgs)
   Tabla checklist:
   ✅ Gestión Incidencias (CRUD)
   ✅ Gestión Estados (3-state workflow)
   ✅ Asignación (claim/release)
   ✅ Comentarios (modelo + API)
   ✅ Ubicación normalizada (País→Provincia→Ciudad)
   ✅ Clasificación (Tipo→Subtipo)
   ✅ Notificaciones (modelo OK, UI pendiente)
   ✅ Prioridad (alta/media/baja)
   ✅ Consultas/Filtros (básicos)

4. MODELO DE DATOS (1 pág)
   Diagrama ER simplificado:
   - incidents (title, description, status, priority, geom, location_id, org_id)
   - locations (hierarchic)
   - incident_categories (type/subtype)
   - users (role, org_id)
   - notifications, comments, etc.

5. INSTRUCCIONES EJECUCIÓN (1 pág)
   ```bash
   docker-compose up
   Frontend: http://localhost:3000
   Backend: http://localhost:8000/api
   Email acceso: demo@example.com
   ```

6. HALLAZGOS DE CALIDAD (E2) (1-2 pgs)
   Tablas: 3 críticos (H-01, H-02, H-03) + plan de fix
   Timeline: semana 1 (90 min) → resueltos antes demo

7. EVIDENCIAS (2 pgs)
   Screenshots:
   - Login Google
   - Dashboard lista incidencias
   - Formulario crear incidencia + mapa
   - Detalle con georreferenciación
   - Filtros funcionando

8. CONCLUSIONES (0.5-1 pág)
   "Proyecto integrador exitoso demostrando integración de:
   - Tecnologías Web (Laravel + HTML5 + Leaflet)
   - Calidad de Software (E1 spec + E2 auditoría)
   - Bases de Datos (PostgreSQL + PostGIS + triggers)
   - Admin DataCenter (Docker + compose + arquitectura)
   MVP listo para producción con mejoras post-presentación."

ANEXOS (opcionales):
  - Código fuente (Git)
  - Casos de prueba detallados (E3+)
  - Logs docker-compose
```

---

## 14. 📝 Notas Finales

**Por qué consolidar E2 + DIAGNÓSTICO ahora:**
- ✅ E2 (ActividadGrupal_E2ARRTP.pdf) requiere documentación FORMAL de hallazgos
- ✅ DIAGNÓSTICO agrega contexto: timeline, checklist, roadmap post-demo
- ✅ Documento consolidado = "respuesta completa" a E2ARRTP
- ✅ Equipo tiene guía clara (qué, cuándo, cuánto riesgo)
- ✅ No rompe presentación (cambios simples, 90 min, low-risk)

**Cómo usar este documento:**

1. **Completar E2ARRTP PDF:**
   - Copiar secciones 1-7 de este archivo
   - Agregar portada + firmas del equipo
   - Incluir screenshots/evidencias
   - Entregar 04 de mayo

2. **Implementar antes de demo:**
   - Usar secciones 8-9 (Timeline + Checklist)
   - Ejecutar H-01 + H-02 + H-03 (90 min)
   - Validar checklist pre-demo

3. **Post-presentación:**
   - Usar sección 12 (Roadmap)
   - Priorizar H-04, H-05, H-06
   - Completar UI faltante

---

## 15. 📊 RESUMEN EJECUCIÓN

**Presente (16-20 julio):**
- ✅ Documentación E2 COMPLETA (este archivo)
- ✅ H-01 migration (30 min)
- ✅ H-02 throttle (15 min)
- ✅ H-03 policy (45 min)
- ✅ Testing + validar demo no quiebra

**Futuro (21 julio - 04 mayo):**
- ✅ UI: Botones claim/release + estado dropdown
- ✅ Módulos frontend faltantes (comentarios, notificaciones)
- ✅ Responsive design

**Post-demo (mayo+):**
- 🟡 H-04, H-05, H-06
- 🟡 Admin panel + métricas
- 🟡 Suite testing

---

**Documento:** E2 Mejoras Adaptadas SRS-v3.0 (CONSOLIDADO)  
**Versión:** 2.0  
**Fecha:** 16 de julio de 2026  
**Estado:** ✅ **COMPLETO** (documento + timeline + checklist)  
**Impacto en Presentación:** ✅ **NULO** (cambios documentados, 90 min de ejecución)  
**Propósito:** Respuesta definitiva a ActividadGrupal_E2ARRTP.pdf

---

*Ciclo QA: E1 ✅ (SRS-v3.0 REALISTA) → E2 ✅ (Este documento) → E3 (Diseño pruebas) → E4 (Ejecución) → E5 (Métricas).*

**¿Comenzamos con H-01 (migration) ahora?**
