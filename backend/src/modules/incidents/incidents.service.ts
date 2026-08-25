import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../core/core.module';
import { IncidentStatus } from '../../entities/incident.entity';
import { ALL_ZONES_TAG, GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubjectScope } from '../../common/authz/subject-scope';
import { scopeCacheKey } from '../../common/authz/scope-sql';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentRow, IncidentsRepository } from './incidents.repository';

export const INCIDENTS_STREAM_KEY = 'incidents:events';
const INCIDENTS_LIST_CACHE_TTL_MS = 30_000;

// Re-exported so every existing importer of `ALL_ZONES_TAG` from this module
// keeps compiling unchanged (T3.8 design D10). The constant itself now lives
// in geofencing.service.ts, alongside the tag machinery (tagCacheKey /
// purgeZoneCache) it is purged through.
export { ALL_ZONES_TAG };

/**
 * Legal forward-only transitions (spec R2: pending -> in_progress ->
 * resolved). Anything else — including same-status no-ops and backward
 * moves — is rejected.
 */
// `closed` is the terminal state reached only through the admin
// approve flow (T5.6). It is intentionally absent from this map:
// `PATCH /incidents/:id/status` MUST NOT let an operator reach `closed`
// directly — the only path to `closed` is the dedicated approve path in
// IncidentApprovalService, which writes the row inside a transaction
// and stamps `approved_by/at` in the same statement.
const LEGAL_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};

/**
 * IncidentsService (T2.1) — calibration slice; establishes the
 * create -> resolve-zone -> persist -> purge-cache -> emit convention that
 * Comments/Assignments/Realtime follow.
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly incidentsRepository: IncidentsRepository,
    private readonly geofencingService: GeofencingService,
    private readonly organizationsService: OrganizationsService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Per R2: an incident outside all defined boundaries MUST still be
   * accepted (201), persisted with zone_id=null, geofence_matched=false.
   * GeofencingService.resolveZone never throws for "outside a zone" — only
   * for malformed coordinates.
   *
   * `organization_id` is derived from the resolved ZONE (T3.2 design D4),
   * never from the creator's own organization — the creator is
   * overwhelmingly a citizen/anonymous device with no organization, so
   * "creator's org" would leave scoping inert for the flow that matters.
   * NULL when outside every zone, or the zone has no organization.
   *
   * T7.5.C4 — aligned with `notifiedFor()`'s `is_claimable` criterion: the
   * "primary" org is the first of `findNotifiedFor(zoneId, null)`'s stable
   * `(created_at, id)` order, not an arbitrary `findByZone` row (which
   * stopped being deterministic once 0034 dropped `uq_organizations_zone`
   * — several orgs can now share a zone). `categoryId` is unknown at
   * creation time (incidents aren't categorized on create), so `null` is
   * passed — matching only transversal orgs plus zone ancestry.
   */
  async create(dto: CreateIncidentDto, citizenId: string): Promise<IncidentRow> {
    const { zone_id: zoneId } = await this.geofencingService.resolveZone({
      lat: dto.lat,
      lng: dto.lng,
    });

    const orgs = await this.organizationsService.findNotifiedFor(zoneId, null);
    const org = orgs[0] ?? null;

    const row = await this.incidentsRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      lat: dto.lat,
      lng: dto.lng,
      priority: dto.priority ?? 'medium',
      citizenId,
      zoneId,
      geofenceMatched: zoneId !== null,
      organizationId: org?.id ?? null,
    });

    await this.purgeListCaches(zoneId);
    await this.publish('incident.created', row);

    return row;
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3) — never optional,
   * never defaulted; an unscoped call fails `tsc`, not a silent `global`
   * leak. The list cache KEY carries the scope discriminator (design
   * "Scope-blind list cache" risk mitigation) — threading scope into the
   * repository alone would still serve org A's cached array to org B.
   */
  async findAll(
    zoneId: string | undefined,
    status: IncidentStatus | undefined,
    scope: SubjectScope,
  ): Promise<IncidentRow[]> {
    const key = this.listCacheKey(zoneId, status, scope);
    const cached = await this.cache.get<IncidentRow[]>(key);
    if (cached) {
      return cached;
    }

    const rows = await this.incidentsRepository.findAll({ zoneId, status }, scope);
    await this.cache.set(key, rows, INCIDENTS_LIST_CACHE_TTL_MS);

    // Register under the zone's tag-set so a later write purges EVERY cached
    // variant of this list, including status-filtered ones. Deleting keys by
    // name cannot do that: the writer does not know which status filters a
    // reader happened to use.
    if (zoneId) {
      await this.geofencingService.tagCacheKey(zoneId, key);
    }
    // Unzoned listings reflect every zone, so any write must invalidate them.
    await this.geofencingService.tagCacheKey(ALL_ZONES_TAG, key);

    return rows;
  }

  async findOne(id: string, scope: SubjectScope): Promise<IncidentRow> {
    const row = await this.incidentsRepository.findOne(id, scope);
    if (!row) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return row;
  }

  async updateStatus(
    id: string,
    nextStatus: IncidentStatus,
    actorId: string,
    scope: SubjectScope,
  ): Promise<IncidentRow> {
    const current = await this.incidentsRepository.findOne(id, scope);
    if (!current) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const allowed = LEGAL_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Illegal status transition: ${current.status} -> ${nextStatus}`,
      );
    }

    const updated = await this.incidentsRepository.updateStatus(id, nextStatus);
    if (!updated) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    await this.purgeListCaches(updated.zone_id);
    await this.publish('incident.status_changed', {
      ...updated,
      actor_id: actorId,
      previous_status: current.status,
    });

    return updated;
  }

  private async publish(type: string, data: unknown): Promise<void> {
    this.eventEmitter.emit(type, data);
    await this.redis.xadd(INCIDENTS_STREAM_KEY, '*', 'type', type, 'data', JSON.stringify(data));
  }

  private listCacheKey(
    zoneId: string | undefined,
    status: string | undefined,
    scope: SubjectScope,
  ): string {
    return `incidents:list:${zoneId ?? 'all'}:${status ?? 'all'}:${scopeCacheKey(scope)}`;
  }

  /**
   * Purges every cached listing affected by a write: the zone's own tagged
   * keys plus the unzoned ones.
   */
  private async purgeListCaches(zoneId: string | null): Promise<void> {
    await this.geofencingService.purgeZoneCache(zoneId);
    await this.geofencingService.purgeZoneCache(ALL_ZONES_TAG);
  }

  // ---- T5.6 PATCH/DELETE

  /**
   * `PATCH /api/incidents/:id` — admin edits to title / description /
   * category_id. Immutable fields (status, zone_id, organization_id,
   * geofence_matched) are NOT in the DTO and cannot be touched.
   */
  async update(
    id: string,
    dto: { title?: string; description?: string; categoryId?: string | null },
  ): Promise<IncidentRow> {
    const incident = await this.incidentsRepository.findOne(id, {
      kind: 'public',
      organizationId: null,
    } as never);
    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return this.incidentsRepository.update(id, {
      title: dto.title !== undefined ? dto.title : incident.title,
      description: dto.description !== undefined ? dto.description : incident.description,
      categoryId:
        dto.categoryId !== undefined ? dto.categoryId : incident.category_id,
    });
  }

  /**
   * `DELETE /api/incidents/:id` — T6.2: real soft delete using `deleted_at`
   * column (migration 0025). Sets `deleted_at = NOW()` so the row is
   * invisible to all queries that filter `AND deleted_at IS NULL`.
   * `comments`, `assignments`, and `status_history` rows survive (no CASCADE).
   */
  async softDelete(id: string): Promise<void> {
    const incident = await this.incidentsRepository.findOne(id, { kind: 'global' } as SubjectScope);
    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    await this.incidentsRepository.softDelete(id);
  }

  /**
   * T6.8.A4 — return the catalog of valid incident statuses.
   * Exposed as GET /incidents/statuses and aliased at GET /estados.
   */
  getStatuses(): { id: IncidentStatus; label: string }[] {
    return [
      { id: 'pending', label: 'Pendiente' },
      { id: 'in_progress', label: 'En progreso' },
      { id: 'resolved', label: 'Resuelto' },
      { id: 'closed', label: 'Cerrado' },
    ];
  }
}
