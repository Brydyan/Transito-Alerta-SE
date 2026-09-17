# Verify Report: F5 — Menús dinámicos administrables

**Change**: `2026-08-29-f5-dynamic-menus`
**Status**: Verified

## 1. Requirements & Scenarios Verification

### Requirement: Resolución del menú desde base de datos
- **Contrato preservado (D1)**: Verificado. Retorna `{ label, route, icon?, group?, order }` + `children` sin filtrar `parentId` a la red.
- **Filtrado por rol / Sin acceso / Inactiva / Borrada**: Verificado. Usa filtros `can_read`, `is_active`, `deleted_at`.
- **Paridad con MENU_MAP**: Verificado.

### Requirement: Jerarquía padre/hijo
- **Hijos anidados**: Verificado. Se arma el árbol en memoria por `parent_id` (D3).
- **Hijo sin padre inaccesible**: Verificado.
- **Orden**: Por `display_order` ascendente, verificado.
- **Validaciones Ciclo / Autopadre**: Verificadas. Se rechaza con 422.

### Requirement: Matriz de acceso por rol
- **Lectura y escritura independientes / Escritura sin lectura**: Rechazado con 422 en backend y validado en cliente.
- **Roles agrupados**: Matriz en 3 bloques (`platform`, `organization`, `public`), verificado.
- **Migración de roles**: `roles.scope` añadido en migración `0054_dynamic_menus_schema.sql`.

### Requirement: CRUD de opciones de menú
- **CRUD, ruta duplicada, borrado con hijos, borrado lógico, sin permiso**: Implementados y probados. Validaciones arrojan 409 y 403.

### Requirement: Endpoints asociados
- **Asignar, Quitar, Catálogo paginado, Asignación duplicada, Conteo**: Frontend doble panel implementado. Backend paginación probada. Asignación es idempotente.

### Requirement: Caché de resolución
- **Servido desde caché, Invalidación por escritura, Invalidación por matriz**: Implementado con caché Redis `menu:v1:role:{roleId}` e invalidación correcta.

### Decisiones de producto y UI
- **Sidebar plano**: Implementado.
- **Exclusión anónimo (Q5)**: Cumplido. Anónimo no es parte de la matriz.

## 2. Gates Verification

Gates comprobados con éxito (evidencia 2026-09-14):
- **Backend Lint**: `0 errors` (29 warnings preexistentes).
- **Backend Typecheck**: Clean.
- **Backend Tests**: `118 suites, 1110 tests PASS`.
- **Backend E2E**: `Blocked` by Testcontainers/Ryuk infra. Identificado como problema conocido, no como defecto del código actual.
- **Frontend Tests**: `93 suites, 656 tests PASS`.
- **Frontend Build**: `Exit 0`, OK.

## 3. Open Findings (Follow-ups)

Estos descubrimientos se registran como deuda técnica/funcional declarada para fases posteriores. NO bloquean el archivo de este change.

- **[WARNING] Endpoint assigned-panel hydration (F5.6.6)**: `EndpointPickerComponent` no hidrata los endpoints "asignados" al re-seleccionar porque falta un GET `/menu-options/:id/endpoints`. Sólo existe el POST de asignación.
- **[WARNING] Sidebar link to `/app/controles` (F5.6.7)**: Existe la ruta y el guard en frontend, pero falta la fila en el seed (migración `0056` pendiente) para que aparezca en el sidebar de navegación.
- **[SUGGESTION] Delete confirmation (UX)**: El borrado de menús ocurre directo, sin advertencia. Se recomienda estandarizar con el patrón `ConfirmDialogService` usado en roles.
