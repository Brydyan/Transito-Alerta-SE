# Apply Progress: T5.1 Incident Workflow

**Change**: t5.1-incident-workflow
**Implementer**: Minimax (Mavis)
**Date**: 2026-08-23
**Status**: READY FOR VERIFY

---

## Resumen

T5.1 entrega el ciclo de vida de operator claim/release sobre el módulo `incidents`
existente, con catálogo de status y consulta de operadores elegibles. Cuatro endpoints
nuevos, una migración 0019, una entidad extendida en dos entidades, un nuevo servicio
y controller, y suite de tests completa.

## Tareas completadas (todas las fases)

### Fase 0 — Error constants
- ✅ `backend/src/modules/incidents/incident-workflow.errors.ts` con 5 códigos:
  `INCIDENT_ALREADY_CLAIMED`, `INCIDENT_NOT_CLAIMED`, `WRONG_ORGANIZATION`,
  `CLAIM_LIMIT_REACHED`, `NOT_THE_CLAIMER`

### Fase 1 — Migration 0019
- ✅ `database/migrations/0019_incident_claim.sql`:
  - `ALTER TABLE incidents ADD COLUMN claimed_by uuid REFERENCES users(id) ON DELETE SET NULL`
  - `CREATE INDEX idx_incidents_claimed_by` (parcial, WHERE NOT NULL)
  - `ALTER TABLE organizations ADD COLUMN max_active_claims int NOT NULL DEFAULT 5 CHECK (> 0)`
  - Extiende `permissions.action` CHECK para admitir `CLAIM` y `RELEASE`
  - Seed de permission rows
  - UPDATE del JSONB `roles.permissions` para `operador_organizacion` y `operador_sistema`
- ✅ `database/rollback/0019_incident_claim.DOWN.sql` simétrico
- ✅ Entrada en `database/MIGRATION_LOG.md`
- ✅ `PermissionAction` union extendido en `require-permission.decorator.ts`

### Fase 2 — Entidades
- ✅ `IncidentEntity.claimedBy: string | null`
- ✅ `OrganizationEntity.maxActiveClaims: number = 5`

### Fase 3 — Service
- ✅ `IncidentWorkflowService` con 4 métodos: `claim`, `release`, `availableOperators`, `getStatuses`
- ✅ CAS pattern para atomicidad (diseño D1): `UPDATE … WHERE claimed_by IS NULL RETURNING *`
- ✅ Re-uso de `unwrapReturningRows` (helper existente, ver A3 abajo) para parsear RETURNING de TypeORM pg driver
- ✅ Subquery en `availableOperators` para count de claims activos en `status = 'in_progress'`
- ✅ `getStatuses` constante pura sin DB read (diseño D5)

### Fase 4 — Unit tests (13/13 verde)
- `claim`: 6 escenarios (404, 403 wrong-org, admin cross-org, 429 limit, 409 CAS miss, happy path)
- `release`: 4 escenarios (404, 409 not-claimed, 403 not-claimer, happy path)
- `availableOperators`: 2 escenarios (sin org → [], happy path)
- `getStatuses`: 1 escenario (array exacto)

### Fase 5+6 — Controller + DTOs + module
- ✅ `IncidentWorkflowController` con 4 endpoints
  - **Orden de rutas crítico:** `@Get('statuses')` declarado **antes** de `@Get(':id/...')` para evitar shadowing por el `:id` del `IncidentsController` existente
  - `ClaimReleaseResponseDto` y `AvailableOperatorDto` en `dto/`
- ✅ `IncidentWorkflowController` registrado en `IncidentsModule.controllers` **antes** de `IncidentsController` (mismo motivo)
- ✅ `TypeOrmModule.forFeature([OrganizationEntity])` agregado al module

### Fase 7 — E2E tests (8/8 verde en 16.3s)
- `incident-workflow.e2e-spec.ts` cubre claim happy path, 409 conflict, 403 wrong-org, 403 not-claimer, status catalog, available-operators, 401 unauth

---

## Verificación final

| Check | Resultado |
|-------|-----------|
| `pnpm test` (unit) | ✅ 78 suites / 727 tests (+13 nuevos del workflow service) |
| `pnpm run test:e2e --runInBand` | ✅ 16 suites / 146 tests (+8 nuevos del workflow e2e) |
| `pnpm run typecheck` | ✅ 0 errores |
| `pnpm run lint` | ✅ 0 errores, 16 warnings pre-existentes |
| `pnpm run build` | ✅ clean |

## Desviaciones del diseño

### A1 — Sin `role_permissions` table (gap pre-existente)
La tabla `role_permissions` referenciada en la propuesta y el diseño **nunca fue creada
por ninguna migración**. La práctica real del proyecto (visible en 0018) es usar
la columna JSONB `roles.permissions` para los permission checks. La migración 0019
sigue el mismo patrón: `UPDATE roles SET permissions = permissions || jsonb_build_array(...)`.
El `role_permissions` INSERT propuesto en el diseño fue removido.

### A2 — Orden de controllers / rutas
La ruta literal `GET /api/incidents/statuses` choca con el wildcard `GET /api/incidents/:id`
del `IncidentsController` existente. Para que el matching funcione, el `IncidentWorkflowController`
tiene que estar declarado **antes** de `IncidentsController` en el array `controllers` del
module. Hecho.

### A3 — TypeORM UPDATE...RETURNING tuple unwrap
Mismo bug que la regresión 7284831: el driver pg de TypeORM envuelve el resultado de
`UPDATE...RETURNING` como `[rows, rowCount]`, no como rows directamente. El helper
`unwrapReturningRows` ya existía en `incidents.repository.ts` — lo reusé en el service.
Sin esto, el service retornaba `{updated_at: null}` (todos los campos undefined) y el
test 409 nunca se disparaba porque la operación parecía "exitosa" pero sin datos.

### A4 — Permisos en `provisionUser`
El test e2e pasa los permisos explícitamente (`['CREATE incidents', 'CLAIM incidents', 'RELEASE incidents']`).
La columna `users.permissions` se setea con esos valores directamente — el JSONB de la
role se ignora en este flow. Esto es consistente con cómo los otros e2e tests provisionan
usuarios con permisos custom.

### A5 — Skip del test 429 (max_active_claims)
El escenario "operador al límite" no se cubre en e2e — el unit test (13 tests) cubre
esa rama. En e2e, simularlo requeriría crear N incidentes `in_progress`, lo cual
añade ~30s a la suite sin valor sobre el unit test que ya lo verifica.

## Archivos modificados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `database/migrations/0019_incident_claim.sql` | nuevo | migración UP |
| `database/rollback/0019_incident_claim.DOWN.sql` | nuevo | rollback |
| `database/MIGRATION_LOG.md` | modificado | entrada 0019 |
| `backend/src/common/decorators/require-permission.decorator.ts` | modificado | `PermissionAction` extended |
| `backend/src/entities/incident.entity.ts` | modificado | `claimedBy` column |
| `backend/src/entities/organization.entity.ts` | modificado | `maxActiveClaims` column |
| `backend/src/modules/incidents/incident-workflow.errors.ts` | nuevo | 5 error codes |
| `backend/src/modules/incidents/incident-workflow.service.ts` | nuevo | service |
| `backend/src/modules/incidents/incident-workflow.controller.ts` | nuevo | controller |
| `backend/src/modules/incidents/dto/claim-release-response.dto.ts` | nuevo | DTO |
| `backend/src/modules/incidents/dto/available-operator.dto.ts` | nuevo | DTO |
| `backend/src/modules/incidents/incident-workflow.service.spec.ts` | nuevo | 13 unit tests |
| `backend/src/modules/incidents/incidents.module.ts` | modificado | registra controller + service |
| `backend/test/e2e/incident-workflow.e2e-spec.ts` | nuevo | 8 e2e tests |
| `openspec/changes/t5.1-incident-workflow/tasks.md` | modificado | todas `[x]` |

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/t5.1-incident-workflow/specs/**`
- `openspec/changes/t5.1-incident-workflow/design.md`
- `openspec/changes/t5.1-incident-workflow/proposal.md`
- Cualquier controller / service / entity existente (cambios aditivos)
- `openspec/config.yaml`

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
