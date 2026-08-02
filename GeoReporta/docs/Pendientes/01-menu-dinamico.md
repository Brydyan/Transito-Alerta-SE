# 01 — Conectar el menú dinámico (`menus/my`)

**Tipo:** Integración / eliminar duplicación
**Severidad:** 🔴 Alta
**Backend:** ✅ Implementado · **Frontend:** ✅ Migrado a `/menus/my` (verificado 07/07/2026)

> ✅ **COMPLETADO (verificado 07/07/2026)**
> - Se adoptó la **opción A** del doc: el frontend consume `GET /menus/my`.
> - `frontend/app/shared/menu.service.js` exporta `menuService` y está importado en:
>   - `frontend/app/app-shell/app-shell.component.js` (render del sidebar)
>   - `frontend/app/auth/auth.service.js` (precarga al autenticar)
> - Tests existentes: `menu.service.test.js`, `app-shell.test.js`, `app-shell.snapshot.test.js`.
> - PRs relacionados: #43 (consolidación app-shell), #48 (DB-driven hydration).
> - Ver [`00-INDEX.md`](./00-INDEX.md).

## Problema

Existe un sistema completo de menús dinámicos por permisos en el backend que el
frontend **no consume**. El SPA arma el sidebar a mano en HTML estático con
atributos `data-ln` (gating por rol en cliente).

Consecuencia: dos fuentes de verdad para la navegación. Si se agrega un permiso o
un ítem de menú en la base de datos, el sidebar no cambia. La lógica de
`MenuService` (filtrado por permisos, construcción de árbol) queda muerta.

## Estado actual

**Backend (funcional):**
- `GET /api/menus/my` → `MenuController::myMenus`
- `MenuService::getMyMenus(User)` — admin ve todo; el resto se filtra por
  `role.permissions`, con walk-up de ancestros para armar el árbol.
- Modelos: `Menu`, `MenuPermission`.

**Frontend (hardcodeado):**
- `frontend/app/layout/layout.component.html` — sidebar admin con `<li data-ln="rol1,rol2">`.
- `frontend/app/layout/layout.component.js` — `applyRoleVisibility()` recorre
  `#sidebarnav [data-ln]` y muestra/oculta según el rol del usuario.

## Alcance

- [ ] Crear servicio frontend `menu.service.js` que consuma `GET /menus/my`.
- [ ] Renderizar el sidebar a partir de la respuesta (árbol de menús).
- [ ] Eliminar los `data-ln` estáticos y la lógica `applyRoleVisibility` una vez migrado.
- [ ] Verificar que la forma de la respuesta de `MenuService` incluye: label, icono,
      ruta (`href`), hijos. Ajustar el servicio si falta algún campo para pintar el ítem.
- [ ] Seed de la tabla `menus` con los ítems actuales del sidebar.

## Decisión previa requerida

Antes de implementar, decidir la dirección:

- **A)** Migrar el frontend a `menus/my` (elimina duplicación, fuente única en DB).
- **B)** Borrar `MenuController` + `MenuService` + `Menu` + `MenuPermission` y
  quedarse con el HTML estático (menos flexible, pero menos superficie).

Recomendado: **A** si se espera que roles/permisos cambien en runtime; **B** si el
menú es fijo por diseño.

## Criterios de aceptación

- El sidebar se pinta desde `menus/my`.
- Un usuario sin cierto permiso no recibe ese ítem en la respuesta (no solo oculto por CSS).
- No quedan `data-ln` ni menú duplicado en HTML.

## Archivos afectados

- `backend/app/Domains/Menus/**` (verificar forma de salida)
- `frontend/app/layout/layout.component.{js,html}`
- `frontend/app/layout-usuario/layout-usuario.component.{js,html}`
- Nuevo: `frontend/app/**/menu.service.js`
