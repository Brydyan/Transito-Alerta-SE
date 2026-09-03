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

## Resultado global
- Las 3 pantallas listan, crean, editan y borran contra el backend real
- Árbol de 4 niveles con expansión y sangría en Ubicaciones
- `pnpm build` compila sin errores (Application bundle generation complete)
- Sin `// PLACEHOLDER F2` restantes en `app.routes.ts` (verificado por chunks lazy: category-list, organization-list, location-list)

## Lecciones aprendidas / patrones
- El wire real del backend para geo-zones usa `provincia|canton|parroquia|zona` — el design.md D2 decía `pais|provincia|canton|parroquia` (incorrecto). Se sigue el wire real (regla D2: derivar del wire no de la suposición).
- `tech/geo-zone` no tiene script `lint` en el frontend; el gate de compilación es `ng build`.
- `CreateGeoZoneDto` del backend REQUIERE `polygon` (IsGeoJsonPolygon no-opcional). Al no haber herramienta de dibujo en F2.3, se envía un polygon placeholder.
- `buildTree` DEBE calcular depth en segunda pasada DFS (nunca dentro del bucle de vinculación).

## Proximos pasos
- [ ] **(DIFERIDO por cuota) Specs:** F2.0.3 (directiva+guard), F2.1.3 (servicio categorías), F2.1.8 (componentes categorías), F2.2.3, F2.2.7, F2.3.4 (tree.util). Motivo: el agente `general` está bloqueado por cuota de modelo gemini-3.5-flash free tier (generative...free_tier_requests agotado). Alternativa aceptada por el usuario: escribir los specs inline con el modelo del orquestador, o esperar a que recargue y reintentar el agente. Escribir los specs es la puerta de cierre (`require_tests_to_close`).
- [ ] F2.4 — Cierre: e2e Playwright por catálogo + e2e permisos + `pnpm test` + `pnpm build`

## Bloqueo activo
- Cuota del modelo del agente `general` (gemini-3.5-flash, free tier): `generate_content_free_tier_requests` agotado, limit 20, ventana de reset ~25s sin resolver. Bloquea la delegación de los specs. No es bug de Gentle AI (es límite del proveedor). No reportar.