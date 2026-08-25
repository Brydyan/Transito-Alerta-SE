import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import {
  CLAIM_LIMIT_REACHED,
  INCIDENT_ALREADY_CLAIMED,
  INCIDENT_NOT_CLAIMED,
  NOT_THE_CLAIMER,
  WRONG_ORGANIZATION,
} from './incident-workflow.errors';
import { unwrapReturningRows } from './incidents.repository';
import { AvailableOperatorDto } from './dto/available-operator.dto';
import { ClaimReleaseResponseDto } from './dto/claim-release-response.dto';

// Shape of the row returned by the CAS UPDATE statements; we cast and then
// re-project into ClaimReleaseResponseDto at the controller boundary. The
// service does not depend on the TypeORM entity because the claim/release
// write paths use raw SQL (D1 in design.md — atomic CAS, no SELECT-then-UPDATE).
interface IncidentRow {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  claimed_by: string | null;
  organization_id: string | null;
  updated_at: Date;
}

// AuthContext shape — same fields the rest of the codebase reads from req.user.
interface OperatorUser {
  id: string;
  organizationId: string | null;
  role: string | null;
}

const SYSTEM_ADMIN_ROLE = 'master';
const ALLOWED_STATUSES: ReadonlyArray<string> = ['pending', 'in_progress', 'resolved'];

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
         SET claimed_by = $1, claimed_at = NOW(), updated_at = now()
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
         SET claimed_by = NULL, updated_at = now()
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

  /** Static list of the IncidentStatus enum — no DB read (design D5). */
  getStatuses(): string[] {
    return [...ALLOWED_STATUSES];
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
