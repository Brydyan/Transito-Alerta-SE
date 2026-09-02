# Tasks: F5 — Menús dinámicos administrables

**Change**: `2026-08-29-f5-dynamic-menus`
**Depende de**: F0 (primitivos), F1 (contrato `MenuEntry` con `group` y `order`)
**Fuente del contrato**: `docs/mock/05-01`; `backend/src/modules/menus/menu-map.ts`
**Working dir**: `backend` (frontend en F5.6)
**Agrupación**: Migración → Entidades → Resolución → CRUD → Endpoints → Frontend → Tests

> **Strict TDD activo**. Test antes que implementación en todo el backend.
>
> **Orden no negociable**: esquema → migración de datos → **lectura desde base de
> datos con el contrato intacto** → recién entonces CRUD y pantalla. Ésta es la misma
> superficie que F1 acaba de arreglar; validar la lectura antes de construir interfaz
> encima es lo que evita repetir el defecto.

---

## F5.1 — Migración de esquema

- [ ] **F5.1.1** — Reservar numeración en `database/MIGRATION_LOG.md`.
- [ ] **F5.1.2** — Crear `menu_options`: `id` uuid PK, `name`, `route`, `icon` NULL, `parent_id` uuid NULL FK autorreferencia, `display_order` int, `is_active` bool, `deleted_at` timestamptz NULL; índice sobre `(parent_id, display_order)`.
- [ ] **F5.1.3** — Crear `menu_option_roles`: PK compuesta `(menu_option_id, role_id)`, `can_read` bool, `can_write` bool.
- [ ] **F5.1.4** — Crear `api_endpoints`: `id` uuid PK, `method`, `path`, `description`, `UNIQUE (method, path)`.
- [ ] **F5.1.5** — Crear `menu_option_endpoints`: PK compuesta `(menu_option_id, endpoint_id)`.
- [ ] **F5.1.5b** — Añadir `roles.scope varchar(20) NOT NULL DEFAULT 'organization' CHECK (scope IN ('platform','organization','public'))`; luego `UPDATE roles SET scope='platform' WHERE name IN ('master','operador_sistema')` y `UPDATE roles SET scope='public' WHERE name='reporter'` (Q1). **`roles` NO tiene `organization_id`** — verificado contra `0001_initial_schema.sql`: catálogo global con `name` único; `organization_id` vive en `users`. Son **cinco** roles, no cuatro: `reporter` (el ciudadano) se siembra en 0009 y `users.js` no crea ningún usuario con él, por eso pasa desapercibido.
- [ ] **F5.1.6** — Registrar los permisos `READ|CREATE|UPDATE|DELETE menu-options` en el catálogo y asignarlos: lectura a `master` y `operador_sistema`; escritura sólo a `master`.
- [ ] **F5.1.7** — Actualizar `roles.permissions` **y** `users.permissions` de los usuarios preexistentes. Igual que en F4: tocar sólo `roles` deja a los usuarios actuales sin los permisos nuevos.
- [ ] **F5.1.8** — Sembrar `api_endpoints` con las rutas actuales de la aplicación (D5).
- [ ] **F5.1.9** — Añadir las entradas correspondientes a `database/MIGRATION_LOG.md`.

## F5.2 — Migración de datos

- [ ] **F5.2.1** — Trasladar las once entradas de `MENU_MAP` a filas de `menu_options`, preservando `route`, `icon` y `display_order`.
- [ ] **F5.2.2** — Derivar `menu_option_roles` desde el `requires` actual: cada rol que posee ese permiso obtiene `can_read = true`; `can_write` se deriva de si el rol tiene el permiso de escritura del recurso.
- [ ] **F5.2.3** — Mapear el `group` actual (`INCIDENCIAS`, `GESTIÓN`, `CATÁLOGOS`) — decidir en la implementación si se conserva como columna o se deriva de la jerarquía padre/hijo, y documentar la elección.
- [ ] **F5.2.4** — **Conservar `menu-map.ts` en el repositorio** (D7), marcado como origen histórico. Es la vía de reversión si la resolución desde base de datos falla en producción; se elimina en un change posterior.

## F5.3 — Entidades

- [ ] **F5.3.1** — `menu-option.entity.ts`: autorreferencia `parent`/`children`, borrado lógico con `deleted_at` (D6).
- [ ] **F5.3.2** — `menu-option-role.entity.ts`: PK compuesta, borrado físico (D6) — es configuración pura, sin valor histórico.
- [ ] **F5.3.3** — `api-endpoint.entity.ts` y `menu-option-endpoint.entity.ts`.

## F5.4 — Resolución (el tramo de riesgo)

- [ ] **F5.4.1** — Specs primero: filtrado por `can_read`; exclusión de `is_active = false` y `deleted_at` no nulo; orden por `display_order`; **hijo oculto cuando su padre no es accesible**.
- [ ] **F5.4.2** — Reescribir `menus.service.ts` para resolver desde base de datos manteniendo **exactamente** el contrato `{ label, route, icon?, group?, order }` más `children` (D1). No aprovechar la reescritura para cambiar la forma de la respuesta: mezclar cambio de origen con cambio de contrato hace imposible atribuir una regresión.
- [ ] **F5.4.3** — Armar el árbol en memoria por `parent_id` (D3), misma técnica que `tree.util.ts` de F2.
- [ ] **F5.4.4** — **Test de paridad**: tras la migración, la salida de `GET /api/menus/my` para `master@tase.local` coincide con la que producía `MENU_MAP`. Es la aserción central de la fase.
- [ ] **F5.4.5** — Adaptar `menu-map.spec.ts` (D8) para validar las rutas de `menu_options` contra `app.routes.ts`. **No descartarlo**: es la defensa que impide reintroducir el defecto que F1 arregló.
- [ ] **F5.4.6** — Caché `menu:v1:role:{roleId}` con TTL de 1 hora (D4). Anotar en el código que este espacio de claves **no** tiene relación con `perm:v3:uid:*` — confundirlos ya costó depuración en este proyecto.
- [ ] **F5.4.7** — Invalidación de `menu:v1:*` completo ante cualquier escritura de menú.
- [ ] **F5.4.8** — Test de caché: dos lecturas seguidas no repiten consulta; una escritura invalida.

## F5.5 — CRUD y validaciones

- [ ] **F5.5.1** — Specs primero de las validaciones: ciclo ⇒ 422, autopadre ⇒ 422, ruta duplicada ⇒ 409, borrado con hijos ⇒ 409, `can_write` sin `can_read` ⇒ 422.
- [ ] **F5.5.2** — `menu-options.service.ts` con alta, edición, borrado lógico y gestión de la matriz.
- [ ] **F5.5.3** — Validación de ciclos recorriendo la cadena de ancestros **antes de persistir** `parent_id` (D3). Sin ella, un error de escritura cuelga el armado del árbol en cada lectura de menú, para todos los usuarios.
- [ ] **F5.5.4** — `menu-options.controller.ts` con sus guards de permiso; sin permiso ⇒ 403.
- [ ] **F5.5.5** — Matriz de roles agrupada en **tres** bloques por `scope`: plataforma, organización y público. Un rol creado después aparece en su bloque sin acceso, no ausente. **El usuario anónimo no se lista**: no es una fila de `roles`, sus permisos salen de `auth.config.ts` y ese aislamiento es deliberado (Q5).
- [ ] **F5.5.6** — Asignación de endpoints idempotente; catálogo paginado y filtrable por ruta, método o descripción.
- [ ] **F5.5.7** — Test de divergencia del catálogo (D5): la semilla de `api_endpoints` coincide con las rutas registradas; divergencia ⇒ fallo.
- [ ] **F5.5.8** — `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`.

## F5.6 — Frontend (pantalla del mock 05-01)

- [ ] **F5.6.1** — `core/services/menu-option.service.ts`: CRUD, matriz y catálogo de endpoints.
- [ ] **F5.6.2** — `features/admin/menu-options/` con la disposición del mock: árbol a la izquierda, detalle a la derecha.
- [ ] **F5.6.3** — `components/menu-tree/`: árbol con sub-menús anidados y acción «Agregar menú».
- [ ] **F5.6.4** — Formulario de detalle: nombre, orden, ruta, icono, opción padre.
- [ ] **F5.6.5** — `components/role-matrix/`: tabla rol × (lectura, escritura) en dos bloques agrupados. Marcar escritura sin lectura debe impedirse en cliente, además del 422 del servidor.
- [ ] **F5.6.6** — `components/endpoint-picker/`: doble panel disponibles ↔ asignados, con búsqueda en ambos, botones de traslado y conteo de seleccionados.
- [ ] **F5.6.7** — Registrar `/app/controles` en `app.routes.ts` con `permissionGuard` sobre `READ menu-options`.
- [ ] **F5.6.8** — Actualizar `MenuItem.children` en el frontend: deja de ser siempre un arreglo vacío.
- [ ] **F5.6.9** — Specs de componente: árbol renderiza jerarquía, matriz refleja y envía cambios, doble panel mueve en ambos sentidos.

## F5.7 — Cierre

- [ ] **F5.7.1** — e2e del ciclo completo: crear opción → asignar rol con lectura → iniciar sesión con ese rol → la opción aparece en el sidebar y navega. Es el valor entero de la fase en una prueba.
- [ ] **F5.7.2** — e2e de regresión: tras la migración, `master@tase.local` sigue viendo el mismo menú que antes y todas las entradas navegan.
- [ ] **F5.7.3** — Tras desplegar, invalidar `perm:v3:uid:*` (permisos nuevos) **y** `menu:v1:*` (menús). Son dos espacios distintos y hay que vaciar los dos.
- [ ] **F5.7.4** — Suites de backend y frontend en verde.

---

## Definition of Done

- `GET /api/menus/my` resuelve desde base de datos con el contrato de F1 intacto
- Test de paridad en verde: el menú de `master` es idéntico al que producía `MENU_MAP`
- `menu-map.spec.ts` adaptado y en verde — la defensa contra la regresión de F1 sigue viva
- Ciclos y autopadre rechazados antes de persistir
- Matriz rol × lectura/escritura funcionando, con roles agrupados
- Endpoints asignables, con test de divergencia del catálogo
- Caché `menu:v1:*` con invalidación al escribir
- Permisos propagados a `roles.permissions` **y** `users.permissions`
- `menu-map.ts` conservado como vía de reversión
- Suites en verde en ambos proyectos
