# Handoff Gemini CLI — F4 Fase B, Slice 3 (B.4 mapa segmentado e interactivo)

> **Rol**: documento de handoff para que **Gemini CLI** continúe la Fase B del change
> OpenSpec `front/2026-08-29-f4-citizen-feed-wizard-map` (F4 — feed ciudadano,
> asistente de reporte y mapa). El runtime nativo de OpenCode volvió a agotar la cuota
> free-tier del proveedor para `sdd-apply`; este documento es el contexto canónico para
> el reemplazo externo. Creado: 2026-09-09.

---

## 1. Estado actual (obligatorio leer antes de tocar nada)

- **Rama**: `carlos_fp/sc-306/f4-ciudadano-feed-asistente-de-reporte-y`
- **Fase A (backend)**: implementada, verificada y COMMITEADA. **NO la toques.**
- **Slice 1 (B.1 base + B.2 asistente)**: implementado, verificado y COMMITEADO
  (`2af0d06`…`0aff304` + docs `517aff9`). **NO lo toques salvo lo que el mapa necesite.**
- **Slice 2 (B.3 feed)**: implementado por Gemini CLI y COMMITEADO (`191e8a6`,
  `5163646`, `c98817c`, `2e8cd3d`, `674d5b5`) + fix del orquestador (`b104403`).
  Verificado: frontend 65 suites / 436 tests PASS, backend 112 suites / 1029 tests PASS,
  build exit 0, tsc exit 0, lint 0 errores. **NO lo toques salvo lo que el mapa necesite
  reutilizar.**
- **Qué quedó pendiente**: SOLO el Slice 3 (B.4 mapa). Todo lo demás está commiteado.
- **No ejecutes `git add`/`commit`/`push` ni crees PRs.** El humano commitea.
- **No corras tests del backend** (ya están verdes y no tocas backend). Tus tests son los de `frontend/`.

## 2. REQUISITOS EXPLÍCITOS DEL USUARIO (mandan sobre cualquier otra interpretación)

1. **El mapa debe mostrar PRIMERO que todo los puntos de localización de las
   incidencias** — la capa de marcadores de incidencias es la protagonista; los segmentos
   de zonas se superponen como capa de contexto encima/atrás (los polígonos no deben
   tapar los puntos: usar fill semitransparente y poner la capa de marcadores por
   delante).
2. **El mapa debe vivir en un contenedor**: el margen exterior (separación del contenedor
   respecto a la pantalla/borde) NO debe ser excesivo, pero TAMPOCO se debe reducir el
   tamaño del mapa para lograrlo. Resultado buscado: mapa AMPLIO, que se vea el detalle
   de lugares e incidencias. Layout recomendado: un panel/página con padding exterior
   moderado (~16–24px) y el mapa ocupando el 100% del ancho y del alto restante dentro
   del contenedor, SIN encogerlo.
3. **Segmentación por líneas divisorias**: Leaflet lo soporta de forma NATIVA con
   `L.geoJSON` rendering los polígonos de las GeoZones: los bordes de cada polígono
   (stroke `color` + `weight`) actúan como las líneas divisorias entre ciudades/zonas.
   Cada polígono responde a `mouseover`/`mouseout`/`click` para resaltar (hover).

## 3. Alcance del slice 3 — tareas a completar

Del archivo `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md`,
marcá `[x]` SOLO estas tareas (B.4.*):

### B.4 — Mapa
- **B.4.1** — Crear `frontend/src/app/features/citizen/map/` a pantalla completa con
  Leaflet en contenedor con margen exterior moderado y mapa AMPLIO (todo el ancho/alto
  disponible dentro del contenedor). Reemplazar el placeholder `// PLACEHOLDER F4` de
  `/mapa` en `frontend/src/app/app.routes.ts` (~línea 233). NO tocar `/inicio`.
- **B.4.2** — Capa de segmentos: cargar zonas geográficas activas
  (`GeoZoneService.listAll()` o `list()` filtrando `active: true`) y renderizar sus
  polígonos con `L.geoJSON` sobre el mapa base (D12). Tipar `IGeoZone.polygon` como
  `IGeoJsonPolygon | IGeoJsonMultiPolygon` (el backend guarda `ST_Multi`; la salida puede
  ser MultiPolygon). Los bordes de polígono son las LÍNEAS DIVISORIAS entre zonas.
- **B.4.3** — Hover sobre un polígono de segmento ⇒ se resalta visualmente (cambio de
  estilo en `mouseover`/`mouseout`).
- **B.4.4** — Agrupación de marcadores de incidencias con `leaflet.markercluster` (D8).
  **Anotar en el código el umbral de ~5.000 incidencias** a partir del cual la agrupación
  debe pasar al servidor.
- **B.4.5** — Panel de filtros flotante (estado, prioridad, categoría) con acción de
  limpiar todo. Aplicar filtros recargando las incidencias del mapa.
- **B.4.6** — Contador de incidencias mostradas y marca de última actualización.
- **B.4.7** — Marcador activado ⇒ resumen con enlace al detalle de la incidencia.
- **B.4.8** — Sin resultados ⇒ mapa vacío con aviso explícito, distinguible de un fallo
  de carga; **los segmentos de zonas siguen interactivos**.
- **Specs** — Las B.4.* asociadas: renderizado de segmentos, hover, carga de incidencias
  superpuestas, expandir grupo con zoom, marcador con resumen, filtros con limpiar todo,
  contador, sin resultados con segmentos activos.

**FUERA DE ALCANCE de este slice (NO implementar):** B.5 (cierre), toda la Fase A, todo
lo de los Slices 1 y 2. NO tocar `/inicio` (ya es el feed).

## 4. Decisiones de arquitectura ya tomadas (NO las cambies)

- **Endpoint de incidencias para el mapa**: el design menciona `GET /api/map/incidents`,
  pero ESE ENDPOINT NO EXISTE en el backend. Lo que existe y DEBES usar es el feed
  existente `GET /api/incidents/feed` (frontend: `IncidentService.getIncidents` /
  `getFeed`) que ya devuelve `lat`, `lng` y soporta filtros por `status`, `priority`,
  `incident_category_id`, `page`, `per_page`. Usa esa fuente. NO inventes un endpoint
  nuevo.
- **Catálogo de filtros del mapa**: ya existe `GET /api/map/filters` (T5.4) →
  `MapFiltersResponseDto` (estados, prioridades, categorías). Consumilo en el panel de
  filtros flotante (B.4.5).
- **Zonas**: `GeoZoneService` (`features/catalogs/locations/services/geo-zone.service.ts`),
  filtrar `active: true`, dibujar con `L.geoJSON`. Tipar `IGeoZone.polygon` (hoy `unknown`)
  como `IGeoJsonPolygon | IGeoJsonMultiPolygon`; el tipado nuevo debe abrirse camino sin
  romper el tree/screens existentes que nunca leen polygon (revisar dónde se usa
  `IGeoZone`).
- **Clustering**: `leaflet.markercluster` YA está instalado y configurado en
  `angular.json` (`allowedCommonJsDependencies`) — commit `2e67603`.
- **Ruta**: reemplazar el placeholder de `/mapa` (línea ~233), NO tocar `/inicio`.

## 5. Gotchas conocidos (evítalos)

- Los iconos por defecto de Leaflet se rompen con bundlers (rutas de imágenes). Ya se
  corrigió para `shared/components/map-picker/`; revisá ese fix y reutilizalo (o un icono
  propio). 
- Los componentes custom Angular nacen con `display: inline` — si un hijo del mapa se ve
  raro, usá `host: { class: 'block' }` (como se hizo en `incident-card`).
- Tailwind `space-y-*` no aplica a custom elements; usá `flex flex-col gap-*` o el host
  block.
- `window.fetch` (no `fetch` global) para llamadas fuera de Angular (lint `no-undef`).
- El build de Angular puede colgar por esbuild zombies de sesiones previas:
  `pkill -f esbuild` antes de correr el build si cuelga.

## 6. Artefactos a leer ANTES de implementar

- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/proposal.md`
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/specs/frontend-citizen/spec.md`
  (sección «Mapa a pantalla completa interactivo y segmentado» — REQUIREMENTS + SCENARIOS)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/design.md`
  (D8 clustering ~5.000, D12 polígonos de GeoZones, sección Data Flow › Mapa, File Changes)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md` (solo B.4.*)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md`
  (leer; al final MERGE tu progreso, no pises el historial previo)
- Código existente (referencia de patrones):
  - `frontend/src/app/core/services/incident.service.ts` — getIncidents/getFeed con filtros
  - `frontend/src/app/core/models/incident.model.ts` — Incident (lat/lng), IncidentListFilters
  - `frontend/src/app/features/catalogs/locations/services/geo-zone.service.ts` — listAll/list
  - `frontend/src/app/features/catalogs/locations/interfaces/igeo-zone.interface.ts` — IGeoZone.polygon?: unknown
  - `frontend/src/app/shared/components/map-picker/` — fix de iconos Leaflet, contenedor Leaflet
  - `frontend/src/app/app.routes.ts` — placeholder `/mapa` ~233
  - `backend/src/modules/map/map-support.service.ts` + `dto/map-filters-response.dto.ts` — catálogo de filtros

## 7. Reglas duras

1. **Strict TDD**: specs de test primero → verlos fallar → implementar → verlos pasar.
2. **NO `git add/commit/push`** ni PRs. El humano commitea.
3. **NO tocar** la Fase A ni los Slices 1/2 ni B.5.
4. Idioma: este proyecto usa español en specs/tasks y en el HTML/TS existentes del
   frontend. Seguí el idioma del código existente que extendés. No inventes convenciones.
5. Actualizá `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md`
   (merge, NO pises).
6. Marcá `[x]` en `tasks.md` SOLO las tareas B.4.* que completes.

## 8. Verificación obligatoria (desde `frontend/`)

```bash
pnpm install               # solo si agregas deps (evitalo: leaflet, markercluster, dexie ya están)
pnpm test                  # Jest 30.4.2 + jest-preset-angular (65 suites existentes)
pnpm run build             # exit 0 — hay warning de budget initial ~600 kB; NO tapes el warning con config
npx tsc --noEmit           # typecheck
pnpm lint                  # ESLint — 0 errores, no sumes warnings nuevos (65 base aceptados)
```

Slice 3 se considera éxito con unit tests + typecheck + build + lint verdes.
**NO corras Playwright e2e** (no aplican a este slice y son lentos).
No corras nada del backend.

## 9. Entregable al terminar

- Código en el working tree, tests verdes, tasks B.4.* marcadas `[x]`,
  `apply-progress.md` actualizado.
- Reportame (en chat, no commits): resumen de lo implementado, decisiones clave y
  desviaciones (especialmente la fuente de datos de incidencias y el layout del
  contenedor), comandos de test corridos y resultados, gotchas encontradas, y la
  agrupación por work unit de los archivos para que el orquestador pueda redactar los
  bloques de commit que el humano copiará y pegará.