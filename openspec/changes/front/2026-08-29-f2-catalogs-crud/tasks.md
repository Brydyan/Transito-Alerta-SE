# Tasks: F2 — Catálogos

**Change**: `2026-08-29-f2-catalogs-crud`
**Depende de**: F0 (primitivos), F1 (rutas placeholder registradas)
**Fuente del contrato**: `docs/mock/06-01`, `06-02`, `07-01`, `08-01`;
controladores de `backend/src/modules/{geo-zones,incident-categories,organizations}`
**Working dir**: `frontend`
**Orden**: Categorías → Organizaciones → Ubicaciones (D7)

> **Regla de contrato** — los modelos se derivan del **controlador** más
> `SnakeCaseResponseInterceptor`, no de la clase DTO. La DTO está en camelCase y no
> es el contrato observable. Precedente: SC-209 (`size_bytes` ≠ `file_size`).

---

## F2.0 — Andamiaje transversal

- [ ] **F2.0.1** — Crear `frontend/src/app/shared/directives/has-permission.directive.ts` (D6): oculta el elemento si el permiso no está en la lista del usuario autenticado.
- [ ] **F2.0.2** — Crear `frontend/src/app/core/guards/permission.guard.ts` (D6): bloquea el montaje de rutas de alta/edición sin el permiso requerido. Es la garantía real; la directiva sólo es ergonomía.
- [ ] **F2.0.3** — Specs de ambos: directiva oculta/muestra según permiso; guard permite/bloquea. Incluir el caso de acceso directo por URL sin pasar por el botón.

## F2.1 — Categorías (fija el patrón)

- [ ] **F2.1.1** — Leer `incident-categories.controller.ts` y derivar el modelo del wire (D2). Crear `frontend/src/app/core/models/incident-category.model.ts`.
- [ ] **F2.1.2** — Crear `incident-category.service.ts`: `list({search,page,limit})`, `getById`, `create`, `update`, `remove`. Sobre `http.service.ts` existente.
- [ ] **F2.1.3** — Spec del servicio: URL con búsqueda y paginación, y **mapeo de campos** del wire al modelo. Afirmar sobre los campos, no sobre la URL.
- [ ] **F2.1.4** — Listado `features/catalogs/categories/category-list/`: `ui-page-header` con kicker `CATÁLOGOS / CATEGORÍAS`, `ui-table`, búsqueda con `debounceTime(300)` + `distinctUntilChanged` + `switchMap` (D5), `pagination`, `table-skeleton` en carga, `empty-state` sin resultados.
- [ ] **F2.1.5** — Formulario `category-form/`: alta y edición en el mismo componente, validación cliente, mapeo de 422 a errores por campo, confirmación al cancelar con cambios sin guardar.
- [ ] **F2.1.6** — Borrado con `confirm-dialog` + `toast`; manejar 409 mostrando el motivo de integridad y conservando la fila.
- [ ] **F2.1.7** — Aplicar `*hasPermission` a los botones de alta y a las acciones de fila.
- [ ] **F2.1.8** — Specs de componente: filas renderizadas, `empty-state`, envío inválido bloqueado, 422 asociado a campo.
- [ ] **F2.1.9** — Sustituir el placeholder `/categorias` en `app.routes.ts` por las rutas reales (listado, `new`, `:id/edit`) con `permissionGuard` y `data.breadcrumb`.

## F2.2 — Organizaciones (replica el patrón)

- [ ] **F2.2.1** — Derivar el modelo del wire y crear `organization.model.ts`.
- [ ] **F2.2.2** — Crear `organization.service.ts` siguiendo F2.1.2.
- [ ] **F2.2.3** — Spec del servicio, con las mismas aserciones de mapeo.
- [ ] **F2.2.4** — Listado `features/catalogs/organizations/organization-list/` según mock 08-01.
- [ ] **F2.2.5** — Formulario `organization-form/` (alta/edición) con los campos del mock.
- [ ] **F2.2.6** — Borrado confirmado + manejo de 409. Nota: borrar una organización con usuarios asociados debe fallar con 409 — es el caso real, no hipotético.
- [ ] **F2.2.7** — Specs de componente.
- [ ] **F2.2.8** — Sustituir el placeholder `/organizaciones` en `app.routes.ts`.

## F2.3 — Ubicaciones (árbol)

- [ ] **F2.3.1** — Derivar el modelo del wire y crear `geo-zone.model.ts` con `GeoZone`, `GeoZoneLevel` y `GeoZoneNode` (D2).
- [ ] **F2.3.2** — Crear `geo-zone.service.ts`: `listAll()` sin paginar (D3), más `create`, `update`, `remove`.
- [ ] **F2.3.3** — Crear `features/catalogs/locations/tree.util.ts` con `buildTree()`, cálculo de `depth` y filtro que preserva ancestros (D3/D4). **El `depth` se calcula en un recorrido descendente desde las raíces**, no dentro del bucle de vinculación: asumir que los padres llegan antes que los hijos pasa los tests con datos ordenados y falla con datos reales.
- [ ] **F2.3.4** — Specs de `tree.util.ts` — es el núcleo algorítmico de la fase: entrada desordenada (hijo antes que padre), `depth` correcto en cuatro niveles, nodo con `parent_id` inexistente, filtro con ancestros preservados, arreglo vacío.
- [ ] **F2.3.5** — Listado en árbol `location-list/`: expansión y plegado por fila, sangría por `depth`, badge de nivel con color por nivel, código en tipografía monoespaciada, filtro por nivel, búsqueda en cliente (D5).
- [ ] **F2.3.6** — Nodo hoja sin control de expansión; búsqueda profunda expande los ancestros de cada coincidencia.
- [ ] **F2.3.7** — Formulario `location-form/` según mock 06-02: nombre, código, nivel, y **selector de padre acotado al nivel inmediatamente superior** (alta de `Cantón` ⇒ sólo padres de nivel `Provincia`).
- [ ] **F2.3.8** — Borrado confirmado; borrar un nodo con descendientes debe devolver 409 y mostrarse como tal.
- [ ] **F2.3.9** — Tarjetas de resumen al pie (mock 06-01): total, nuevas del mes, nivel crítico, sincronización. Usar la variante clara de tarjeta, no la sólida de KPI del dashboard.
- [ ] **F2.3.10** — Sustituir el placeholder `/ubicaciones` en `app.routes.ts`.

## F2.4 — Cierre

- [ ] **F2.4.1** — e2e Playwright por catálogo: alta → búsqueda → edición → borrado. Para Ubicaciones, además: expandir hasta `Parroquia` y verificar la sangría.
- [ ] **F2.4.2** — e2e de permisos: con `operador-org-1@tase.local` (15 permisos), las acciones de escritura no están en el DOM y el acceso directo a `/app/categorias/new` queda bloqueado por el guard.
- [ ] **F2.4.3** — Verificar que no queda ningún `// PLACEHOLDER F2` en `app.routes.ts`.
- [ ] **F2.4.4** — `pnpm lint && pnpm test && pnpm build` desde `frontend/`, y `pnpm test:e2e`.

---

## Definition of Done

- Las tres pantallas listan, crean, editan y borran contra el backend real
- Ubicaciones renderiza el árbol de cuatro niveles con expansión y sangría
- `tree.util.ts` con specs que cubren entrada desordenada y huérfanos
- Modelos derivados del wire, con specs que afirman sobre los campos mapeados
- Acciones de escritura ocultas sin permiso **y** bloqueadas por guard
- Cero `// PLACEHOLDER F2` restantes
- Suites unitaria y e2e en verde
