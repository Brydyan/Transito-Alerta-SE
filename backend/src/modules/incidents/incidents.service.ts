import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../core/core.module';
import { IncidentStatus } from '../../entities/incident.entity';
import { GeofencingService } from '../geofencing/geofencing.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentRow, IncidentsRepository } from './incidents.repository';

export const INCIDENTS_STREAM_KEY = 'incidents:events';
const INCIDENTS_LIST_CACHE_TTL_MS = 30_000;

/**
 * Legal forward-only transitions (spec R2: pending -> in_progress ->
 * resolved). Anything else — including same-status no-ops and backward
 * moves — is rejected.
 */
const LEGAL_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [],
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
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Per R2: an incident outside all defined boundaries MUST still be
   * accepted (201), persisted with zone_id=null, geofence_matched=false.
   * GeofencingService.resolveZone never throws for "outside a zone" — only
   * for malformed coordinates.
   */
  async create(dto: CreateIncidentDto, citizenId: string): Promise<IncidentRow> {
    const { zone_id: zoneId } = await this.geofencingService.resolveZone({
      lat: dto.lat,
      lng: dto.lng,
    });

    const row = await this.incidentsRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      lat: dto.lat,
      lng: dto.lng,
      priority: dto.priority ?? 'medium',
      citizenId,
      zoneId,
      geofenceMatched: zoneId !== null,
    });

    await this.geofencingService.purgeZoneCache(zoneId);
    await this.invalidateListCache(zoneId ?? undefined);
    await this.publish('incident.created', row);

    return row;
  }

  async findAll(zoneId?: string, status?: IncidentStatus): Promise<IncidentRow[]> {
    const key = this.listCacheKey(zoneId, status);
    const cached = await this.cache.get<IncidentRow[]>(key);
    if (cached) {
      return cached;
    }

    const rows = await this.incidentsRepository.findAll({ zoneId, status });
    await this.cache.set(key, rows, INCIDENTS_LIST_CACHE_TTL_MS);
    return rows;
  }

  async findOne(id: string): Promise<IncidentRow> {
    const row = await this.incidentsRepository.findOne(id);
    if (!row) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return row;
  }

  async updateStatus(
    id: string,
    nextStatus: IncidentStatus,
    actorId: string,
  ): Promise<IncidentRow> {
    const current = await this.incidentsRepository.findOne(id);
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

    await this.geofencingService.purgeZoneCache(updated.zone_id);
    await this.invalidateListCache(updated.zone_id ?? undefined);
    await this.publish('incident.status_changed', { ...updated, actor_id: actorId });

    return updated;
  }

  private async publish(type: string, data: unknown): Promise<void> {
    this.eventEmitter.emit(type, data);
    await this.redis.xadd(INCIDENTS_STREAM_KEY, '*', 'type', type, 'data', JSON.stringify(data));
  }

  private listCacheKey(zoneId?: string, status?: string): string {
    return `incidents:list:${zoneId ?? 'all'}:${status ?? 'all'}`;
  }

  private async invalidateListCache(zoneId?: string): Promise<void> {
    await this.cache.del(this.listCacheKey(zoneId));
    await this.cache.del(this.listCacheKey(undefined));
  }
}
