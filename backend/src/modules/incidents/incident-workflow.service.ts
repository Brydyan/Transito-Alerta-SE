import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentStatus } from '../../entities/incident.entity';
import {
  ALLOWED_STATUSES,
  canTransition,
} from './incident-state-machine';
import {
  CLAIM_LIMIT_REACHED,
  INCIDENT_ALREADY_CLAIMED,
  INCIDENT_INVALID_TRANSITION,
  INCIDENT_NOT_CLAIMED,
  NOT_THE_CLAIMER,
  WRONG_ORGANIZATION,
} from './incident-workflow.errors';
import { unwrapReturningRows, IncidentRow } from './incidents.repository';
import { AvailableOperatorDto } from './dto/available-operator.dto';
import { ClaimReleaseResponseDto } from './dto/claim-release-response.dto';

// Shape of the row returned by the CAS UPDATE statements; we cast and then
// re-project into ClaimReleaseResponseDto at the controller boundary. The
// service does not depend on the TypeORM entity because the claim/release
// write paths use raw SQL (D1 in design.md — atomic CAS, no SELECT-then-UPDATE).
//
// F1 (sc-315) — el tipo `status` ahora incluye `'closed'`, alineado con
// `incident.entity.ts:8` y con la máquina de estados. La lista local
// `ALLOWED_STATUSES` se retiró (D3): dos listas mantenidas a mano
// divergieron y fue la causa raíz del defecto.
// `IncidentRow` ahora se importa del repository (de donde ya se importa
// `unwrapReturningRows`) para tener una sola definición de la fila.

// AuthContext shape — same fields the rest of the codebase reads from req.user.
interface OperatorUser {
  id: string;
  organizationId: string | null;
  role: string | null;
}

const SYSTEM_ADMIN_ROLE = 'master';

/**
 * T5.1 — operator claim/release lifecycle + available-operators + status catalog.
 * Mirrors GeoReporta's IncidentClaimService with the differences called out
 * in design.md (raw SQL CAS, per-org max_active_claims, slim response shape).
 */
@Injectable()
export class IncidentWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
  ) {}

  /**
   * Claim an unclaimed incident. Throws:
   *  - NotFoundException(404) if the incident does not exist.
   *  - ForbiddenException(WRONG_ORGANIZATION, 403) unless the caller is a system admin.
   *  - HttpException(CLAIM_LIMIT_REACHED, 429) if the operator is at the org's cap.
   *  - ConflictException(INCIDENT_ALREADY_CLAIMED, 409) on CAS miss.
   */
  async claim(incidentId: string, operator: OperatorUser): Promise<ClaimReleaseResponseDto> {
    // 1) Load incident. Cast to the row shape we control (we trust the column order).
    const incident = await this.loadIncident(incidentId);

    // 2) Same-org check, with system-admin escape hatch.
    if (
      operator.role !== SYSTEM_ADMIN_ROLE &&
      incident.organization_id !== operator.organizationId
    ) {
      throw new ForbiddenException(WRONG_ORGANIZATION);
    }

    // 3) Org-wide cap (only meaningful when there is an org to read from).
    if (incident.organization_id) {
      const maxActive = await this.maxActiveClaimsFor(incident.organization_id);
      const active = await this.activeClaimCountFor(operator.id);
      if (active >= maxActive) {
        throw new HttpException(CLAIM_LIMIT_REACHED, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 4) Atomic CAS — 0 rows = someone else already claimed it.
    //    TypeORM's pg driver wraps UPDATE/DELETE RETURNING as [rows, count]
    //    (regression 7284831), so we route through the shared unwrap helper.
    const result = await this.dataSource.query(
      // T6.3: also write claimed_at = NOW() when claiming
      `UPDATE incidents
         SET claimed_by = $1, claimed_at = NOW()
       WHERE id = $2 AND claimed_by IS NULL
       RETURNING id, title, status, priority, claimed_by, organization_id, updated_at`,
      [operator.id, incidentId],
    );
    const rows = unwrapReturningRows<IncidentRow>(result);
    if (rows.length === 0) {
      throw new ConflictException(INCIDENT_ALREADY_CLAIMED);
    }
    return this.toResponse(rows[0]);
  }

  /**
   * Release the caller's own claim. Throws:
   *  - NotFoundException(404) if the incident does not exist.
   *  - ConflictException(INCIDENT_NOT_CLAIMED, 409) if claimed_by is null.
   *  - ForbiddenException(NOT_THE_CLAIMER, 403) if claimed_by != caller.
   */
  async release(incidentId: string, operator: OperatorUser): Promise<ClaimReleaseResponseDto> {
    const incident = await this.loadIncident(incidentId);

    if (incident.claimed_by === null) {
      throw new ConflictException(INCIDENT_NOT_CLAIMED);
    }
    if (incident.claimed_by !== operator.id) {
      throw new ForbiddenException(NOT_THE_CLAIMER);
    }

    const result = await this.dataSource.query(
      `UPDATE incidents
         SET claimed_by = NULL
       WHERE id = $1
       RETURNING id, title, status, priority, claimed_by, organization_id, updated_at`,
      [incidentId],
    );
    const rows = unwrapReturningRows<IncidentRow>(result);
    return this.toResponse(rows[0]);
  }

  /**
   * Operators in the incident's org whose active in_progress claim count is
   * strictly less than the org cap, excluding the current claimer.
   */
  async availableOperators(incidentId: string): Promise<AvailableOperatorDto[]> {
    const incident = await this.loadIncident(incidentId);
    if (!incident.organization_id) {
      return [];
    }
    const maxActive = await this.maxActiveClaimsFor(incident.organization_id);

    const rows = await this.dataSource.query<
      Array<{ id: string; name: string; email: string | null; active_count: string }>
    >(
      `SELECT u.id,
              u.device_uuid AS name,
              u.email,
              COALESCE((
                SELECT COUNT(*)::int
                  FROM incidents
                 WHERE claimed_by = u.id AND status = 'in_progress'
              ), 0) AS active_count
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND r.name IN ('operador_org', 'operador_sistema')
          AND ($2::uuid IS NULL OR u.id <> $2::uuid)
          AND COALESCE((
                SELECT COUNT(*)
                  FROM incidents
                 WHERE claimed_by = u.id AND status = 'in_progress'
              ), 0) < $3`,
      [incident.organization_id, incident.claimed_by, maxActive],
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      activeClaimCount: Number(r.active_count),
    }));
  }

  /** Static list of the IncidentStatus enum — derived from the state machine (D3/D5).
   *  La lista se calcula desde `Object.keys(TRANSITIONS)` (vía `ALLOWED_STATUSES`)
   *  para que `closed` no pueda volver a quedarse declarado en el tipo y ausente
   *  del servicio: añadir un estado al grafo lo hace visible acá sin una
   *  segunda lista a mano. */
  getStatuses(): IncidentStatus[] {
    return [...ALLOWED_STATUSES];
  }

  /** F1 (sc-315 D2/D3) — valida la transición contra la máquina de estados.
   *  Devuelve `true` si la transición está declarada; `false` en caso contrario.
   *  El controlador / servicio que la usa debe traducir el `false` a 409 con
   *  el motivo (`canTransition` es pura — no decide el código HTTP). */
  canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
    return canTransition(from, to);
  }

  /**
   * F1 (sc-315 S.3.4 + S.5) — cambia el estado de una incidencia
   * validando contra la máquina de estados y escribiendo el historial
   * ATÓMICAMENTE en la misma transacción (D5 del design).
   *
   * Reglas:
   *  - Si la transición no está declarada → 409 `INCIDENT_INVALID_TRANSITION`
   *    con el motivo explícito.
   *  - Si `to === 'closed'` y no se aporta `closedReason` → 422 (D4).
   *  - Si `to === 'closed'` y el actor no tiene `CLOSE incidents` → 403 (D8).
   *    (Verificar este permiso es responsabilidad del llamante —
   *    `IncidentWorkflowController.changeStatus()` lo hace con
   *    `RequirePermission('CLOSE', 'incidents')` cuando `to === 'closed'`.
   *    Acá validamos el payload y la transición, no el rol del actor.)
   *  - La escritura del `status_history` y el UPDATE de `incidents`
   *    van en la misma transacción `DataSource.transaction`. Si la
   *    inserción del historial falla, el estado NO cambia (S.5.1).
   *
   * @returns la fila de la incidencia ya actualizada, con `closed_reason`
   *          poblado si `to === 'closed'`.
   */
  async changeStatus(args: {
    incidentId: string;
    to: IncidentStatus;
    actorId: string;
    actorPermissions: ReadonlyArray<string>;
    closedReason?: string;
  }): Promise<IncidentRow> {
    const { incidentId, to, actorId, actorPermissions, closedReason } = args;

    return this.dataSource.transaction(async (manager) => {
      // 1) Bloquear la fila para evitar carreras con approve/reject o
      //    otro changeStatus en vuelo. SELECT ... FOR UPDATE.
      //    Traemos `closed_reason` porque si la fila ya está en `closed`
      //    (re-apertura en el futuro) queremos poder razonar sobre el
      //    motivo previo sin un round-trip extra.
      const currentRows = await manager.query<IncidentRow[]>(
        `SELECT id, title, status, priority, claimed_by, organization_id, closed_reason
           FROM incidents
          WHERE id = $1
          FOR UPDATE`,
        [incidentId],
      );
      if (currentRows.length === 0) {
        throw new NotFoundException(`Incident ${incidentId} not found`);
      }
      const from = currentRows[0].status;

      // 2) Validar la transición contra la máquina.
      if (!canTransition(from, to)) {
        throw new ConflictException({
          code: INCIDENT_INVALID_TRANSITION,
          message: `Illegal status transition: ${from} -> ${to}`,
          from,
          to,
        });
      }

      // 3) Si transiciona a 'closed', exigir motivo (D4) y permiso CLOSE
      //    (D8). El permiso se valida también en el controller vía
      //    `@RequirePermission('CLOSE', 'incidents')` cuando `to === 'closed'`,
      //    pero acá lo verificamos de nuevo como defensa en profundidad
      //    (un consumidor que invoque el servicio sin pasar por el
      //    controller sigue protegido).
      //
      //    sc-315 C5 (ronda 2) — el código de respuesta del motivo
      //    faltante es **422 Unprocessable Entity**, no 400. El contrato
      //    (spec.md, design.md Data Flow) lo dice y la diferencia
      //    importa: 400 = payload mal formado, 422 = payload bien
      //    formado pero reglas de negocio no satisfechas. Un motivo
      //    ausente con `status: 'closed'` es exactamente lo segundo.
      if (to === 'closed') {
        if (!closedReason || closedReason.trim().length === 0) {
          throw new UnprocessableEntityException({
            code: 'INCIDENT_CLOSED_REASON_REQUIRED',
            message: 'closing an incident requires a non-empty reason',
          });
        }
        if (!actorPermissions.includes('CLOSE incidents')) {
          throw new ForbiddenException({
            code: 'INCIDENT_CLOSE_PERMISSION_REQUIRED',
            message: 'closing an incident requires the CLOSE incidents permission',
          });
        }
      }

      // 4) UPDATE incidents. `closed_reason` se persiste junto al estado
      //    para que un informe lo consulte sin recorrer el historial
      //    (D4 del design) — y se devuelve en el `RETURNING` para que
      //    el caller (controller, frontend de F3) lo vea en la misma
      //    respuesta del PATCH sin un GET extra.
      //    `resolution_date` se mantiene coherente con la semántica
      //    previa (T6.3): se setea en `resolved`, NULL en `closed`.
      const isResolution = to === 'resolved';
      const updatedRows = await manager.query<IncidentRow[]>(
        `UPDATE incidents
            SET status = $2,
                closed_reason = CASE WHEN $2 = 'closed' THEN $3 ELSE NULL END,
                resolution_date = CASE WHEN $4 THEN NOW() ELSE NULL END
          WHERE id = $1
        RETURNING id, title, status, priority, claimed_by, organization_id, closed_reason`,
        [incidentId, to, closedReason ?? null, isResolution],
      );
      const updated = updatedRows[0];
      if (!updated) {
        // No debería pasar — la fila está bloqueada arriba.
        throw new NotFoundException(`Incident ${incidentId} not found`);
      }

      // 5) Insertar en status_history en la MISMA transacción. Si esto
      //    falla, el UPDATE de arriba se revierte (S.5.1). El `notes`
      //    carga el motivo del cierre para que la auditoría posterior
      //    pueda reconstruir por qué se dio de baja sin joins extra.
      //    El `event_id` se genera server-side con `gen_random_uuid()`
      //    — la unicidad la garantiza la columna UNIQUE de la tabla
      //    y hace la escritura idempotente contra replay del listener.
      const historyNotes =
        to === 'closed' ? `[closed] ${closedReason}` : null;
      await manager.query(
        `INSERT INTO status_history
            (incident_id, changed_by_user_id, previous_status, new_status, notes, event_id)
         VALUES ($1, $2, $3, $4, $5, gen_random_uuid()::text)`,
        [incidentId, actorId, from, to, historyNotes],
      );

      return updated as IncidentRow;
    });
  }

  // ---- private helpers ------------------------------------------------

  private async loadIncident(incidentId: string): Promise<IncidentRow> {
    const rows = await this.dataSource.query<IncidentRow[]>(
      `SELECT id, title, status, priority, claimed_by, organization_id, updated_at
         FROM incidents
        WHERE id = $1`,
      [incidentId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }
    return rows[0];
  }

  private async maxActiveClaimsFor(orgId: string): Promise<number> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    // Defensive default — the migration enforces a NOT NULL DEFAULT 5, but
    // a hot row created from a stale entity cache could read undefined.
    return org?.maxActiveClaims ?? 5;
  }

  private async activeClaimCountFor(userId: string): Promise<number> {
    const rows = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::int AS count
         FROM incidents
        WHERE claimed_by = $1 AND status = 'in_progress'`,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private toResponse(row: IncidentRow): ClaimReleaseResponseDto {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      claimedBy: row.claimed_by,
      organizationId: row.organization_id,
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }
}
