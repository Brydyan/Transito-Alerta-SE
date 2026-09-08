Retomá la ronda 5 del change SDD F3 (sc-303) con esta orden de trabajo.

CHANGE: openspec/changes/front/2026-08-29-f3-incidents-module/
RONDA: 5 — remediación del verify ronda 4 (FAIL: 1 CRITICAL C2 + W1 + W2)
WORKING DIR: frontend/ (todo el código dentro de frontend/; corré los gates desde ahí)
NO COMMITEAR: dejá el working tree listo; el usuario commitea él mismo.

LEÉ PRIMERO, EN ORDEN:
1. openspec/changes/front/2026-08-29-f3-incidents-module/fixes-required.md — la orden normativa de esta ronda
2. openspec/changes/front/2026-08-29-f3-incidents-module/verify-report.md — hallazgos completos de la ronda 4
3. openspec/changes/front/2026-08-29-f3-incidents-module/tasks.md — boxes a re-marcar honestamente (F3.4.7)
4. openspec/changes/front/2026-08-29-f3-incidents-module/apply-progress.md — progreso existente; AGREGÁ una sección "Ronda 5" al final, NO pisés las rondas anteriores
5. openspec/changes/front/2026-08-29-f3-incidents-module/specs/frontend-incidents/spec.md — spec a alinear (W1)
6. /home/carlosfpatino/.config/opencode/skills/sdd-apply/SKILL.md — disciplina de fase (leelo antes de tocar nada)

SCOPE — exactamente estos tres ítems, nada más (sin refactors, sin features extra):

## C2 (CRITICAL, bloquea archive) — releaseIncident tipado mal + corrupción del detalle
VERIFICÁ primero en el backend, no asumas: POST /incidents/:id/release devuelve ClaimReleaseResponseDto, que tras SnakeCaseResponseInterceptor llega al cliente como shape slim de 7 campos snake_case: id, title, status, priority, claimed_by, organization_id, updated_at. NO es el Incident completo de 25 campos. Confirmalo en backend/src/modules/incidents/dto/claim-release-response.dto.ts y backend/src/common/interceptors/snake-case-response.interceptor.ts.

1. frontend/src/app/core/services/incident.service.ts — releaseIncident(id): Observable<Incident> está mal. Declaralo Observable<ClaimReleaseResult> con un tipo local de exactamente esos 7 campos snake_case, definido en frontend/src/app/core/models/incident.model.ts junto a los otros tipos de incident (espejo del wire tras el interceptor). TAMBIÉN corregí el tap del cache: hoy reemplaza el Incident cacheado entero con el objeto slim — eso corrompe el cache de incidents$ igual. Merge: { ...inc, ...released }.
2. frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts — onAction('release') next: NO uses this.incident.set(released). Ruta (a) merge parcial: this.incident.update(cur => cur ? { ...cur, ...released } : cur). Mantené el refresh del historial tras éxito y el camino de error (toast + getIncident(id)) intactos.
3. frontend/src/app/features/incidents/incident-detail/incident-detail.component.spec.ts — el mock del test C2 de éxito debe devolver SOLO el shape slim de 7 campos (construido como ClaimReleaseResult, NO { ...claimedIncident, ... }), y el test debe asertar que los campos FUERA de los 7 (description, lat, citizen_id) se CONSERVAN tras la acción. Esa aserción debe FALLAR contra el código pre-fix.
4. frontend/src/app/core/services/incident.service.spec.ts — agregá cobertura de releaseIncident (es el único método del service sin test): asertá URL POST /incidents/:id/release, body {}, y aserciones POSITIVAS y NEGATIVAS del shape de respuesta — mismo estilo que los tests de C1 (~líneas 70-88, ej. params.has('search') === false).

## W1 — spec.md honesto (specs/frontend-incidents/spec.md)
Los escenarios "Filtros combinados" (estado+prioridad), "Búsqueda por texto" y "Conteo" («Mostrando 1-10 de 14 incidencias») describen capacidades retiradas en la ronda 4 (C1): el selector de prioridad y la búsqueda libre no llegan al backend, y el formato ahora es "Mostrando N de N". Reescribí esos escenarios al comportamiento implementado O anotalos explícitamente como "capacidad diferida — ver C1 ronda 4". El spec no puede describir capacidades que el código no tiene. Mantené la notación EARS del resto del spec.

## W2 — gate de permisos en workflow.util.ts que coincida con el backend
frontend/src/app/features/incidents/workflow.util.ts gatea claim/release/resolve con permissions.includes('UPDATE incidents'). VERIFICÁ el RequirePermission exacto por acción en backend/src/modules/incidents/incident-workflow.controller.ts (esperado: CLAIM incidents / RELEASE incidents; resolve/close pueden diferir — comprobá, no asumas). Alineá el gate del frontend al permiso REAL por acción. Consecuencia a corregir: operador_sistema tiene CLAIM/RELEASE en los seeds (database/migrations/0019_incident_claim.sql) pero nunca ve los botones.

Actualizá TODOS los tests afectados:
- workflow.util.spec.ts — ALL_USER_PERMS, UPDATE_ONLY y cada caso de la matriz que ejercite claim/release/resolve.
- incident-detail.component.spec.ts — los setups que pasan permissions: ['UPDATE incidents'] para flujos de claim/release deben pasar los permisos reales; solo los tests que genuinamente necesitan UPDATE lo conservan.

GATES (desde frontend/):
- pnpm test — suite completa. Reportá números exactos (baseline: 41 suites / 290 tests antes de tus cambios).
- pnpm run build — debe salir exit 0.
- pnpm lint NO existe en este repo (gap preexistente) — no lo inventes.
- npx tsc -b --noEmit tiene ~14 errores preexistentes ajenos a F3 (deuda @types/node + auth.service.spec.ts). No es regresión; solo confirmá que ningún archivo que toques aparezca en la lista de errores.

IDIOMA: docs del change (tasks.md, apply-progress.md, spec.md) en español neutral, estilo de los archivos existentes. Código: estilo del archivo que toques. UI copy en español.

RESULTADO — reportá al final:
- status: succeeded | failed | blocked
- executive_summary: qué cambió + números exactos de gates (suites/tests, build)
- artifacts: archivos tocados (paths)
- risks: lo que quede abierto
- next_recommended: verify