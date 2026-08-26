import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type { Redis } from 'ioredis';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService, INCIDENTS_STREAM_KEY } from './incidents.service';
import { GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubjectScope } from '../../common/authz/subject-scope';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    title: 'Pothole',
    description: null,
    status: 'pending',
    priority: 'medium',
    citizen_id: 'user-1',
    assigned_to: null,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    lat: -2.2,
    lng: -80.8,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('IncidentsService', () => {
  let repo: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    updateStatus: jest.Mock;
  };
  let geofencing: { resolveZone: jest.Mock; purgeZoneCache: jest.Mock; tagCacheKey: jest.Mock };
  let organizations: { findNotifiedFor: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let redis: { xadd: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: IncidentsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
    };
    geofencing = { resolveZone: jest.fn(), purgeZoneCache: jest.fn(), tagCacheKey: jest.fn() };
    organizations = { findNotifiedFor: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new IncidentsService(
      repo as unknown as IncidentsRepository,
      geofencing as unknown as GeofencingService,
      organizations as unknown as OrganizationsService,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      redis as unknown as jest.Mocked<Redis>,
      cache as unknown as jest.Mocked<Cache>,
    );
  });

  describe('create', () => {
    it('resolves a zone, derives organization_id from findNotifiedFor()[0] (T7.5.C4 — never the creator\'s own org), purges zone cache, and emits events', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      organizations.findNotifiedFor.mockResolvedValue([
        { id: 'org-A', name: 'Org A', zone_id: 'zone-1', created_at: new Date() },
      ]);
      repo.create.mockResolvedValue(makeRow());

      const result = await service.create(
        { title: 'Pothole', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(geofencing.resolveZone).toHaveBeenCalledWith({ lat: -2.2, lng: -80.8 });
      expect(organizations.findNotifiedFor).toHaveBeenCalledWith('zone-1', null);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId: 'zone-1',
          geofenceMatched: true,
          citizenId: 'user-1',
          organizationId: 'org-A',
        }),
      );
      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('incident.created', expect.any(Object));
      expect(redis.xadd).toHaveBeenCalledWith(
        INCIDENTS_STREAM_KEY,
        '*',
        'type',
        'incident.created',
        'data',
        expect.any(String),
      );
      expect(result.geofence_matched).toBe(true);
    });

    it('still accepts (does not throw) an incident outside all zones, persisting organization_id=null (R2/D4)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: null, zone: null });
      organizations.findNotifiedFor.mockResolvedValue([]);
      repo.create.mockResolvedValue(makeRow({ zone_id: null, geofence_matched: false, organization_id: null }));

      const result = await service.create(
        { title: 'Pothole', lat: 0, lng: 0 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(organizations.findNotifiedFor).toHaveBeenCalledWith(null, null);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: null, geofenceMatched: false, organizationId: null }),
      );
      expect(result.geofence_matched).toBe(false);
    });

    it('persists organization_id=null when the zone has no organization', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-9', zone: { id: 'zone-9' } });
      organizations.findNotifiedFor.mockResolvedValue([]);
      repo.create.mockResolvedValue(makeRow({ zone_id: 'zone-9', organization_id: null }));

      await service.create(
        { title: 'X', lat: 1, lng: 1 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
    });

    it('T7.5.C4 — picks the first org when findNotifiedFor returns several (auto-assign matches is_claimable)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      organizations.findNotifiedFor.mockResolvedValue([
        { id: 'org-primary', name: 'Primary', zone_id: 'zone-1', created_at: new Date('2026-01-01') },
        { id: 'org-secondary', name: 'Secondary', zone_id: 'zone-1', created_at: new Date('2026-01-02') },
      ]);
      repo.create.mockResolvedValue(makeRow({ organization_id: 'org-primary' }));

      await service.create(
        { title: 'Pothole', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-primary' }),
      );
    });
  });

  describe('findAll', () => {
    it('returns the cached list on a hit without querying the repository', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue([row]);

      const result = await service.findAll('zone-1', undefined, GLOBAL_SCOPE);

      expect(result).toEqual([row]);
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('queries and caches the list by zone+scope on a miss', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue([row]);

      const result = await service.findAll('zone-1', undefined, GLOBAL_SCOPE);

      expect(repo.findAll).toHaveBeenCalledWith({ zoneId: 'zone-1', status: undefined }, GLOBAL_SCOPE);
      expect(cache.set).toHaveBeenCalled();
      expect(result).toEqual([row]);
    });

    // Design "Scope-blind list cache" risk: threading scope into the
    // repository alone would still serve org A's cached array to org B —
    // the cache KEY itself must carry the scope discriminator.
    it('caches org and global scope under DISTINCT keys for the same zone/status', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue([]);

      await service.findAll('zone-1', undefined, GLOBAL_SCOPE);
      await service.findAll('zone-1', undefined, ORG_A_SCOPE);

      const keysUsed = cache.set.mock.calls.map((call) => call[0]);
      expect(new Set(keysUsed).size).toBe(2);
    });
  });

  describe('findOne', () => {
    it('returns the incident when found', async () => {
      const row = makeRow();
      repo.findOne.mockResolvedValue(row);

      const result = await service.findOne('inc-1', GLOBAL_SCOPE);

      expect(repo.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(result).toEqual(row);
    });

    it('throws NotFoundException when missing or invisible under scope (D11 — 404, never 403)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing', ORG_A_SCOPE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('allows pending -> in_progress and emits incident.status_changed', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));
      repo.updateStatus.mockResolvedValue(makeRow({ status: 'in_progress' }));

      const result = await service.updateStatus('inc-1', 'in_progress', 'operator-1', GLOBAL_SCOPE);

      expect(repo.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(repo.updateStatus).toHaveBeenCalledWith('inc-1', 'in_progress');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'incident.status_changed',
        expect.any(Object),
      );
      expect(redis.xadd).toHaveBeenCalledWith(
        INCIDENTS_STREAM_KEY,
        '*',
        'type',
        'incident.status_changed',
        'data',
        expect.any(String),
      );
      expect(result.status).toBe('in_progress');
    });

    it('allows in_progress -> resolved', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'in_progress' }));
      repo.updateStatus.mockResolvedValue(makeRow({ status: 'resolved' }));

      const result = await service.updateStatus('inc-1', 'resolved', 'operator-1', GLOBAL_SCOPE);

      expect(result.status).toBe('resolved');
    });

    it('rejects pending -> resolved (illegal transition, must go through in_progress)', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));

      await expect(
        service.updateStatus('inc-1', 'resolved', 'operator-1', GLOBAL_SCOPE),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects resolved -> pending (backward transition)', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'resolved' }));

      await expect(
        service.updateStatus('inc-1', 'pending', 'operator-1', GLOBAL_SCOPE),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a same-status no-op transition', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));

      await expect(
        service.updateStatus('inc-1', 'pending', 'operator-1', GLOBAL_SCOPE),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the incident does not exist or is invisible under scope', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', 'in_progress', 'operator-1', ORG_A_SCOPE),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
