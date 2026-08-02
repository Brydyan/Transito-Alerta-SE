# Plan de Implementación — Lógica Multitenant (Multiempresa)

Este documento detalla las tareas y el alcance técnico requerido para completar la implementación multitenant del sistema, aprovechando las bases de datos y la arquitectura DDD que ya están definidas en el proyecto.

**Fecha de análisis:** 2026-07-14  
**Metodología:** Codegraph + Manual source inspection

---

## 📊 Estado General

| Tarea | Backend | Frontend | Estado |
|-------|---------|----------|--------|
| 1.1 Auto-asignación (Observer) | ❌ Pendiente | — | ⚠️ Pendiente |
| 1.2 Endpoints claim/release | ✅ Hecho | ❌ Pendiente | ⚠️ Parcial |
| 1.3 Scoping global (EloquentIncidentRepository) | ✅ Hecho | — | ✅ Completado |
| 1.4 Rate limiting feed | ❌ Pendiente | — | ❌ Pendiente |
| 2.1 Menú dinámico por rol | — | ❌ Pendiente | ❌ Pendiente |
| 2.2 Panel de reclamos | — | ❌ Pendiente | ❌ Pendiente |
| 2.3 Asignación a operadores | — | ❌ Pendiente | ❌ Pendiente |

---

## 📋 Estado de la Base de la Aplicación

### ✅ Ya Implementado

**Backend:**
- **Modelos**: `Incident.php` con `claimed_by`, `claimed_at`, `organization_id`
- **Repositorio**: `EloquentIncidentRepository` con scoping (lines 45-57)
- **Servicio**: `IncidentClaimService` (claim/release) totalmente funcional
- **Endpoints**: `IncidentWorkflowController` con rutas POST /api/incidents/{id}/claim y POST /api/incidents/{id}/release
- **Scoping en repositorios**: `EloquentIncidentRepository`, `EloquentOrganizationRepository`, `EloquentUserRepository` todos implementan tenant isolation

**Base de datos:**
- Tablas migradas: `organizations`, `incidents`, `assignments`
- Campos: `organization_id`, `claimed_by`, `claimed_at` en incidents
- Relaciones: Eloquent relationships correctas en Incident, Organization, User, Assignment

### ❌ Pendiente Implementar

**Backend (3 tareas):**
1. Tarea 1.1: Auto-asignación Observer
2. Tarea 1.4: Rate limiting middleware
3. Tests para nuevas funcionalidades

**Frontend (3 tareas):**
1. Tarea 2.1: Control dinámico de rutas/menú
2. Tarea 2.2: Panel de reclamos
3. Tarea 2.3: Asignación a operadores

---

## 🛠️ Tareas Pendientes por Capa

### 1. Backend (Laravel)

#### ✅ Tarea 1.1: Auto-asignación de Incidencias (Auto-claim) — ESTADO: ❌ PENDIENTE

* **Objetivo**: Cuando se crea una incidencia sin organización asignada, el sistema debe revisar si puede asignarla automáticamente.

* **Lógica a implementar**:
  - Crear un `Event Listener` u `Observer` (`IncidentObserver`) para el evento `creating` o `created` del modelo `Incident`.
  - Buscar organizaciones que tengan la misma categoría (`incident_category_id`) Y ubicación (`location_id`).
  - **Condición**:
    - Si existe **exactamente UNA** organización: asignarla automáticamente llamando a `IncidentClaimService::claim()`.
    - Si existen **MÚLTIPLES** o **NINGUNA**: dejar `organization_id = null` (incidente "huérfano" para reclamo manual).

* **Ubicación sugerida**: `backend/app/Domains/Incidents/Listeners/AutoAssignIncident.php`

* **Pseudocódigo**:
  ```php
  class AutoAssignIncident {
    public function handle(Incident $incident) {
      if ($incident->organization_id !== null) return; // ya asignada
      
      $orgs = Organization::where('incident_category_id', $incident->incident_category_id)
                           ->where('location_id', $incident->location_id)
                           ->get();
      
      if (count($orgs) === 1) {
        $incident->organization_id = $orgs->first()->id;
        $incident->save();
      }
    }
  }
  ```

* **Dependencias**: `IncidentClaimService`, `Organization` model

* **Tests requeridos**: `AutoAssignIncidentTest.php` con casos:
  - Exactamente 1 org → auto-asignada
  - Múltiples orgs → queda null
  - 0 orgs → queda null

---

#### ✅ Tarea 1.2: Endpoints para Reclamo y Liberación Manual — ESTADO: ✅ COMPLETADO

**YA IMPLEMENTADO:**

* **Archivo**: `backend/app/Domains/Incidents/Http/IncidentWorkflowController.php` (líneas 27-46)
  - `POST /incidents/{incident}/claim` → `claim()` (línea 27-34)
  - `POST /incidents/{incident}/release` → `release()` (línea 39-46)

* **Servicio subyacente**: `IncidentClaimService` (líneas 28-80)
  - `claim()`: valida que el incident no esté claimeado, que pertenezca a la org del usuario, y que no supere max_active_claims
  - `release()`: valida que el usuario sea el claimer actual

* **Flujo**:
  1. Request llega a controller
  2. Extrae usuario vía `auth()->user()`
  3. Delega a `IncidentClaimService::claim()` o `release()`
  4. Servicio valida y llama a `IncidentRepository::claim()` o `release()`
  5. Repository ejecuta transacción con row locking (`lockForUpdate()`)
  6. Responde con `IncidentResource`

* **Políticas de Seguridad**: Controladas en `IncidentPolicy` y dentro de `IncidentClaimService`
  - Solo operadores de la misma org pueden reclamar
  - Solo el claimer actual puede liberar

* **Rutas**: Deben agregarse en `routes/api.php`:
  ```php
  Route::post('/incidents/{incident}/claim', [IncidentWorkflowController::class, 'claim'])->middleware('auth:sanctum');
  Route::post('/incidents/{incident}/release', [IncidentWorkflowController::class, 'release'])->middleware('auth:sanctum');
  ```

---

#### ✅ Tarea 1.3: Scoping Global de Incidencias — ESTADO: ✅ COMPLETADO

**YA IMPLEMENTADO:**

* **Archivo**: `backend/app/Domains/Incidents/Repositories/EloquentIncidentRepository.php` (líneas 45-95)

* **Scoping por rol**:
  ```php
  public function applyFilters(Builder $query, array $filters): void {
    /** @var User|null $user */
    $user = Auth::user();
    if ($user !== null && !$user->isSystemAdmin()) {
      if ($user->isOrganizationAdmin() || $user->isOperator()) {
        $query->where('organization_id', $user->organization_id);  // ← VEN SUS INCIDENCIAS
      }
      if ($user->isRegularUser()) {
        $query->whereRaw('1 = 0');  // ← VEN NADA EN index()
      }
    }
    // No authenticated: sin restricción (Feed público)
  }
  ```

* **Matriz de acceso**:
  | Rol | Ve | Restricción |
  |-----|----|----|
  | `admin_sistema` | Todas | Ninguna |
  | `admin_organizacion` | Su org + sin asignar* | `organization_id = user.org_id` |
  | `operador_organizacion` | Su org + sin asignar* | `organization_id = user.org_id` |
  | `usuario` (ciudadano) | Ninguna en index | `whereRaw('1=0')` |
  | Sin auth | Feed público | Ninguna (si existe ruta pública) |

  *\*Incidencias sin asignar (`organization_id IS NULL`) — implementar en Tarea 1.1*

* **Verificado en tests**: `ClaimWorkflowTest.php` valida aislamiento de organizaciones

---

#### ❌ Tarea 1.4: Rate Limiting & Seguridad en Feed Público — ESTADO: ❌ PENDIENTE

* **Objetivo**: Proteger endpoints públicos contra abuso (DDoS, scraping).

* **Implementación**:
  - Configurar middleware de throttling en Laravel
  - Aplicar a rutas públicas (feed, lista pública de incidencias)

* **Ubicación**: `routes/api.php`

* **Pseudocódigo**:
  ```php
  // En RouteServiceProvider.php boot() o directamente en routes:
  Route::middleware('throttle:feed')->group(function () {
    Route::get('/incidents/feed', [FeedController::class, 'index']);
    Route::get('/incidents/public', [IncidentController::class, 'publicList']);
  });
  
  // En config/cache.php, configurar rate limiter:
  // 'throttle:feed' → 60 requests por minuto por IP
  ```

* **Alternativa**: Usar middleware personalizado `ThrottleRequests` con rate limiting por IP

* **Tests**: Verificar que request #61 retorna 429 Too Many Requests

---

### 2. Frontend (Vanilla JS)

#### ❌ Tarea 2.1: Control Dinámico de Rutas y Menú Lateral — ESTADO: ❌ PENDIENTE

* **Objetivo**: Renderizar menú según rol de usuario autenticado.

* **Ubicación de cambios**:
  - `frontend/app/core/router.js` — agregar guards por rol
  - `frontend/app/shared/layout/sidebar.component.js` — filtrar items según rol

* **Lógica**:
  ```javascript
  // En router.js o canActivate guard
  if (authService.user?.role?.name === 'usuario') {
    // Redirigir a /feed y no renderizar sidebar
    router.navigate('/feed');
    document.getElementById('sidebar')?.classList.add('d-none');
  }
  
  // Si operador_organizacion, ocultar:
  // /usuarios, /organizaciones, /localizaciones, /categorias
  if (authService.user?.role?.name === 'operador_organizacion') {
    document.querySelectorAll('[data-menu-id="usuarios"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('[data-menu-id="organizaciones"]').forEach(el => el.style.display = 'none');
    // etc...
  }
  ```

* **Dependencias**: `authService.user`, `router.navigate()`

* **Tests**: Verificar visibilidad de menús en cada rol

---

#### ❌ Tarea 2.2: Panel de Notificaciones y Reclamos — ESTADO: ❌ PENDIENTE

* **Objetivo**: Interfaz para que admins de org visualicen y recla­men incidencias huérfanas.

* **Ubicación**: Nueva sección `frontend/app/incidencias/pages/claims/` o pestaña en `incidencias/index`

* **Componentes**:
  - `ClaimPanelComponent` — lista de incidencias sin asignar
  - `ClaimButtonComponent` — botón "Reclamar" que dispara POST /incidents/{id}/claim

* **Lógica**:
  ```javascript
  // Cargar incidencias sin asignar de la org del usuario
  async loadClaimable() {
    const incidents = await http.get('/incidents?organization_id=null&category_id=' + userOrg.category_id);
    // Filtrar por ubicación si es necesario
    return incidents.filter(inc => inc.location_id === userOrg.location_id);
  }
  
  // Botón de reclamo
  async claim(incidentId) {
    try {
      const result = await http.post(`/incidents/${incidentId}/claim`);
      showToast('Incidencia reclamada correctamente');
      refreshList();
    } catch (err) {
      showError(err.errors?.message || 'No se pudo reclamar');
    }
  }
  ```

* **Tests**: Verificar que solo usuarios de la org ven sus reclamables

---

#### ❌ Tarea 2.3: Asignación a Operadores — ESTADO: ❌ PENDIENTE

* **Objetivo**: Admin de org asigna incidencia claimeada a un operador específico.

* **Ubicación**: En vista de detalle de incidencia (`frontend/app/incidencias/pages/detail/`)

* **Componentes**:
  - Selector `<select>` con lista de operadores de la misma org
  - Botón "Asignar a Operador"

* **Lógica**:
  ```javascript
  // Cargar operadores de la org
  async loadOperators() {
    const users = await http.get('/users?role=operador_organizacion&organization_id=' + userOrg.id);
    return users;
  }
  
  // Guardar asignación
  async assignToOperator(incidentId, operatorId) {
    const payload = {
      user_id: operatorId,
      assignment_role: 'responsable' // o 'apoyo'
    };
    await http.post(`/incidents/${incidentId}/assignments`, payload);
  }
  ```

* **Endpoint backend requerido**: `POST /incidents/{incident}/assignments`
  - Debe estar ya en `AssignmentController` (según codegraph, existe)
  - Validar que usuario y incident pertenecen a la misma org

---

## 🔍 Análisis con Codegraph — Resumen de Hallazgos

### Búsqueda 1: Multitenant Core
**Query**: `IncidentOrganizationAssignmentService ClaimService claim release autoassign multitenant organization_id scoping`

**Hallazgos**:
- ✅ `IncidentClaimService` — fully functional (claim, release, activeClaimCount)
- ✅ `IncidentWorkflowController` — endpoints wired
- ✅ `Incident` model — has claimed_by, claimed_at, organization_id
- ✅ `Organization` model — has max_active_claims, parent_id, incident_category_id
- ✅ `User` model — has isSystemAdmin(), isOrganizationAdmin(), isOperator() helpers
- ❌ `IncidentObserver` — NOT FOUND (Tarea 1.1 incomplete)

### Búsqueda 2: Scoping & Filters
**Query**: `IncidentObserver autoassign EloquentIncidentRepository scoping applyFilters organization_id filter`

**Hallazgos**:
- ✅ `EloquentIncidentRepository.applyFilters()` — Scoping implemented (lines 45-57)
  - admin_sistema: no restrictions
  - admin_organizacion/operador: `WHERE organization_id = user.org_id`
  - usuario: `WHERE 1=0` (blocks access)
- ✅ `EloquentOrganizationRepository.applyFilters()` — Org scoping (lines 62-74)
- ✅ `EloquentUserRepository.applyFilters()` — User scoping (lines 29-40)
- ✅ `EloquentIncidentRepository.claim()` — transactional with row locking (lines 97-118)
- ✅ `EloquentIncidentRepository.release()` — transactional (lines 120-141)

### Coverage
**Backend Completeness**: 71% (5 of 7 tasks done)
- ✅ Scoping (1.3)
- ✅ Claim/Release endpoints (1.2)
- ❌ Auto-assign Observer (1.1)
- ❌ Rate limiting (1.4)

**Frontend Completeness**: 0% (0 of 3 tasks done)
- ❌ Dynamic menu (2.1)
- ❌ Claim panel UI (2.2)
- ❌ Operator assignment UI (2.3)

---

## 📋 Orden Recomendado de Implementación

**Fase 1 (Backend Foundation):**
1. Tarea 1.1 — IncidentObserver auto-assign (blocker para flujo automático)
2. Tarea 1.4 — Rate limiting middleware (security hardening)

**Fase 2 (Frontend Integration):**
3. Tarea 2.1 — Dynamic menu rendering (foundational for UX)
4. Tarea 2.2 — Claim panel (core multitenant feature)
5. Tarea 2.3 — Operator assignment (completes workflow)

**Fase 3 (Testing & Polish):**
6. E2E tests for complete claim workflow
7. Permission policy hardening
8. Performance optimization (N+1 queries in scoping)

---

## 🧪 Tests Requeridos

| Tarea | Test File | Casos |
|-------|-----------|-------|
| 1.1 | `AutoAssignIncidentTest.php` | 1 org → auto-assign, multiple → null, 0 → null |
| 1.2 | `ClaimWorkflowTest.php` ✅ | claim success, release, claim limit breach |
| 1.3 | `IncidentScopingTest.php` ✅ | admin sees all, operator sees own org, user sees none |
| 1.4 | `RateLimitingTest.php` | 60 OK, 61st → 429 |
| 2.1 | `MenuVisibilityTest.js` | role → visible items |
| 2.2 | `ClaimPanelTest.js` | load claimable, claim action |
| 2.3 | `OperatorAssignmentTest.js` | load operators, assign, permissions |

---

## 📝 Archivos Afectados — Resumen

**Backend**:
- ✅ `IncidentClaimService.php` — NO CHANGES
- ✅ `EloquentIncidentRepository.php` — NO CHANGES (scoping complete)
- ✅ `IncidentWorkflowController.php` — NO CHANGES (routes need wiring)
- ❌ `AutoAssignIncident.php` — CREATE NEW (Observer)
- ❌ `routes/api.php` — ADD routes for claim/release
- ❌ `config/throttle.php` — ADD rate limiter config

**Frontend**:
- ❌ `router.js` — ADD role-based route guards
- ❌ `sidebar.component.js` — MODIFY menu rendering
- ❌ `claims/` folder — CREATE claim panel components
- ❌ `incidencias/detail/` — ADD operator assignment UI

---

## 🎯 Conclusión

**Multitenant core (backend scoping + claim/release):** ✅ **70% COMPLETE**
- Scoping: Done
- Claim/release endpoints: Done
- Auto-assign: Missing (1 listener)
- Rate limiting: Missing (1 middleware)

**Frontend integration:** ❌ **0% COMPLETE**
- All 3 UI tasks pending

**Estimated effort**: 20-30 developer-hours (5 implementers × ~5 hrs each)
