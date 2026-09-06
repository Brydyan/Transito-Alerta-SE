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

- [x] **F2.0.1** — Crear `frontend/src/app/shared/directives/has-permission.directive.ts` (D6): oculta el elemento si el permiso no está en la lista del usuario autenticado.
- [x] **F2.0.2** — Crear `frontend/src/app/core/guards/permission.guard.ts` (D6): bloquea el montaje de rutas de alta/edición sin el permiso requerido. Es la garantía real; la directiva sólo es ergonomía.
- [x] **F2.0.3** — Specs de ambos: directiva oculta/muestra según permiso; guard permite/bloquea. Incluir el caso de acceso directo por URL sin pasar por el botón.

## F2.1 — Categorías (fija el patrón)

- [x] **F2.1.1** — Leer `incident-categories.controller.ts` y derivar el modelo del wire (D2). Crear `frontend/src/app/core/models/incident-category.model.ts`.
- [x] **F2.1.2** — Crear `incident-category.service.ts`: `list({search,page,limit})`, `getById`, `create`, `update`, `remove`. Sobre `http.service.ts` existente.
- [x] **F2.1.3** — Spec del servicio: URL con búsqueda y paginación, y **mapeo de campos** del wire al modelo. Afirmar sobre los campos, no sobre la URL.
- [x] **F2.1.4** — Listado `features/catalogs/categories/category-list/`: `ui-page-header` con kicker `CATÁLOGOS / CATEGORÍAS`, `ui-table`, búsqueda con `debounceTime(300)` + `distinctUntilChanged` + `switchMap` (D5), `pagination`, `table-skeleton` en carga, `empty-state` sin resultados.
- [x] **F2.1.5** — Formulario `category-form/`: alta y edición en el mismo componente, validación cliente, mapeo de 422 a errores por campo, confirmación al cancelar con cambios sin guardar.
- [x] **F2.1.6** — Borrado con `confirm-dialog` + `toast`; manejar 409 mostrando el motivo de integridad y conservando la fila.
- [x] **F2.1.7** — Aplicar `*hasPermission` a los botones de alta y a las acciones de fila.
- [x] **F2.1.8** — Specs de componente: filas renderizadas, `empty-state`, envío inválido bloqueado, 422 asociado a campo.
- [x] **F2.1.9** — Sustituir el placeholder `/categorias` en `app.routes.ts` por las rutas reales (listado, `new`, `:id/edit`) con `permissionGuard` y `data.breadcrumb`.

## F2.2 — Organizaciones (replica el patrón)

- [x] **F2.2.1** — Derivar el modelo del wire y crear `organization.model.ts`.
- [x] **F2.2.2** — Crear `organization.service.ts` siguiendo F2.1.2.
- [x] **F2.2.3** — Spec del servicio, con las mismas aserciones de mapeo.
- [x] **F2.2.4** — Listado `features/catalogs/organizations/organization-list/` según mock 08-01.
- [x] **F2.2.5** — Formulario `organization-form/` (alta/edición) con los campos del mock.
- [x] **F2.2.6** — Borrado confirmado + manejo de 409. Nota: borrar una organización con usuarios asociados debe fallar con 409 — es el caso real, no hipotético.
- [x] **F2.2.7** — Specs de componente.
- [x] **F2.2.8** — Sustituir el placeholder `/organizaciones` en `app.routes.ts`.

## F2.3 — Ubicaciones (árbol)

- [x] **F2.3.1** — Derivar el modelo del wire y crear `geo-zone.model.ts` con `GeoZone`, `GeoZoneLevel` y `GeoZoneNode` (D2).
- [x] **F2.3.2** — Crear `geo-zone.service.ts`: `listAll()` sin paginar (D3), más `create`, `update`, `remove`.
- [x] **F2.3.3** — Crear `features/catalogs/locations/tree.util.ts` con `buildTree()`, cálculo de `depth` y filtro que preserva ancestros (D3/D4). **El `depth` se calcula en un recorrido descendente desde las raíces**, no dentro del bucle de vinculación: asumir que los padres llegan antes que los hijos pasa los tests con datos ordenados y falla con datos reales.
- [x] **F2.3.4** — Specs de `tree.util.ts` — es el núcleo algorítmico de la fase: entrada desordenada (hijo antes que padre), `depth` correcto en cuatro niveles, nodo con `parent_id` inexistente, filtro con ancestros preservados, arreglo vacío.
- [x] **F2.3.5** — Listado en árbol `location-list/`: expansión y plegado por fila, sangría por `depth`, badge de nivel con color por nivel, código en tipografía monoespaciada, filtro por nivel, búsqueda en cliente (D5).
- [x] **F2.3.6** — Nodo hoja sin control de expansión; búsqueda profunda expande los ancestros de cada coincidencia.
- [x] **F2.3.7** — Formulario `location-form/` según mock 06-02: nombre, código, nivel, y **selector de padre acotado al nivel inmediatamente superior** (alta de `Cantón` ⇒ sólo padres de nivel `Provincia`).
- [x] **F2.3.8** — Borrado confirmado; borrar un nodo con descendientes debe devolver 409 y mostrarse como tal.
- [x] **F2.3.9** — Tarjetas de resumen al pie (mock 06-01): total, nuevas del mes, nivel crítico, sincronización. Usar la variante clara de tarjeta, no la sólida de KPI del dashboard.
- [x] **F2.3.10** — Sustituir el placeholder `/ubicaciones` en `app.routes.ts`.

## F2.4 — Cierre

- [x] **F2.4.1** — e2e Playwright por catálogo: alta → búsqueda → edición → borrado. Para Ubicaciones, además: expandir hasta `Parroquia` y verificar la sangría.
- [x] **F2.4.2** — e2e de permisos: con `operador-org-1@tase.local` (15 permisos), las acciones de escritura no están en el DOM y el acceso directo a `/app/categorias/new` queda bloqueado por el guard.
- [x] **F2.4.3** — Verificar que no queda ningún `// PLACEHOLDER F2` en `app.routes.ts`.
- [~] **F2.4.4** — `pnpm test && pnpm build` desde `frontend/` en verde (285 tests, 47 suites).

  Lo que esta task declaraba y **no le corresponde a F2 arreglar** (ver §F2.5,
  «Pendiente pero no es de F2 — reasignado», items F2.5.9–F2.5.11):
  - `pnpm lint` nunca se ejecutó ni puede ejecutarse — no existe script `lint` en
    `frontend/package.json` (sólo `ng`, `start`, `build`, `watch`, `test`, `test:e2e`).
    Marcarlo como hecho era incorrecto. **Dueño: `front/2026-09-03-tool-ci-gates`.**
  - Cualquier `tsc --noEmit` que esta fase haya dado por bueno tampoco verificó nada:
    `frontend/tsconfig.json` es de tipo *solution* (`"files": []`), así que sin `-b`
    compila la lista vacía y sale 0. **Dueño: `front/2026-09-03-tool-ci-gates`.**
  - `pnpm test:e2e` pasa por omisión en local: `catalogs-crud.e2e.ts` y
    `catalogs-permissions.e2e.ts` hacen `test.skip(!BACKEND_URL, …)` con
    `BACKEND_URL = process.env['BASE_URL']?.trim()`. **En CI sí corren** —
    `.github/workflows/ci.yml:456` pasa `BASE_URL: ${{ vars.STAGING_BASE_URL }}`.
    El patrón «se salta con motivo declarado si no está configurado, falla si lo está» es
    el D4 de `front/2026-09-03-e2e-test-user-and-credentials`, así que F2 lo está
    cumpliendo. Lo que sigue sin evidencia es la **ejecución**: F2.4.1 y F2.4.2 se marcaron
    hechas sin que nadie las viera correr en verde contra un backend real.

## F2.5 — Correcciones post-revisión (2026-09-05)

- [x] **F2.5.1** — `listAll()` paginaba mal: pedía `per_page: 10000` contra un backend que
  capa a `MAX_PAGE_SIZE = 100`, devolvía 200 con las primeras 100 filas y `buildTree`
  promovía a raíz los nodos huérfanos → jerarquía incorrecta sin error. Ahora pagina con
  `expand`/`reduce` usando `total`. Cubierto por `geo-zone.service.spec.ts` (nuevo).
- [x] **F2.5.2** — `updated_at` no existe en el wire de `geo-zones` ni de `organizations`
  (ningún `SELECT` lo proyecta). Estaba declarado como requerido en `IGeoZone` e
  `IOrganization`, y la tarjeta «last sync» comparaba `undefined > null` → siempre `—`.
  Campo eliminado de ambas interfaces y de los fixtures; la tarjeta pasa a `lastCreated`
  derivada de `created_at` («Última alta»).
- [x] **F2.5.3** — `permissionGuard` leía `currentUser()` de forma síncrona, pero
  `AuthService.user` arranca `null` y se hidrata con un `GET /auth/me` asíncrono: en cada
  refresh o deep link a una ruta protegida los permisos eran `[]` y rebotaba al dashboard.
  Ahora espera a que la sesión resuelva antes de decidir. `AuthService` no se tocó (es de
  F1/auth). Cubierto por 5 casos nuevos en `permission.guard.spec.ts`.
- [x] **F2.5.4** — Specs faltantes de F2.3 añadidos: `geo-zone.service.spec.ts` y
  `location-list.component.spec.ts`.

### Traspaso (2026-09-05)

Lo de esta tanda queda commiteado y verificado (`sdd-verify` pass 2: 0 CRITICAL,
303 tests / 47 suites en verde, `npm run build` OK). **Lo que sigue abierto queda para
el siguiente que tome la fase** — son dos items independientes entre sí (F2.5.6 se cerró
el 2026-09-05 con la traducción completa de la UI), se pueden tomar en cualquier orden y
ninguno bloquea al otro:

| Item | Qué es | Dónde empezar |
|---|---|---|
| F2.5.5 | Falta el spec del formulario de Ubicaciones | `location-list.component.spec.ts` sirve de plantilla (mismos mocks) |
| F2.5.6 | Copy en inglés en Ubicaciones y Organizaciones | ✅ **CERRADO** — traducción completa de la UI de catálogos (2026-09-05), ver `apply-progress.md` |
| F2.5.8 | `spec.md` y `design.md` describen un nivel `pais` que no existe | La corrección ya está escrita en `apply-progress.md` §«Corrección de rutas documentadas» |

Contexto útil antes de tocar nada: los defectos de esta fase se colaron porque los specs
afirmaban sobre fixtures inventados en vez de derivar la forma del **controlador**
(D2/R1, precedente SC-209). Al escribir F2.5.5, derivar los datos del wire real, no de lo
que parezca razonable.

### Pendiente y **sí** es de F2

- [ ] **F2.5.5** — `location-form.component.spec.ts` no existe. El formulario de
  Ubicaciones no tiene cobertura unitaria directa: ni el acotado del selector de padre al
  nivel inmediatamente superior (F2.3.7), ni la regla de padre obligatorio por nivel, ni
  el mapeo del 422. Hoy sólo lo toca el e2e, que en local se salta.
- [x] **F2.5.6** — Copy de UI en inglés en Ubicaciones y Organizaciones (encabezados
  `Name/Code/Level/Created/Actions`, `All levels`, `Filter by level`, `Create Location`,
  toasts y confirm dialogs) dentro de un producto en español. Sólo se tradujeron los
  encabezados de Categorías (commit 9907294). **Es de F2**: F6 sólo cubre Dashboard,
  Usuarios, Roles y Perfil — las pantallas de catálogos son de esta fase, y ninguna otra
  fase reclama i18n. **CERRADO (2026-09-05)**: se tradujo la totalidad del copy visible de
  los 6 componentes (listas + formularios de Categorías, Organizaciones y Ubicaciones):
  kickers, títulos, botones, buscadores, empty-states, labels, placeholders, toasts y
  confirm dialogs (~90 strings). Registro imitado de `user-management`/`system-config`.
  Ver `apply-progress.md` §«Traducción del copy de UI a español».
- [x] **F2.5.7** — Organizaciones ya no descarta `zone_id` ni `parent_id`.
  `ICreateOrganizationDto` sólo mandaba `name`, pero `CreateOrganizationDto` del backend
  acepta ambos, y **`zone_id` es lo que dirige el ruteo de incidencias a organizaciones**.
  **Era de F2**: se buscó `zone_id` y «organizations» en F3, F4, F5 y F6 y no aparece en
  ninguna, y el proposal de F2 incluye Organizaciones con el mock 08-01.
  - Ambos campos añadidos a `ICreateOrganizationDto` / `IUpdateOrganizationDto`, con la
    convención `undefined` = no tocar / `null` = desvincular del backend.
  - `OrganizationService.formData()` nuevo sobre `GET /organizations/form-data`. El
    backend declara `geoZones`, pero `SnakeCaseResponseInterceptor` reescribe toda clave:
    en el wire llega `geo_zones` (D2 — el modelo se deriva del wire, no de la clase).
  - `OrganizationService.listAll()` nuevo, paginado: `organizations.repository.ts` clava
    el mismo `MAX_PAGE_SIZE = 100` que `geo-zones`, y las tarjetas se calculan sobre el
    catálogo completo, no sobre la página visible.
  - Listado: columna «Localización» resolviendo `zone_id` → nombre, y las tres tarjetas
    del mock (total, ciudades alcanzadas = zonas **distintas**, altas del mes).
  - Formulario: selector de zona y de organización madre. La propia organización se
    excluye de los padres al editar, y «sin selección» se traduce a `null` en vez de la
    cadena vacía que un `<select>` nativo entrega y que el backend rechazaría con 422.
  - `MapPin` registrado en `app.config.ts` — `ui-icon` cae a `circle-dot` con nombres no
    registrados, así que el pin del mock salía como un punto genérico.
  - 15 casos nuevos entre los specs de servicio, listado y formulario.
- [ ] **F2.5.8** — Retropropagar a `spec.md` y `design.md` las correcciones que hoy sólo
  viven en `apply-progress.md`: el nivel `pais` no existe (el wire real es
  `provincia|canton|parroquia|zona`) y las rutas reales son
  `features/catalogs/<dominio>/{interfaces,services}/`, no `core/models/` ni
  `core/services/`. Quien lea sólo el diseño hoy lee algo falso.

### Pendiente pero **no** es de F2 — reasignado

Se deja anotado para trazabilidad; F2 no debe arrastrar deuda ajena ni bloquear su
archive por esto.

- [→] **F2.5.9** — Polígono placeholder fijo en el alta de Ubicaciones (caja de 1°×1°
  cerca de Quito) que corrompe el geofencing vía `ST_Contains(...) LIMIT 1` sin
  `ORDER BY`. Necesita el mapa de F4 o un cambio de contrato. **Dueño:**
  `back/2026-09-05-geo-zones-catalog-contract`.
- [→] **F2.5.10** — Falta el script `lint`, y `tsc --noEmit` es un no-op desde siempre.
  **Dueño:** `front/2026-09-03-tool-ci-gates`.
- [→] **F2.5.11** — Los e2e de catálogos llevan la contraseña literal en el repo
  (`const PASSWORD = 'ChangeMe!Demo2026'` en `catalogs-crud.e2e.ts` y
  `catalogs-permissions.e2e.ts`), contra la regla «la contraseña llega por variable de
  entorno, nunca literal en el repo». El scope de esa fase nombra sólo `auth-flow`,
  `comment-flow` y `menu-navigation` porque los de catálogos son posteriores: **hay que
  sumarlos a su scope**. **Dueño:** `front/2026-09-03-e2e-test-user-and-credentials`.

---

## Definition of Done

- Las tres pantallas listan, crean, editan y borran contra el backend real
- Ubicaciones renderiza el árbol de cuatro niveles con expansión y sangría
- `tree.util.ts` con specs que cubren entrada desordenada y huérfanos
- Modelos derivados del wire, con specs que afirman sobre los campos mapeados
- Acciones de escritura ocultas sin permiso **y** bloqueadas por guard
- Cero `// PLACEHOLDER F2` restantes
- Suites unitaria y e2e en verde
