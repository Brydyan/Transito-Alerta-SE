# Tasks: Cobertura de Pruebas Frontend

> **Objetivo global**: Llevar la cobertura de TODOS los archivos en `frontend/js/` a ≥ 95% en 3 fases progresivas (75% → 85% → 95%).
>
> **Exclusión**: El módulo `pages/incidencias/` queda fuera porque está siendo refactorizado en otra rama. No tocar ningún archivo en esa ruta.

---

## FASE 1: Alcanzar ≥ 75% de cobertura global

### T1.1 — Servicios Core (Shared)
- [x] Escribir `shared/services/catalogo.service.test.js` para cubrir todos los métodos (listar, obtener, crear, actualizar, eliminar) con respuestas exitosas y de error.
- [x] Escribir `shared/services/modal.service.test.js` para cubrir apertura, cierre, configuración y eventos de Bootstrap.Modal.
- [x] Escribir `shared/services/toast.service.test.js` para cubrir tipos (success/error/warning), duración y posicionamiento de Bootstrap.Toast.

### T1.2 — Utilidades Shared
- [x] Escribir `shared/constants.test.js` verificando valores de constantes exportadas.
- [x] Escribir `shared/utils/ui-helper.test.js` probando formatos de fecha, normalización de strings y utilerías.
- [x] Escribir `shared/utils/badge-states.test.js` probando mapeo de estados a clases CSS y colores.

### T1.3 — Core básico
- [x] Escribir `core/api.test.js` probando métodos HTTP, manejo de errores de red y códigos de estado.
- [x] Escribir `core/auth.service.test.js` probando login, logout, refresh token, estado de sesión y errores.
- [x] Escribir `core/base-component.test.js` probando ciclo de vida, bindeo de eventos y render condicional.

### T1.4 — Componentes generales simples
- [x] Escribir `components/stats-card.test.js` probando render con datos variados y estado vacío.

### T1.5 — Páginas sin test (prioritarias)
- [x] Escribir `pages/signup/signup.component.test.js` probando validación de formulario, registro exitoso y errores.

### Verificación FASE 1
- [x] Ejecutar `npm run test -- --coverage` y verificar que la cobertura global alcanza ≥ 75%.
- [ ] *Nota: La cobertura global actual es 70.68% (incidencias excluida). FASE 2 debe comenzar para progresar hacia el 85% priorizando targets de alto impacto.*

---

## FASE 2: Alcanzar ≥ 85% de cobertura global

### T2.1 — Core restante
- [ ] Escribir `app.test.js` probando inicialización de módulos y router.
- [ ] Escribir `router.test.js` probando resolución de rutas, redirecciones y control de permisos.
- [ ] Escribir `core/circuit-breaker.test.js` probando estados (open/closed/half-open), fallo y recuperación.

### T2.2 — Shared componentes (custom elements)
- [x] Escribir `shared/components/app-data-table/app-data-table.component.test.js` probando render, paginación, filtros y ordenamiento.
- [x] Escribir `shared/components/modal/modal.component.test.js` probando render del slot y apertura/cierre programático.
- [x] Escribir `shared/components/toast/toast.component.test.js` probando render y autodestrucción.

### T2.3 — Componentes generales restantes
- [x] Escribir `components/sidebar/sidebar.component.test.js` probando render condicional según permisos/roles.
- [x] Escribir `components/navbar/navbar.component.test.js` probando render condicional y menú de usuario.
- [x] Escribir `components/menu-lobby/menu-lobby.component.test.js` probando render condicional según permisos.

### T2.4 — Páginas sin test restantes
- [x] Escribir `pages/auth/activate/activate.component.test.js` probando activación exitosa y con token expirado.
- [x] Escribir `pages/instituciones/components/index/institucion-index.component.test.js` probando listado y CRUD.
- [x] Escribir `pages/instituciones/components/form/institucion-form.component.test.js` probando validación, creación y edición.

### T2.5 — Mejorar tests existentes (< 80%)
- [x] Identificar líneas faltantes en `user-index.component.js` e implementar tests en `user-index.component.test.js`.
- [x] Identificar líneas faltantes en `user-form.component.js` e implementar tests en `user-form.component.test.js`.
- [x] Refactorizar funciones largas en `user-form.component.js` si es necesario (aplicar "divide y vencerás").
- [x] Expandir `ubicaciones-territorios.component.test.js` para cubrir lógica de jerarquía y carga asíncrona.

### Verificación FASE 2
- [ ] Ejecutar `npm run test -- --coverage` y verificar que la cobertura global alcanza ≥ 85%.

---

## FASE 3 (FINAL): Alcanzar ≥ 95% de cobertura global

### T3.1 — Core restante + mascot
- [ ] Escribir `core/echo.test.js` probando suscripción a canales y eventos.
- [ ] Escribir `core/mascot/mascot.component.test.js` probando estados de carga, error y normal.

### T3.2 — Notificaciones
- [ ] Escribir `components/navbar/notification/notification-card.component.test.js`.
- [ ] Escribir `components/navbar/notification/notification-tray.component.test.js`.

### T3.3 — TRP Dashboard
- [ ] Escribir `pages/trp-dashboard/trp-dashboard.component.test.js` probando render condicional según rol.

### T3.4 — Ubicaciones Territorios (refuerzo)
- [ ] Refactorizar `ubicaciones-territorios.component.js` si persisten funciones difíciles de probar.
- [ ] Expandir `ubicaciones-territorios.component.test.js` hasta alcanzar ≥ 95%.

### T3.5 — Verificar y mejorar tests existentes (todos los módulos)
- [ ] Revisar y expandir tests en `pages/login/` para cubrir casos borde.
- [ ] Revisar y expandir tests en `pages/user/services/`.
- [ ] Revisar y expandir tests en `pages/role/` (3 files).
- [ ] Revisar y expandir tests en `pages/permissions/` (3 files).
- [ ] Revisar y expandir tests en `pages/menu-options/` (3 files).
- [ ] Revisar y expandir tests en `pages/instituciones/services/` + `kanban/`.
- [ ] Revisar y expandir tests en `pages/dashboard/` (6 files).
- [ ] Revisar y expandir tests en `pages/categorias/` (2 files).
- [ ] Revisar y expandir tests en `pages/ubicaciones/` restantes (5 files).

### Verificación Final
- [ ] Ejecutar `npm run test -- --coverage` y verificar que TODOS los archivos en `frontend/js/` tienen ≥ 95% de cobertura.
- [ ] Verificar que ningún test existente se haya roto.
- [ ] Verificar que no se hayan introducido code smells (ejecutar linteo si está configurado).
- [ ] Actualizar `feature_list.json` marcando feature 16 como `done`.
