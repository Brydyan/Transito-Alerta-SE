# Handoff Gemini CLI — F4 Fase B, Slice 1 (B.1 base + B.2 asistente de reporte)

> **Rol**: documento de handoff para que **Gemini CLI** continúe la Fase B del change
> OpenSpec `front/2026-08-29-f4-citizen-feed-wizard-map` (F4 — feed ciudadano,
> asistente de reporte y mapa). El runtime nativo de OpenCode agotó cuota free-tier
> del proveedor para `sdd-apply`; este documento es el contexto canónico para el
> reemplazo externo. Creado: 2026-09-07.

---

## 1. Estado actual (obligatorio leer antes de tocar nada)

- **Rama**: `carlos_fp/sc-306/f4-ciudadano-feed-asistente-de-reporte-y`
- **La Fase A (backend) de este mismo change YA está implementada y verificada** en el
  working tree (sin commitear, porque el humano commitea): módulo
  `backend/src/modules/incident-social/`, migración `database/migrations/0049_citizen_social_features.sql`,
  rollback `database/rollback/0049_citizen_social_features.DOWN.sql`, 3 e2e de la Fase A.
  **NO la modifiques, NO la revises, NO la toques.** Tu alcance es SOLO la Fase B, slice 1.
- Endpoints de la Fase A ya disponibles (los consume B.1.2):
  - `POST /api/incidents/:id/followers` (guard `CREATE incident-followers`)
  - `DELETE /api/incidents/:id/followers` (guard `DELETE incident-followers`)
  - `POST /api/incidents/:id/corroborations` (body `{ comment: string | null }`, guard
    `CREATE incident-corroborations`)
- **No ejecutes `git add`/`commit`/`push` ni crees PRs.** El humano commitea.
- **No corras tests del backend** (ya están verdes). Tus tests son los de `frontend/`.

## 2. Alcance del slice 1 — tareas a completar

Del archivo `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md`,
marcá `[x]` SOLO estas tareas (B.1.* y B.2.*):

### B.1 — Base
- **B.1.1** — `pnpm add leaflet.markercluster @types/leaflet.markercluster` desde `frontend/`;
  regenerar `pnpm-lock.yaml` (CI usa `--frozen-lockfile`). OJO: `leaflet` (^1.9.4) y `dexie`
  (^4.4.5) YA están en `frontend/package.json`; solo agrega markercluster y sus tipos.
- **B.1.2** — Crear `frontend/src/app/core/services/incident-social.service.ts`: `follow`,
  `unfollow`, `corroborate` contra los endpoints de la Fase A. Seguí el patrón de
  `core/services/incident.service.ts` y `core/services/http.service.ts`.
- **B.1.3** — Crear `frontend/src/app/shared/components/map-picker/`: componente Leaflet
  reutilizable de selección de punto (lo consumirá el paso 3 del asistente y después el
  detalle de F3). En este slice: componente base + su spec. Exportalo en
  `shared/components/index.ts` (barrel).

### B.2 — Asistente de reporte
- **B.2.1** — Crear `frontend/src/app/core/services/report-draft.service.ts` con **dexie** (D6):
  persistir `ReportDraft` incluyendo `Blob` de archivos. `localStorage` NO sirve (solo cadenas;
  base64 infla ~33 % contra cuota ~5 MB).
- **B.2.2** — Specs del borrador: persiste y restaura con `Blob`; **sobrevive a un fallo de
  envío**; se descarta solo tras éxito.
- **B.2.3** — Ampliar `frontend/src/app/features/citizen-report/citizen-report.component.ts`
  (existente, enrutado en `reportar` por F1) al asistente de cuatro pasos (D10). NO crear otro
  componente de raíz.
- **B.2.4** — Indicador de progreso con los cuatro pasos del mock 09-02:
  `INFORMACIÓN BÁSICA`, `CATEGORIZACIÓN Y ARCHIVOS`, `UBICACIÓN`, `REVISIÓN`.
- **B.2.5** — Paso 1: título, prioridad sugerida, descripción inicial; validación bloquea el
  avance. Selector de prioridad con **cuatro** valores (`low|medium|high|critical`).
  **`critical` es la emergencia** — NO hay tipo de incidencia aparte ni dominio nuevo: ya
  existe en el esquema y en el backend, solo faltaba exponerla.
- **B.2.6** — Paso 2: categoría y adjuntos, comprimidos con `image-compressor.service.ts`
  (YA existe en `core/services/`) antes de subir.
- **B.2.7** — Paso 3: `map-picker` (recién creado) + `geolocation.service.ts` (YA existe en
  `core/services/`, revisalo). **Permiso denegado ⇒ selección manual**, nunca un flujo bloqueado.
- **B.2.8** — Paso 4: resumen completo y envío.
- **B.2.9** — Retroceder conserva los datos; recargar restaura paso y datos desde el borrador.
- **B.2.10** — Envío exitoso ⇒ crear incidencia, subir imágenes, descartar borrador y navegar
  al detalle. Fallo ⇒ conservar borrador y mostrar el error.
- **B.2.11** — **Interruptor «publicar de forma anónima»** en el asistente. Requiere sesión
  (sin ella el asistente no es alcanzable). Al activarlo, el envío incluye `is_anonymous = true`;
  el backend (AUD) hace que `citizen_id` apunte a la máscara y sella al autor real en
  `incident_reporters`. El frontend **NO** ve ni maneja el id real: si nunca lo recibe, no
  puede filtrarlo por descuido.
- **B.2.12** — **Aviso junto al interruptor**, consumiendo la constante que exporta AUD
  (anclada por `backend/src/modules/incidents/anonymous-mask.constants.ts`
  → `ANONYMOUS_MASK_DEVICE_UUID = 'anonymous'`; la especificidad del texto vive en el
  backend AUD/AUTH — localizá la constante de texto real antes de hardcodear). Visible sin
  interacción: **no** tooltip/acordeón/enlace. El texto dice que la identidad no se publica y
  que puede ser revelada, dejando registro, ante una denuncia por información falsa. Una sola
  versión del texto, en AUD, para que no se bifurque.
- **B.2.13** — Specs de publicación anónima: con el interruptor activo la incidencia sale
  rotulada como anónima; el detalle y el feed **no** exponen al autor real; el propio autor sí
  ve su incidencia en «mis reportes»; el aviso está presente y visible sin interacción; sin
  sesión el asistente **no** se completa.
- **B.2.14** — Enlace a `/registro` desde el login y desde el asistente. (Nota: `login` y
  `registro` YA están enrutados en `app.routes.ts` líneas ~13 y ~23; falta el enlace.)

**FUERA DE ALCANCE de este slice (NO implementar):** B.3 (feed), B.4 (mapa), toda la Fase A
(backend/database) y las tareas marcadas de la Fase A.

## 3. Artefactos a leer ANTES de implementar

- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/proposal.md`
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/specs/frontend-citizen/spec.md`
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/specs/incident-social/spec.md`
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/design.md`
  (decisiones clave: D6 borrador dexie, D9 orden asistente→feed→mapa, D10 wizard 4 pasos,
  D2 idempotencia, D3 sin soft-delete, D5 permisos, D7 optimismo/reversión, D8 clustering)
- `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md`
- `frontend/src/app/app.routes.ts` — asistente enrutado en `reportar`; `inicio` y `mapa`
  tienen placeholders `// PLACEHOLDER F4` (~líneas 197 y 233). **NO toques `mapa` en este
  slice**; en `inicio` reemplazá el placeholder SOLO si el slice lo requiere para navegar
  (lo natural es que B.3 feed lo reemplace — no fuerces el cambio acá).
- Referencia de patrones: `core/services/http.service.ts`, `core/services/incident.service.ts`,
  `core/services/geolocation.service.ts`, `core/services/image-compressor.service.ts`,
  `core/services/offline-sync.service.ts` (patrón dexie si lo hay), `shared/components/index.ts`.

## 4. Reglas duras

1. **Strict TDD**: specs de test primero → verlos fallar → implementar → verlos pasar.
2. **NO `git add/commit/push`** ni PRs. El humano commitea.
3. **NO tocar** la Fase A (backend/database/init.sh/e2e de Fase A).
4. Idioma: este proyecto usa español en specs/tasks y en el código del frontend existente
   (componentes HTML/TS y specs). Seguí el idioma del código existente que extendés.
   No inventes convenciones nuevas.
5. Actualizá `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/apply-progress.md`
   (merge, NO pises: ya existe con la Fase A).
6. Marcá `[x]` en `tasks.md` SOLO las tareas B.1.* y B.2.* que completes.

## 5. Verificación obligatoria (desde `frontend/`)

```bash
pnpm install               # por si agregaste leaflet.markercluster
npm test                   # Jest 30.4.2 + jest-preset-angular (60+ specs existentes)
npx tsc --noEmit           # typecheck
npm run lint               # ESLint
```

Slice 1 se considera éxito con unit tests + typecheck + lint verdes.
**NO corras Playwright e2e** (no aplican a este slice y son lentos).
No corras nada del backend.

## 6. Entregable al terminar

- Código en el working tree, tests verdes, tasks B.1.* y B.2.* marcadas `[x]`,
  `apply-progress.md` actualizado.
- Reportame (en chat, no commits): resumen de lo implementado, comandos de test corridos y
  resultados, gotchas encontradas, y la agrupación por work unit de los archivos para que el
  orquestador pueda redactar los bloques de commit que el humano copiará y pegará.