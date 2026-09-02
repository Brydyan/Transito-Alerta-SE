# Tasks: F1 — Alineación de menú y enrutado

**Change**: `2026-08-29-f1-menu-routing-alignment`
**Depende de**: F0 (el sidebar ya renderiza `group`)

> **Defecto confirmado por la auditoría de F0 (2026-09-01) — no es hipotético.**
> `frontend/src/app/core/services/menu.service.ts:45-55`: `transformBackendMenu()` **no
> popula `group`**, y el backend tampoco lo envía (grep en cero sobre `menu-map.ts` y
> `menus.controller.ts`). Hoy, en producción, **todos los items del sidebar renderizan
> sin agrupar**; la agrupación de D4 sólo se ejerce con el `MenuService` mockeado a mano
> de `sidebar.spec.ts`.
>
> F0 entregó un consumidor sin datos — la variante inversa de la trampa «un servicio sin
> consumidor es un contrato sin verificar» que registra `openspec/ROADMAP.md`.
> **F1.1.2 + F1.2.2 + F1.4.2 son la cadena que lo cierra**: sin las tres, el sidebar
> agrupado sigue siendo una función que nadie ejecuta. Verificá contra el backend real,
> no contra el mock del spec.
**Fuente del contrato**: `backend/src/modules/menus/menu-map.ts`,
`frontend/src/app/app.routes.ts`, `docs/mock/01-01`, `02-01`, `05-01`
**Agrupación**: Contrato backend → Servicio → Cliente → Rutas → Tests

> **Nota de TDD** — `openspec/config.yaml` fija `strict_tdd: true` para backend.
> Las tareas de `menus` (F1.1–F1.2) escriben el test antes que la implementación.
> El frontend usa Jest + `@testing-library/angular`; mismo orden.

---

## F1.1 — Contrato de `MenuEntry`

- [ ] **F1.1.1** — Extender `MenuEntry` y `MenuDefinition` en `backend/src/modules/menus/menu-map.ts` con `group?: string` y `order: number` (D3). `order` obligatorio en ambos: opcional reintroduce el orden accidental de `Object.entries()`.
- [ ] **F1.1.2** — Reescribir `MENU_MAP` con las 11 entradas de la tabla D4: claves en español, `route` apuntando a destinos reales o reservados, `group`, `order` en incrementos de 10, e `icon` Lucide.
- [ ] **F1.1.3** — Retirar las entradas `Assignments` y `Comments` (D4): no tienen pantalla en ninguno de los 18 mocks. No tocar sus permisos ni sus endpoints — sólo dejan de aparecer en el menú.

## F1.2 — `MenusService`

- [ ] **F1.2.1** — Escribir primero los specs en `menus.service.spec.ts`: propagación de `group` y `order`, orden ascendente determinista, y omisión de grupos que quedan vacíos tras el filtrado por permisos.
- [ ] **F1.2.2** — Modificar `getMenuForUser()` para emitir `group` y `order` en el `MenuEntry` resultante y ordenar por `order` antes de devolver. El filtrado por `permissions.includes(definition.requires)` no cambia.
- [ ] **F1.2.3** — Verificar con los perfiles del seed: `master` (35 permisos) ve las 11 entradas; `operador_org` (15) ve un subconjunto coherente y sin encabezados huérfanos.

## F1.3 — Test de coherencia (entregable central)

- [ ] **F1.3.1** — Crear `backend/src/modules/menus/menu-map.spec.ts` (D6): declara la lista de rutas hijas de `/app` y afirma que toda `route` de `MENU_MAP` pertenece a ella. Debe fallar hoy con el mapa viejo y pasar con el nuevo.
- [ ] **F1.3.2** — Añadir en la cabecera del spec un comentario que explique por qué la lista se mantiene a mano (no hay import cruzado backend↔frontend) y qué hacer al añadir una ruta.

## F1.4 — Cliente

- [ ] **F1.4.1** — Ampliar el tipo de respuesta de `getMenuFromBackend()` en `frontend/src/app/core/services/menu.service.ts` para incluir `group?` y `order?`.
- [ ] **F1.4.2** — Propagar `group` en `transformBackendMenu()`. Una respuesta sin `group` (backend desfasado) debe transformarse sin lanzar y renderizarse sin encabezado.
- [ ] **F1.4.3** — Spec de `MenuService`: mapeo completo con `group`, y caso de respuesta sin `group`.
- [ ] **F1.4.4** — Revisar `formatRoutes()`: con las rutas nuevas ya sin `/app`, el prefijado sigue siendo correcto y no debe duplicar el segmento.

## F1.5 — Rutas

- [ ] **F1.5.1** — Crear `frontend/src/app/features/placeholder/placeholder.component.ts` (D2) sobre `shared/components/empty-state`, con inputs `title` y `phase`.
- [ ] **F1.5.2** — Registrar en `app.routes.ts` las rutas placeholder `/incidencias` (F3), `/ubicaciones`, `/categorias`, `/organizaciones` (F2), `/inicio`, `/mapa` (F4). Cada una con `data.breadcrumb` y el comentario `// PLACEHOLDER F<n>`.
- [ ] **F1.5.3** — Registrar `/reportar` apuntando al componente ya existente `features/citizen-report/` — hoy es código muerto, sólo alcanzable por import.
- [ ] **F1.5.4** — Eliminar la ruta `path: 'Reportes'` que reapunta al Dashboard: es un duplicado con mayúscula de la sección `reportes` y no lo referencia nada.
- [ ] **F1.5.5** — Confirmar que `/app/reportes/dashboard` y `/app/reportes/listado-clientes` siguen alcanzables aunque no estén en el menú (se accede desde el Dashboard).

## F1.6 — Tests de integración

- [ ] **F1.6.1** — e2e Playwright: autenticado como `master@tase.local`, iterar cada entrada del sidebar, hacer clic y afirmar que la URL resultante **no** monta `ErrorPageComponent`. Es la aserción que corresponde uno a uno con el síntoma reportado.
- [ ] **F1.6.2** — e2e: con un usuario de permisos reducidos (`operador-org-1@tase.local`), afirmar que el menú es un subconjunto y que sigue siendo navegable en su totalidad.
- [ ] **F1.6.3** — Correr `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`, y `pnpm lint && pnpm test` desde `frontend/`.

---

## Definition of Done

- Ninguna entrada del sidebar aterriza en el 404 — verificado por e2e, no a ojo
- `menu-map.spec.ts` en verde y fallando si se desalinea una ruta
- Etiquetas en español; grep sin `Incidents`, `Assignments`, `Comments` en `MENU_MAP`
- `citizen-report` alcanzable por ruta; `path: 'Reportes'` eliminado
- Cada placeholder marcado con `// PLACEHOLDER F<n>` y listado para su fase
- Suites backend y frontend en verde
