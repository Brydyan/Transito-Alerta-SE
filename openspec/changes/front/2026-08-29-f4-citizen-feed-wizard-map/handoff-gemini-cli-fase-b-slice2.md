# Handoff Gemini CLI — F4 Fase B, Slice 2 (B.3 feed ciudadano)

> **Rol**: documento de handoff para que **Gemini CLI** continúe la Fase B del change
> OpenSpec `front/2026-08-29-f4-citizen-feed-wizard-map` (F4 — feed ciudadano,
> asistente de reporte y mapa). El runtime nativo de OpenCode agotó la cuota free-tier
> del proveedor para `sdd-apply` en el Slice 2; este documento es el contexto canónico
> para el reemplazo externo. Creado: 2026-09-08.

---

## 1. Estado actual (obligatorio leer antes de tocar nada)

- **Rama**: `carlos_fp/sc-306/f4-ciudadano-feed-asistente-de-reporte-y`
- **La Fase A (backend) YA está implementada, verificada y COMMITEADA** (commits
  `15169b9`, `16aecd4`, `f4cae4b`, `9a102d0`, `114b767`): módulo
  `backend/src/modules/incident-social/`, migración `database/migrations/0053_citizen_social_features.sql`,
  rollback `database/rollback/0053_citizen_social_features.DOWN.sql`, e2e de Fase A.
  **NO la modifiques, NO la revises, NO la toques.**
- **El Slice 1 de la Fase B (B.1 base + B.2 asistente) YA está implementado, verificado y
  COMMITEADO** (commits `2af0d06`, `5202949`, `741e812`, `19bad5b`, `245f407`, `0aff304` +
  `docs 517aff9`). Verificación: `pnpm test` 62 suites / 425 tests PASS, `pnpm run build`
  exit 0, `npx tsc --noEmit` exit 0, `pnpm lint` 0 errores. **NO rehagas ni toques lo del
  Slice 1 salvo lo que el feed necesite consumir.**
- Endpoints de la Fase A ya disponibles (los consume B.3.x):
  - `GET /api/incidents` con filtros tipados y conteos agregados (`follower_count`,
    `corroboration_count`, `is_followed_by_me`, `is_corroborated_by_me`) — feed paginado
  - `POST /api/incidents/:id/followers` (guard `CREATE incident-followers`)
  - `DELETE /api/incidents/:id/followers` (guard `DELETE incident-followers`)
  - `POST /api/incidents/:id/corroborations` (body `{ comment: string | null }`, guard
    `CREATE incident-corroborations`; duplicado ⇒ 409; autor ⇒ 409)
- **No ejecutes `git add`/`commit`/`push` ni crees PRs.** El humano commitea.
- **No corras tests del backend** (ya están verdes). Tus tests son los de `frontend/`.

## 2. Alcance del slice 2 — tareas a completar

Del archivo `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md`,
marcá `[x]` SOLO estas tareas (B.3.*). La sección B.3 ya está renumerada y sincronizada
con la spec actualizada 2026-09-08.

### B.3 — Feed
- **B.3.1** — Crear `frontend/src/app/features/citizen/feed/` con el composer superior
  («¿Qué incidencia deseas reportar hoy?») que navega al asistente (`/reportar`).
- **B.3.2** — `components/incident-card/` según mock 09-01: autor, ubicación, antigüedad
  relativa, badges de estado y prioridad, título, código, etiquetas, coordenadas, «Ver Mapa»
  y pie de acciones. Los estados reales son 4: `pending|in_progress|resolved|closed`; las
  prioridades 4: `low|medium|high|critical`.
- **B.3.3** — «Seguir» con actualización **optimista** y **reversión ante error** (D7).
- **B.3.4** — «Yo también reporto» **sin** optimismo: espera la confirmación del servidor
  porque es irreversible (D7). Ya corroborada (`is_corroborated_by_me`) o autor ⇒ control
  deshabilitado desde la carga. Duplicado (409) ⇒ resincronizar estado.
- **B.3.5** — Carga incremental al llegar al final, sin perder la posición de desplazamiento.
- **B.3.6** — Estado final «Has visto todas las incidencias recientes» — nunca un cargador
  perpetuo.
- **B.3.7** — `components/feed-filters/`: chips de estado (`Todo|En proceso|Pendiente|Resuelto`
  maperando a los valores reales) y árbol de categorías **tri-estado** (D11) — padre marcado
  selecciona hijos; selección parcial deja el padre indeterminado. Aplica los filtros
  recargando el feed.
- **B.3.8** — Panel lateral: estadísticas del día y ranking de zonas. Si no existe un
  endpoint dedicado, usa datos derivados de la respuesta del feed o deja el componente
  preparado SIN inventar calls a endpoints inexistentes; documentá la decisión.
- **B.3.9** — Specs: reversión optimista, corroboración sin optimismo e indeterminado del
  árbol, fin del feed.

**FUERA DE ALCANCE de este slice (NO implementar):** B.4 (mapa segmentado — quedó para el
Slice 3), B.5 (cierre), toda la Fase A y todo lo del Slice 1.

## 3. Artefactos a leer ANTES de implementar

- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/proposal.md`
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/specs/frontend-citizen/spec.md`
  (secciones: Feed de incidencias, Acciones sociales en la tarjeta, Filtros del feed)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/design.md`
  (decisiones clave: D7 optimismo solo en Seguir, D11 árbol tri-estado, D8 clustering para
  el mapa, D9 orden asistente→feed→mapa; flujo de datos del Feed)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md` (solo B.3.*)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md`
  (leer; al final MERGE tu progreso, no pises el historial previo)
- Código ya existente del Slice 1 (referencia de patrones):
  - `frontend/src/app/core/services/incident-social.service.ts` — follow/unfollow/corroborate
  - `frontend/src/app/core/services/incident.service.ts` — getIncidents con filtros tipados,
    createIncident, uploadImages, updateIncidentStatus
  - `frontend/src/app/core/models/incident.model.ts` — Incident, IncidentListFilters,
    IncidentListResult, IncidentImage, CreateIncidentDto (con is_anonymous)
  - `frontend/src/app/core/services/http.service.ts` — wrapper HTTP con snake_case
  - `frontend/src/app/shared/components/map-picker/` — MapPicker reutilizable
  - `frontend/src/app/app.routes.ts` — `/inicio` tiene placeholder `// PLACEHOLDER F4`
    (~línea 197): reemplazalo por el feed. **NO toques `/mapa`** (Slice 3).

## 4. Reglas duras

1. **Strict TDD**: specs de test primero → verlos fallar → implementar → verlos pasar.
2. **NO `git add/commit/push`** ni PRs. El humano commitea.
3. **NO tocar** la Fase A ni el Slice 1 (B.1/B.2) ni B.4/B.5.
4. Idioma: este proyecto usa español en specs/tasks y en el HTML/TS existentes del frontend.
   Seguí el idioma del código existente que extendés. No inventes convenciones nuevas.
5. Actualizá `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md`
   (merge, NO pises: ya existe con Fase A + Slice 1).
6. Marcá `[x]` en `tasks.md` SOLO las tareas B.3.* que completes.
7. La carpeta de rutas del feed debe respetar los filtros del backend (status/categories
   reales); NO inventes valores de estado ni prioridad.

## 5. Verificación obligatoria (desde `frontend/`)

```bash
pnpm install               # por si agregas deps (evitalo si se puede con lo instalado)
pnpm test                  # Jest 30.4.2 + jest-preset-angular (62 suites existentes)
pnpm run build             # exit 0
npx tsc --noEmit           # typecheck
pnpm lint                  # ESLint — 0 errores, no sumes warnings nuevos
```

Slice 2 se considera éxito con unit tests + typecheck + build + lint verdes.
**NO corras Playwright e2e** (no aplican a este slice y son lentos).
No corras nada del backend.

## 6. Entregable al terminar

- Código en el working tree, tests verdes, tasks B.3.* marcadas `[x]`,
  `apply-progress.md` actualizado.
- Reportame (en chat, no commits): resumen de lo implementado, comandos de test corridos y
  resultados, gotchas encontradas, y la agrupación por work unit de los archivos para que el
  orquestador pueda redactar los bloques de commit que el humano copiará y pegará.