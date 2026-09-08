import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { AuthConfig } from '../../config/auth.config';
import { IncidentStatus } from '../../entities/incident.entity';
import { ALL_ZONES_TAG, GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubjectScope } from '../../common/authz/subject-scope';
import { scopeCacheKey } from '../../common/authz/scope-sql';
import { ALLOWED_STATUSES } from './incident-state-machine';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentRow, IncidentsRepository } from './incidents.repository';

export const INCIDENTS_STREAM_KEY = 'incidents:events';
const INCIDENTS_LIST_CACHE_TTL_MS = 30_000;

/** T7.7 (0036) — `check_is_leaf_category()` raises with this Postgres code (23514, check_violation). */
const PG_CHECK_VIOLATION = '23514';

function isLeafCategoryViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === PG_CHECK_VIOLATION
  );
}

// Re-exported so every existing importer of `ALL_ZONES_TAG` from this module
// keeps compiling unchanged (T3.8 design D10). The constant itself now lives
// in geofencing.service.ts, alongside the tag machinery (tagCacheKey /
// purgeZoneCache) it is purged through.
export { ALL_ZONES_TAG };

/**
 * IncidentsService (T2.1) — calibration slice; establishes the
 * create -> resolve-zone -> persist -> purge-cache -> emit convention that
 * Comments/Assignments/Realtime follow.
 *
 * sc-315 C4 (ronda 2) — el viejo `LEGAL_TRANSITIONS` y `updateStatus()`
 * se eliminaron. La transición de estado pasa por
 * `IncidentWorkflowService.changeStatus()` (vía PATCH /incidents/:id/status
 * en el controller), que es la única fuente de verdad contra la máquina
 * de estados. Dejar el gemelo aquí reintroducía el defecto 1 con
 * cobertura falsa — exactamente la trampa que motivó este change.
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
    // AUD (sc-327) D1/D3 — `DataSource` para resolver la fila
    // máscara (`users.device_uuid = 'anonymous'`) y abrir la
    // transacción que inserta `incidents` + `incident_reporters`
    // atómicamente. `ConfigService` para leer `anonymousDeviceUuid`
    // desde la config.
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
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

    const isAnonymous = dto.is_anonymous === true;
    // AUD (sc-327) D1 — si la publicación es anónima, el
    // `citizen_id` que se persiste en `incidents` es el id
    // de la fila máscara, no el del autor real. El autor real
    // va a `incident_reporters` con la misma transacción.
    const finalCitizenId = isAnonymous
      ? await this.resolveMaskUserId()
      : citizenId;

    const row = isAnonymous
      ? await this.dataSource.transaction(async (manager) => {
          // FIX-1 (ronda 11): el INSERT de `incidents` debe
          // correr sobre el `manager` de la transacción. Sin
          // esto, la fila commitea inmediatamente y queda
          // huérfana si el INSERT de `incident_reporters`
          // falla después. Mismo patrón que `AuditService`.
          const created = await this.incidentsRepository.create(
            {
              title: dto.title,
              description: dto.description ?? null,
              lat: dto.lat,
              lng: dto.lng,
              priority: dto.priority ?? 'medium',
              citizenId: finalCitizenId,
              zoneId,
              geofenceMatched: zoneId !== null,
              organizationId: org?.id ?? null,
              isAnonymous: true,
              categoryId: dto.category_id ?? null,
            },
            manager,
          );
          // Sello del autor real. Misma transacción: si la
          // inserción falla, el INSERT de `incidents` se
          // revierte. D2 (diseño): "una acción cuyo rastro
          // no se pudo guardar no debe quedar hecha".
          await manager.query(
            `INSERT INTO incident_reporters (incident_id, user_id) VALUES ($1, $2)`,
            [created.id, citizenId],
          );
          return created;
        })
      : await this.incidentsRepository.create({
          title: dto.title,
          description: dto.description ?? null,
          lat: dto.lat,
          lng: dto.lng,
          priority: dto.priority ?? 'medium',
          citizenId: finalCitizenId,
          zoneId,
          geofenceMatched: zoneId !== null,
          organizationId: org?.id ?? null,
          isAnonymous: false,
          categoryId: dto.category_id ?? null,
        });

    await this.purgeListCaches(zoneId);
    await this.publish('incident.created', row);

    return row;
  }

  /**
   * AUD (sc-327) D1 — devuelve el id de la fila máscara
   * (`users.device_uuid = 'anonymous'`). Esa fila existe por
   * la siembra de 0001; ANON (sc-326) la dejó sin uso como
   * identidad de autenticación; esta fase la recicla como
   * autoría de publicaciones. Si la máscara no existe, la
   * siembra de 0001/0048 no se aplicó — lanzamos para que el
   * operador lo sepa, no para crear la fila sobre la marcha
   * (la fila es identidad compartida, no se crea por
   * publicación).
   */
  private async resolveMaskUserId(): Promise<string> {
    const authConfig = this.configService.get<AuthConfig>('auth');
    if (!authConfig) {
      throw new Error('AuthConfig not loaded; AUD requires auth config');
    }
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM users WHERE device_uuid = $1 LIMIT 1`,
      [authConfig.anonymousDeviceUuid],
    );
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(
        `Anonymous mask row not found (device_uuid='${authConfig.anonymousDeviceUuid}'). ` +
          'Migrations 0001 and 0048 must be applied.',
      );
    }
    return id;
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3) — never optional,
   * never defaulted; an unscoped call fails `tsc`, not a silent `global`
   * leak. The list cache KEY carries the scope discriminator (design
   * "Scope-blind list cache" risk mitigation) — threading scope into the
   * repository alone would still serve org A's cached array to org B.
   */
  async findAll(
    filters: { zoneId?: string; status?: IncidentStatus },
    scope: SubjectScope,
    actorId?: string
  ): Promise<IncidentRow[]> {
    const key = this.listCacheKey(filters.zoneId, filters.status, scope);
    const cached = await this.cache.get<IncidentRow[]>(key);
    if (cached) {
      return cached;
    }

    const rows = await this.incidentsRepository.findAll(filters, scope, actorId);
    await this.cache.set(key, rows, INCIDENTS_LIST_CACHE_TTL_MS);

    // Register under the zone's tag-set so a later write purges EVERY cached
    // variant of this list, including status-filtered ones. Deleting keys by
    // name cannot do that: the writer does not know which status filters a
    // reader happened to use.
    if (filters.zoneId) {
      await this.geofencingService.tagCacheKey(filters.zoneId, key);
    }
    // Unzoned listings reflect every zone, so any write must invalidate them.
    await this.geofencingService.tagCacheKey(ALL_ZONES_TAG, key);

    return rows;
  }

  async findOne(id: string, scope: SubjectScope, actorId?: string): Promise<IncidentRow> {
    const row = await this.incidentsRepository.findOne(id, scope, actorId);
    if (!row) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return row;
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
    try {
      return await this.incidentsRepository.update(id, {
        title: dto.title ?? incident.title,
        description: dto.description !== undefined ? dto.description : incident.description,
        categoryId:
          dto.categoryId !== undefined ? dto.categoryId : incident.category_id,
      });
    } catch (error) {
      // T7.7.B3 — check_is_leaf_category() (0036) rejects non-leaf
      // categories with ERRCODE 23514; translate to a domain 400.
      if (isLeafCategoryViolation(error)) {
        throw new BadRequestException('INCIDENT_CATEGORY_NOT_LEAF: category must be a leaf category');
      }
      throw error;
    }
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
   *
   * sc-315 C2 (ronda 2) — los `id` se derivan de `ALLOWED_STATUSES`
   * (que a su vez viene de `Object.keys(TRANSITIONS)`). Las etiquetas
   * en español siguen siendo un mapa aparte (no derivable), pero
   * `Record<IncidentStatus, string>` falla en `tsc` si una nueva
   * clave del grafo no tiene label — fail-loud en compilación, no en
   * runtime.
   */
  getStatuses(): { id: IncidentStatus; label: string }[] {
    return ALLOWED_STATUSES.map((id) => ({ id, label: STATUS_LABELS[id] }));
  }
}

// sc-315 C2 (ronda 2) — mapa de etiquetas, exhaustivo sobre el tipo
// `IncidentStatus`. Si la máquina gana un quinto estado, este mapa
// falla en compilación con TS2741 ("property missing") — fail-loud
// en `tsc`, no en runtime. Es la única forma de mantener el contrato
// "todas las claves del grafo tienen label" sin rezar para que nadie
// agregue un estado y olvide la etiqueta.
const STATUS_LABELS: Record<IncidentStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};
