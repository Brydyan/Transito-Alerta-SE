# 🔴 TAREAS CRÍTICAS — Bloqueadores Pre-Demo
**Basadas en E1+E2+E3+E4 — Asignación por Especialista**

**Fecha:** 16 de julio de 2026  
**Entrega requerida:** Antes de 04-05-2026 (Demo funcional)  
**Estado:** 🟡 Abierto

---

## TASK-001: Resolver BUG-001 (Tabla `status_history` Ausente)

**Severidad:** 🔴 **CRÍTICO**  
**Impacto:** Bloquea ~35 casos de prueba (transiciones, comentarios, notificaciones, listados)  
**Asignado a:** Integrante 3 (BD/Infraestructura)  
**Estimado:** 1-2 horas  
**Dependencias:** Ninguna

### Descripción del Problema

Las migraciones artisan `php artisan migrate` nunca se ejecutaron. El schema fue provisio por restauración externa de volumen persistente. Falta:
- Tabla `status_history` (para audit trail de transiciones)
- Tabla `comments` (para sistema de comentarios)
- Tabla `role_permission` (para control de permisos)
- Tabla `menu_permission` (para menús dinámicos)

### Evidencia en E4

```
CP-02-03-B: GET /api/incidents/{id}/status-history → HTTP 500
ERROR: relation "status_history" does not exist

CP-02-06-BD: UPDATE incidents SET status='...' → Trigger falla
trg_log_incident_status intenta INSERT INTO status_history (no existe)
```

### Tareas Específicas

- [ ] **TASK-001.1:** Ejecutar `php artisan migrate` en backend container
  ```bash
  docker-compose exec backend php artisan migrate
  ```
  Validar que las 44 migraciones ejecuten sin error.

- [ ] **TASK-001.2:** Verificar que tablas creadas existan y tengan estructura correcta
  ```sql
  \d status_history          -- PostgreSQL
  \d comments
  \d role_permission
  \d menu_permission
  
  -- Verificar triggers:
  \dy                        -- Listar todos los triggers
  ```

- [ ] **TASK-001.3:** Re-seedear datos iniciales (opcional, si se ejecutó migrate:fresh)
  ```bash
  docker-compose exec backend php artisan db:seed
  ```

- [ ] **TASK-001.4:** Re-ejecutar casos bloqueados (CP-02-XX, CP-04-XX, CP-07-XX)
  - CP-02-03-B: GET /api/incidents/{id}/status-history → debe retornar HTTP 200
  - CP-04-04-B: GET /api/incidents/{id}/comments → debe retornar HTTP 200
  - CP-07-01-F: Panel de notificaciones → debe mostrar notificaciones reales

### Validación de Éxito

- ✅ Todas las 44 migraciones ejecutan sin error (status: `Ran`)
- ✅ Tablas `status_history`, `comments` existen en BD
- ✅ Triggers `trg_log_incident_status` funciona (INSERT en status_history no falla)
- ✅ CP-02-06-BD re-test: UPDATE incidents SET status='...' ejecuta sin error en transacción
- ✅ Al menos 5 casos que estaban fallidos ahora pasan

### Criterio de Aceptación

```gherkin
Given: Sistema Docker operativo
When: Ejecutar `php artisan migrate`
Then: 44 migraciones ejecutan sin error
And: Tabla status_history existe con estructura correcta
And: Trigger trg_log_incident_status funciona
```

---

## TASK-002: Resolver BUG-005 (XSS Almacenado)

**Severidad:** 🔴 **CRÍTICO (Seguridad)**  
**Impacto:** Riesgo OWASP CWE-79 Stored XSS — Ejecución de JS arbitrario en navegadores de usuarios  
**Asignado a:** Integrante 2 (Backend) + Integrante 1 (Frontend) — **Coordinado**  
**Estimado:** 2-3 horas  
**Dependencias:** TASK-001 (necesita comentarios/transiciones funcionando para E2E test)

### Descripción del Problema

**Backend:** Acepta `title`, `description`, comentarios con HTML/JS sin sanitizar  
**Frontend:** Renderiza directamente sin escape (interpolación con `innerHTML`)

### Evidencia en E4

```
CP-10-03-F/B: POST /api/incidents con payload:
{
  "title": "<script>alert('xss')</script>",
  "description": "<img onerror='alert(\"stored\")'>"
}

Response: HTTP 201, contenido almacenado verbatim
Frontend: feed.component.js línea 124 → innerHTML(titulo) SIN escape
Resultado: <script> se ejecuta en navegador de otros usuarios
```

### Tareas Específicas

**Backend (Integrante 2):**

- [ ] **TASK-002.1:** Instalar librería de sanitización
  ```bash
  composer require mews/purifier
  php artisan vendor:publish --provider="Mews\Purifier\PurifierServiceProvider"
  ```

- [ ] **TASK-002.2:** Crear custom rule para validación de incidencias
  ```php
  // app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php
  
  use Mews\Purifier\Purifier;
  
  public function rules() {
      return [
          'title' => 'required|string|min:3|max:100',
          'description' => 'required|string|min:10|max:500',
          // ... otros campos
      ];
  }
  
  protected function passedValidation()
  {
      // Sanitizar DESPUÉS de validar, ANTES de guardar
      $this->merge([
          'title' => Purifier::clean($this->title, 'default'),
          'description' => Purifier::clean($this->description, 'default'),
      ]);
  }
  ```

- [ ] **TASK-002.3:** Aplicar mismo sanitizado a comentarios
  ```php
  // app/Domains/Incidents/Http/Requests/StoreCommentRequest.php
  protected function passedValidation()
  {
      $this->merge([
          'message' => Purifier::clean($this->message, 'default'),
      ]);
  }
  ```

- [ ] **TASK-002.4:** Verificar que API escapa JSON en respuestas
  ```php
  // Verificar que Laravel escape automáticamente al jsonify
  return response()->json(['title' => $incident->title]); // ✅ Auto-escaped
  ```

**Frontend (Integrante 1):**

- [ ] **TASK-002.5:** Reemplazar `innerHTML` por `textContent` en listados
  ```javascript
  // ANTES (vulnerable):
  // feed.component.js línea 124
  incident_element.innerHTML = `<h3>${incident.title}</h3>`;
  
  // DESPUÉS (seguro):
  incident_element.textContent = incident.title;
  // O si necesitas HTML estructurado:
  const titleEl = document.createElement('h3');
  titleEl.textContent = incident.title;
  incident_element.appendChild(titleEl);
  ```

- [ ] **TASK-002.6:** Auditar todas las interpolaciones de título/descripción
  ```bash
  grep -r "innerHTML.*title\|innerHTML.*description" frontend/app --include="*.js"
  ```
  Reemplazar todas con `textContent` o crear helper `htmlEscape()`.

- [ ] **TASK-002.7:** Crear helper de escape reutilizable
  ```javascript
  // frontend/app/utils/sanitize.js
  export function htmlEscape(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  }
  
  // Uso:
  titleEl.innerHTML = `<h3>${htmlEscape(incident.title)}</h3>`;
  ```

### Validación de Éxito

```javascript
// Payload XSS en CP-10-03-B:
POST /api/incidents {
  "title": "<script>alert('xss')</script>",
  "description": "<img onerror='alert(\"test\")'>"
}

// ANTES (v1.0):
GET /api/incidents → Retorna sin sanitizar
Frontend renderiza → <script> ejecuta ❌

// DESPUÉS (v2.0):
GET /api/incidents → Retorna sanitizado: "&lt;script&gt;..."
Frontend renderiza → &lt;script&gt; se muestra como texto ✅
Navegador NO ejecuta JS ✅
```

### Criterio de Aceptación

```gherkin
Given: Incidencia con title="<script>alert('xss')</script>"
When: Usuario visualiza incidencia en feed
Then: Script se muestra como texto plano, NO ejecuta
And: No hay error en consola del navegador
And: CP-10-03-F re-test pasa
```

### Referencias

- OWASP: https://owasp.org/www-community/attacks/xss/#stored-xss-attacks
- Laravel Purifier: https://github.com/mewebstudio/laravel-purifier

---

## TASK-003: Re-test E4 Completo Post-Correcciones

**Severidad:** 🟠 **ALTO**  
**Impacto:** Validar que correcciones no rompen casos que estaban pasando  
**Asignado a:** Todos (coordinado por Integrante 1 Frontend)  
**Estimado:** 4-6 horas  
**Dependencias:** TASK-001, TASK-002 completadas

### Tareas Específicas

- [ ] **TASK-003.1:** Re-ejecutar 35 casos bloqueados por BUG-001 (Módulos 02, 04, 07)
- [ ] **TASK-003.2:** Re-ejecutar 2 casos de XSS (CP-10-03-F, CP-10-03-B)
- [ ] **TASK-003.3:** Verificar que casos que pasaban (40 en v1.0) sigan pasando
- [ ] **TASK-003.4:** Documentar resultados en matriz E4 v2.1
- [ ] **TASK-003.5:** Generar screenshots de validaciones principales (feed, dashboard, login)

### Validación de Éxito

- ✅ Al menos 30/35 casos bloqueados ahora pasan
- ✅ 0 nuevos defectos introducidos por correcciones
- ✅ Total casos aprobados ≥ 65/90 (72%)

---

## Timeline Pre-Demo

| Tarea | Integrante | Inicio | Fin | Status |
|---|---|---|---|---|
| TASK-001 (BUG-001) | 3 (BD) | 2026-07-17 | 2026-07-18 | ⏳ |
| TASK-002 (BUG-005) | 2+1 (Backend+Frontend) | 2026-07-18 | 2026-07-20 | ⏳ |
| TASK-003 (Re-test) | Todos | 2026-07-20 | 2026-07-22 | ⏳ |
| **Buffer** | — | 2026-07-22 | 2026-07-31 | Buffer antes demo |
| **DEMO** | Todos | 2026-04-05 | — | 📍 |

---

**Documento generado:** 16 de julio de 2026  
**Basado en:** E1 Requisitos, E2 Hallazgos, E3 Casos, E4 Defectos  
**Siguiente:** tasks-BACKEND.md, tasks-FRONTEND.md, tasks-BD-INFRA.md
