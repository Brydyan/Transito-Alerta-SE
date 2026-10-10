# sc-405 QA Fixes — work units aisladas

> Objetivo: corregir los defectos verificados del detalle de incidencia (SC-405)
> como work units independientes — UN commit por fix, sin mezclar contexto.
> Después del ticket se retoma el change de imágenes (apply pendiente).

## Estado: 7/7 fixes completos (rama `carlos_fp/sc-405/fix-sc-405-incident-detail-data-presentation`)

- Fix 1 R-ruta → `e81e401` fix(incidents): align operator locations route
- Fix 2 R-panel → `fc1e3b3` fix(incidents): close tracking panel on emitted (closed) event
- Fix 3 R-comentario → `66c66c0` fix(incidents): wrap composer in FormGroup to stop native submit reload
- Fix 4 R-close403 → `e1f5745` fix(incidents): resolve CLOSE permission by UUID, not formatted string
- Fix 5 R-claim → `b1a38b1` fix(incidents): claim transitions pending to in_progress and writes history
- Fix 6 R-historial → `a98b400` fix(incidents): seed status_history with the created->pending birth row
- Fix 7 R-anonymous → `a519f08` fix(database): restore the anonymous mask user row (QA R-anonymous)

Pendiente de resolver: push de `e81e401`..`a519f08` (autorizado; fixes 1-4 no confirmados en remoto).

## Cambios existentes (ya commiteados y pusheados)

- `86c2c0d` feat(migrations): 0066 grant READ status-history
- `24a54ed` chore(backend): script apply-pending-migrations
- `e0113ec` feat(incidents): images read path
- `fc5be06` feat(incidents): sc-405 detail data presentation
- `caff626` fix(incidents): actions dropdown flip upward
- `e813a31` test(incidents): comment thread T6

## Checklist fixes QA (un commit por ítem)

- [x] **R-ruta** — Modal Asignar vacío: frontend llama `GET /operators/locations` (plural, assignment.service.ts:104), backend expone `GET /operator/locations` (singular, operators.controller.ts @Controller('operator') + @Get('locations')). Alinear ruta.
- [x] **R-panel** — Tracking panel no cierra con X: panel emite `closed` (tracking-panel.component.ts:296), host escucha `(close)` (incident-list.component.html:170). Cambiar bind a `(closed)`.
- [x] **R-comentario** — Comentario recarga página: `<form (ngSubmit)="submit()">` sin `[formGroup]`/NgForm (solo ReactiveFormsModule) → submit nativo. Usar FormGroup + `[formGroup]`/`[formControlName]` o `(submit)` con preventDefault.
- [x] **R-close403** — 403 al cerrar: `incident-workflow.service.ts:292` compara `.includes('CLOSE incidents')` (string) contra UUIDs; traducir vía `PermissionLookupService.getUuid('incidents','CLOSE')` (patrón F6 guard). Frontend recibe strings → botón visible; backend debe comparar UUID.
- [x] **R-claim** — Reclamar no cambia la UI: CAS UPDATE setea claimed_by/claimed_at pero `status` queda `pending`; `availableActions` (workflow.util.ts) solo muestra release/resolve con status==='in_progress'. Transicionar pending→in_progress al claim (y escribir historial).
- [x] **R-historial** — Historial vacío: `status_history` está vacía; solo `changeStatus()` inserta. Sembrar fila "created/pending" en create() y escribir historial en claim().
- [x] **R-anonymous** — Falta fila `device_uuid='anonymous'` → "Anonymous mask row not found". Migración 0067 reparadora (insert-or-repair) o insert manual.

## Work unit extra (usabilidad operador, fuera del QA)

- [x] **Mapa → Google Maps** — El operador ve el mini-mapa Leaflet como vista previa y con un botón
  "Abrir en Google Maps" se delega la navegación real: URL `https://www.google.com/maps?q=lat,lng`
  armada desde las coordenadas (`openInGoogleMaps()`). Se registró el icono `external-link` en el
  set curado de Lucide (`app.config.ts`). El spec T5 (galería) se reemplazó por cobertura del botón
  (con y sin coordenadas). Commit `fe8b116`. Gate: suite incident-detail 17 verdes + build exit 0.

## Gates (verificados por fix)

- Backend: `pnpm test` (suite) + `pnpm build` — suite incidents+status-history 173 verdes, build exit 0, tras cada fix.
- Migración 0067: e2e propio (`test/migrations/anonymous-mask-restore.e2e-spec.ts`, 6 tests verdes con
  `DOCKER_HOST=unix:///run/user/1000/podman/podman.sock`) + aplicada en vivo en tase-postgres (fila restaurada, checksum registrado).
- Frontend: suite/buil del front — fixes 1-3 del front verificados en la sesión anterior; no se tocó front en fixes 5-7.
- Work tree limpio al cerrar (`.atl/*` y `odd/` quedan fuera deliberadamente).

## Estrategia

- Por defecto: commits individuales en esta rama, Conventional Commits.
- Los fixes son bugfixes del mismo change sc-405 (espec ya aprobada) — sin openspec nuevo.