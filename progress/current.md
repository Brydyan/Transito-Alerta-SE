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

### Fix de iconos lucide (2026-09-05, SIN commitear)
- Causa raíz DOBLE: (1) el set curado `LUCIDE_ICONS` de `app.config.ts` usaba keys
  PascalCase (`AlertTriangle`), pero `LucideIconProvider.hasIcon()` matchea keys
  EXACTAS (`name in icons`, sin normalizar) → ningún nombre kebab de templates/backend
  matcheaba → TODOS los iconos caían al respaldo `circle-dot`. (2) `renderIcon()` de
  `ui-icon` inyectaba los `<path>` de Lucide sin wrapper `<svg>` → un path huérfano no
  dibuja (el fallback sí envolvía, por eso "algo" se veía).
- Fix: keys kebab-case en `LUCIDE_ICONS` + 8 iconos nuevos (`folder-open`,
  `layout-dashboard`, `home`→House, `list`, `map`, `plus-circle`→CirclePlus,
  `building-2`, `tag`) + `renderIcon()` envuelve en `<svg viewBox="0 0 24 24">`.
- Test de regresión diferenciador en `ui-icon.component.spec.ts` (0 círculos para
  icono registrado). Verificado: `npm test` 304/304 (47 suites) + `npm run build` OK.

### Fix de tablas ui-table (2026-09-05, SIN commitear)
- Selectores de `ui-table.component.ts` cambiados a `:host ::ng-deep`: la encapsulación
  emulada generaba `.ui-table[_ngcontent-%COMP%] th[_ngcontent-%COMP%]` que jamás
  matcheaba el th/td proyectado (llevan `_ngcontent` del consumidor).

### F2.5.5 — Spec unitario de LocationFormComponent (2026-09-05)
- Creado `location-form.component.spec.ts` con cobertura de: selector de padre acotado a nivel inmediato superior, validación de padre obligatorio para cantón y parroquia, y mapeo de errores 422 del servidor al formulario.
- Causa raíz y fix en `location-form.component.ts`: `parentRequired` y `parentOptions` eran `computed()` que leían `levelControl.value`. Al ser `levelControl` un `FormControl` de ReactiveFormsModule y no una Signal, los cambios de nivel no invalidaban el grafo reactivo. Se incorporó `selectedLevel = signal<GeoZoneLevel>('zona')` sincronizado en `refreshParentValidation()`.
- Verificado: 3/3 tests pasan.

### F2.5.8 — Retropropagación a spec.md y design.md (2026-09-05)
- Actualizado `specs/frontend-catalogs/spec.md` con niveles reales (`Provincia|Cantón|Parroquia|Zona`).
- Actualizado `design.md`: interfaz `IGeoZone` con niveles reales del wire (`provincia|canton|parroquia|zona` sin `pais`), rutas efectivas de archivos agrupadas por dominio en `features/catalogs/<dominio>/`, y resolución de Q1.

## Resultado global
- Las 3 pantallas listan, crean, editan y borran contra el backend real
- Árbol de 4 niveles con expansión y sangría en Ubicaciones
- `pnpm test` en verde: 307/307 tests (48 suites) pasando
- `pnpm build` compila sin errores (Application bundle generation complete)
- Sin `// PLACEHOLDER F2` restantes en `app.routes.ts`
- UI del módulo de catálogos 100% en español
- F2.5.5, F2.5.6, F2.5.7 y F2.5.8 cerrados

## Lecciones aprendidas / patrones
- El wire real del backend para geo-zones usa `provincia|canton|parroquia|zona` — el design.md D2 decía `pais|provincia|canton|parroquia` (incorrecto). Se sigue el wire real (regla D2: derivar del wire no de la suposición).
- Los `computed()` de Angular Signals NO reaccionan a cambios en propiedades de Reactive Forms (`formControl.value`). Cuando un `computed()` depende del valor de un control reactivo, debe alimentarse a través de una Signal (`signal` + sync en `valueChanges`/`refresh`, o `toSignal`).
- `tech/geo-zone` no tiene script `lint` en el frontend; el gate de compilación es `ng build`.
- `CreateGeoZoneDto` del backend REQUIERE `polygon` (IsGeoJsonPolygon no-opcional). Al no haber herramienta de dibujo en F2.3, se envía un polygon placeholder.
- `buildTree` DEBE calcular depth en segunda pasada DFS (nunca dentro del bucle de vinculación).

## Proximos pasos
- [x] **F2.5.5** — Escribir `location-form.component.spec.ts` (CERRADO: 3/3 tests pasando).
- [x] **F2.5.8** — Retropropagar a `spec.md`/`design.md` la corrección del nivel `pais` y rutas reales (CERRADO).
- [ ] Fix de iconos lucide + fix de tablas ui-table + location-form: archivos pendientes de commit (el usuario commitea él mismo).
- [ ] F2.4 — Cierre: e2e ya implementados (`catalogs-crud.e2e.ts`, `catalogs-permissions.e2e.ts`), pendiente correrlos contra staging y cerrar la puerta de cierre (verify-report recomienda avanzar a archive).

## Bloqueo activo
- Cuota del proveedor del modelo agotada (gemini free tier, `generate_content_free_tier_requests`,
  limit 20, ventana de reset ~25s sin resolver): agotada de nuevo el 2026-09-05 al delegar
  F2.5.5. Bloquea la delegación de fases. No es bug de Gentle AI — no reportar.
- OJO SESIÓN FUTURA: `gentle-ai sdd-status` (dispatcher nativo v2.6.0) NO resuelve los
  changes de este repo: espera `openspec/changes/<name>/` plano, pero este proyecto anida
  los changes bajo `openspec/changes/{front,back,infra,archive}/`. Devuelve "unresolved"/
  `missing` para todo (incluso archivados). Usar el fallback manual (leer artefactos
  directamente) y el nombre del change: `front/2026-08-29-f2-catalogs-crud`.