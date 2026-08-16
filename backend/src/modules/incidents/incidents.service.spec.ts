import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService, INCIDENTS_STREAM_KEY } from './incidents.service';
import { GeofencingService } from '../geofencing/geofencing.service';

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
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new IncidentsService(
      repo as unknown as IncidentsRepository,
      geofencing as unknown as GeofencingService,
      eventEmitter as Partial<typeof eventEmitter>,
      redis as Partial<typeof redis>,
      cache as Partial<typeof cache>,
    );
  });

  describe('create', () => {
    it('resolves a zone, persists geofence_matched=true, purges zone cache, and emits events', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      repo.create.mockResolvedValue(makeRow());

      const result = await service.create(
        { title: 'Pothole', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(geofencing.resolveZone).toHaveBeenCalledWith({ lat: -2.2, lng: -80.8 });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: 'zone-1', geofenceMatched: true, citizenId: 'user-1' }),
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

    it('still accepts (does not throw) an incident outside all zones, persisting geofence_matched=false (R2)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: null, zone: null });
      repo.create.mockResolvedValue(makeRow({ zone_id: null, geofence_matched: false }));

      const result = await service.create(
        { title: 'Pothole', lat: 0, lng: 0 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: null, geofenceMatched: false }),
      );
      // No zone to purge — purgeZoneCache is a no-op guarded by GeofencingService itself,
      // but the service must still call it (or skip it) without throwing.
      expect(result.geofence_matched).toBe(false);
    });
  });

  describe('findAll', () => {
    it('returns the cached list on a hit without querying the repository', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue([row]);

      const result = await service.findAll('zone-1');

      expect(result).toEqual([row]);
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('queries and caches the list by zone on a miss', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue([row]);

      const result = await service.findAll('zone-1');

      expect(repo.findAll).toHaveBeenCalledWith({ zoneId: 'zone-1' });
      expect(cache.set).toHaveBeenCalled();
      expect(result).toEqual([row]);
    });
  });

  describe('findOne', () => {
    it('returns the incident when found', async () => {
      const row = makeRow();
      repo.findOne.mockResolvedValue(row);

      const result = await service.findOne('inc-1');

      expect(result).toEqual(row);
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('allows pending -> in_progress and emits incident.status_changed', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));
      repo.updateStatus.mockResolvedValue(makeRow({ status: 'in_progress' }));

      const result = await service.updateStatus('inc-1', 'in_progress', 'operator-1');

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

      const result = await service.updateStatus('inc-1', 'resolved', 'operator-1');

      expect(result.status).toBe('resolved');
    });

    it('rejects pending -> resolved (illegal transition, must go through in_progress)', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));

      await expect(
        service.updateStatus('inc-1', 'resolved', 'operator-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects resolved -> pending (backward transition)', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'resolved' }));

      await expect(
        service.updateStatus('inc-1', 'pending', 'operator-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a same-status no-op transition', async () => {
      repo.findOne.mockResolvedValue(makeRow({ status: 'pending' }));

      await expect(
        service.updateStatus('inc-1', 'pending', 'operator-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the incident does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', 'in_progress', 'operator-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
