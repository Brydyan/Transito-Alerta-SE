# Bugs e Inconsistencias

Hallazgos del test E2E con Playwright (`frontend/e2e-flujo-incidencia.js`) ejecutado el 2026-07-17.

## Prioridades

| # | Bug | Impacto | Prioridad | Estado |
|---|-----|---------|-----------|--------|
| 1 | `comments.view` faltante en operador | El operador escribe comentarios que no ve | 🔴 Alta | ✅ Corregido |
| 2 | `organization_id` no se asigna al crear incidencia | Ciudadano crea incidencias que nadie puede gestionar | 🔴 Alta | ✅ Corregido |
| 3 | Admin_sistema no puede asignar operadores | El admin global no puede delegar trabajo | 🟡 Media | ✅ Corregido (por B-02) |
| 4 | Race condition en `setupComments()` | El comentario a veces no se envía | 🟡 Media | ✅ Corregido |
| 5 | Leaflet en headless frágil | No se puede testear creación de incidencias vía UI | 🔵 Baja (testing) | ✅ No reproduce |

---

## 🔴 B-01: Falta permiso `comments.view` en rol `operador_organizacion` ✅ CORREGIDO

### Síntoma
El operador escribe un comentario, el backend lo crea (HTTP 201), pero la UI nunca lo muestra.

### Causa
El permiso plano `comments.view` no está asignado al rol `operador_organizacion` en el `RolePermissionSeeder`. El operador tiene `comments.create` y `comments.update`, pero no `comments.view`, por lo que `GET /api/incidents/{id}/comments` responde 403.

### Evidencia
```
POST /comments → 201 (creado)
GET  /comments → 403 (no puede listar)
Error al cargar comentarios: No tenés permiso para realizar esta acción.
```

### Archivos involucrados
- `backend/database/seeders/RolePermissionSeeder.php`

### Solución aplicada
- Agregada línea `['resource' => 'comments', 'action' => 'view']` al array `OPERADOR_ORGANIZACION_PERMISSIONS`.
- Re-ejecutado `RolePermissionSeeder` en el contenedor Docker.
- Verificado: el permiso aparece en `GET /api/permissions/my` del operador.
- Validado con test E2E: "✅ Comentario visible en la lista", sin errores 403.
- Commit: `6f60ac58`

---

## 🔴 B-02: `organization_id` no se asigna automáticamente al crear incidencia ✅ CORREGIDO

### Síntoma
Un ciudadano crea una incidencia con `location_id: 284` (Quito). El backend no asigna `organization_id`, queda `null`. Cuando el admin de GAD Municipal del Cantón Quito (org con `location_id: 284`) intenta ver la incidencia, el backend responde 403.

### Causa
El endpoint `POST /api/incidents` no vinculaba automáticamente la organización basada en la ubicación. Solo asignaba `organization_id` si se enviaba explícitamente. Pero el ciudadano no puede enviar `organization_id` (el frontend no lo manda, y el backend `StoreIncidentRequest::authorize()` lo rechaza para usuarios regulares).

### Evidencia
```
Incidencia #309 creada con location_id=284, organization_id=null
GET /api/incidents/309 con token admin_org_quito → 403
```

### Archivos involucrados
- `backend/app/Domains/Incidents/Http/IncidentController.php`

### Solución aplicada
- Agregada lógica en `IncidentController::store()`: si no se envió `organization_id` pero sí `location_id`, se busca una organización cuyo `location_id` coincida con la ubicación de la incidencia o con alguno de sus ancestros en la jerarquía de ubicaciones.
- Verificado: ciudadano crea incidencia en Quito → `organization_id=1` auto-asignado.
- Verificado con ubicación anidada (Belisario Quevedo → ancestro Quito → GAD Quito).
- Validado con test E2E: flujo ciudadano → admin → operador completo.
- Commit: `108c959b`

---

## 🟡 B-03: Admin_sistema no puede asignar operadores ✅ CORREGIDO (por B-02)

### Síntoma
El admin global (`admin@sistema.com`) entra al detalle de una incidencia, ve el formulario de asignación, pero el dropdown de operadores aparece vacío.

### Causa original
El endpoint `available-operators` filtra operadores por `incident->organization_id`. Antes del B-02, las incidencias creadas por ciudadanos tenían `organization_id = null`, por lo que no se encontraban operadores.

### Solución
El B-02 (auto-asignación de organización) resolvió este bug de raíz: ahora toda incidencia tiene `organization_id`, y el endpoint encuentra operadores sin importar quién hace la consulta.
- Verificado: admin_sistema consulta `available-operators` y recibe 2 operadores de GAD Quito.

---

## 🟡 B-04: Race condition en `setupComments()` ✅ CORREGIDO

### Síntoma
Si el comentario se escribe y el botón se clickea antes de que `setupComments()` termine de inicializar, el evento `submit` del form no se dispara y el comentario no se envía.

### Causa
```js
async function setupComments(incidentId) {
  const user = await auth.me();  // ⏱️ Async antes de attachar listeners
  form.addEventListener('submit', async (e) => { ... });  // 🔗 Listener después
}
```
El `await auth.me()` es asíncrono. Hasta que no resuelve, el `submit` listener no existe. El test de Playwright llena el input y clickea durante esa ventana, el form hace submit nativo sin el handler, y la página se recarga.

### Archivos involucrados
- `frontend/app/incidencias/pages/detail/incidencias.detail.component.js` — función `setupComments`

### Solución aplicada
Movidos todos los `addEventListener` ANTES del `await auth.me()`. Los listeners existen sincrónicamente desde que `setupComments` arranca; `currentUserId` se resuelve después.
- Commit: `93e73ff2`

---

## 🔵 B-05: Leaflet no se inicializa en headless Chromium ✅ NO REPRODUCE

### Síntoma original
El test Playwright no podía probar la creación de incidencias vía UI porque Leaflet no cargaba en modo headless. El contenedor tenía dimensiones pero `.leaflet-container` nunca se agregaba.

### Causa probable
Leaflet se carga dinámicamente desde CDN cuando el SPA monta el componente. Si el contenedor del mapa no es visible aún — por ejemplo si el SPA no terminó de renderizar — `L.map()` falla. En headless esto ocurría más seguido por la falta de frames de animación.

### Resolución
El mecanismo `tryInvalidate` en `init-map-view.js` reintenta hasta 5 veces con `requestAnimationFrame` si el contenedor no es visible. Esto, junto con mejoras en Playwright/Chromium, resolvió el problema.
- Verificado: mapa funciona en headless tanto en creación (`ici-map`, 854×360) como en detalle (`mapa-incidencia`).
- Se mantiene la estrategia de crear incidencias vía API en el setup del test (separa datos de UI, independiente de Leaflet).
