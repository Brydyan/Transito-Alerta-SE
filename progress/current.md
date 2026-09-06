# Estado Actual (Sesion en curso)

## Feature en desarrollo
**Nombre:** F2 — Catálogos: CRUD de Categorías, Organizaciones y Ubicaciones
**ID en feature_list.json:** 12
**Status actual:** in_progress

## Exclusiones

## Lo completado en esta sesion

### F2.0 — Andamiaje transversal
- `has-permission.directive.ts`: directiva estructural `*hasPermission` que oculta elementos sin permiso
- `permission.guard.ts`: guard funcional que bloquea rutas de alta/edición por `route.data.permission`

### F2.1 — Categorías (fija el patrón)
- `incident-category.model.ts`, `incident-category.service.ts` (CRUD)
- `category-list/`: listado con búsqueda server-side (debounce 300ms + distinctUntilChanged + switchMap), paginación, skeleton, empty-state
- `category-form/`: alta/edición combinada, validación cliente, 422→campo, 409 integridad, confirmación al cancelar
- Rutas reales `/categorias` en `app.routes.ts`

### F2.2 — Organizaciones (replica el patrón)
- `organization.model.ts`, `organization.service.ts`
- `organization-list/`, `organization-form/`
- Rutas reales `/organizaciones`

### F2.3 — Ubicaciones (árbol)
- `geo-zone.model.ts` (niveles wire reales: provincia/canton/parroquia/zona — NO existe 'pais')
- `geo-zone.service.ts` con `listAll()` (D3)
- `tree.util.ts`: `buildTree()` en 2 pasadas (depth por DFS descendente — D3), `filterTreePreservingAncestors()` (D4), `getLevelParentLevel()`
- `location-list/`: árbol con expansión/plegado, sangría por depth, badge de nivel, filtro por nivel, búsqueda cliente que auto-expande ancestros, tarjetas resumen variante clara
- `location-form/`: nombre/código/nivel/padre, selector acotado al nivel inmediato superior (canton→provincia), excluye descendientes al editar, polygon placeholder (obligatorio en CreateGeoZoneDto)
- Rutas reales `/ubicaciones`

### F2.5.6 — Copy de UI en español (2026-09-05)
- Traducción completa del copy visible en inglés → español en los 6 componentes de
  catálogos (listas + formularios de Categorías, Organizaciones y Ubicaciones), ~90
  strings: kickers, títulos, botones, buscadores, empty-states, encabezados de tabla,
  labels/placeholders de formularios, toasts y confirm dialogs.
- Registro imitado de `user-management`/`system-config` (ya presente en el repo).
- 12 archivos: `catalogs/{incident-categories,organizations,locations}/*/{*-list,*-form}.component.{html,ts}`.
- Verificado: `npm test` 303/303 (47 suites) en verde, `npm run build` OK.
- **Estilos**: el módulo ya es 100% Tailwind v4 — no había Bootstrap que sacar
  (Bootstrap eliminado del proyecto; `styles.css` lo declara).

## Resultado global
- Las 3 pantallas listan, crean, editan y borran contra el backend real
- Árbol de 4 niveles con expansión y sangría en Ubicaciones
- `pnpm build` compila sin errores (Application bundle generation complete)
- Sin `// PLACEHOLDER F2` restantes en `app.routes.ts` (verificado por chunks lazy: category-list, organization-list, location-list)
- UI del módulo de catálogos 100% en español (2026-09-05)

## Lecciones aprendidas / patrones
- El wire real del backend para geo-zones usa `provincia|canton|parroquia|zona` — el design.md D2 decía `pais|provincia|canton|parroquia` (incorrecto). Se sigue el wire real (regla D2: derivar del wire no de la suposición).
- `tech/geo-zone` no tiene script `lint` en el frontend; el gate de compilación es `ng build`.
- `CreateGeoZoneDto` del backend REQUIERE `polygon` (IsGeoJsonPolygon no-opcional). Al no haber herramienta de dibujo en F2.3, se envía un polygon placeholder.
- `buildTree` DEBE calcular depth en segunda pasada DFS (nunca dentro del bucle de vinculación).

## Proximos pasos
- [ ] **F2.5.5** — Escribir `location-form.component.spec.ts` (cobertura unitaria del
  formulario de Ubicaciones: acotado del selector de padre, padre obligatorio por nivel,
  mapeo del 422). Template: `location-list.component.spec.ts`.
- [ ] **F2.5.8** — Retropropagar a `spec.md`/`design.md` la corrección del nivel `pais`
  (el wire real es `provincia|canton|parroquia|zona`) y las correcciones de rutas ya
  anotadas en `apply-progress.md` §«Corrección de rutas documentadas».
- [ ] Revisar y commitear los cambios sin commitear: 12 archivos de la traducción
  F2.5.6 + 4 archivos openspec de la revisión de `docs(openspec)` (1948a13).
- [ ] F2.4 — Cierre: e2e ya implementados (`catalogs-crud.e2e.ts`,
  `catalogs-permissions.e2e.ts`), pendiente correrlos contra staging y cerrar la puerta
  de cierre (verify-report recomienda avanzar a archive).

## Bloqueo activo
- Cuota del modelo del agente `general` (gemini-3.5-flash, free tier): `generate_content_free_tier_requests` agotado, limit 20, ventana de reset ~25s sin resolver. Bloquea la delegación de los specs. No es bug de Gentle AI (es límite del proveedor). No reportar.