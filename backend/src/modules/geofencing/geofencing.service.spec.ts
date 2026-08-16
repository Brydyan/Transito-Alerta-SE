import { BadRequestException } from '@nestjs/common';
import { GeofencingRepository } from './geofencing.repository';
import { GeofencingService } from './geofencing.service';

describe('GeofencingService', () => {
  let repository: { findZoneByPoint: jest.Mock; findZonesNearby: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let redis: { sadd: jest.Mock; smembers: jest.Mock; del: jest.Mock };
  let service: GeofencingService;

  beforeEach(() => {
    repository = { findZoneByPoint: jest.fn(), findZonesNearby: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    redis = { sadd: jest.fn(), smembers: jest.fn(), del: jest.fn() };
    service = new GeofencingService(
      repository as unknown as GeofencingRepository,
      cache as Partial<typeof cache>,
      redis as Partial<typeof redis>,
    );
  });

  describe('validateIncidentInZone', () => {
    it('returns the matching zone for valid coordinates', async () => {
      repository.findZoneByPoint.mockResolvedValue({ id: 'zone-1', name: 'Santa Elena' });

      const result = await service.validateIncidentInZone({ lat: -2.2, lng: -80.8 });

      expect(repository.findZoneByPoint).toHaveBeenCalledWith(-2.2, -80.8);
      expect(result).toEqual({ id: 'zone-1', name: 'Santa Elena' });
    });

    it('returns null (not a throw) when the point is outside all defined boundaries (R2)', async () => {
      repository.findZoneByPoint.mockResolvedValue(null);

      const result = await service.validateIncidentInZone({ lat: 0, lng: 0 });

      expect(result).toBeNull();
    });

    it('throws BadRequestException for out-of-range latitude', async () => {
      await expect(
        service.validateIncidentInZone({ lat: 999, lng: -80.8 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findZoneByPoint).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for out-of-range longitude', async () => {
      await expect(
        service.validateIncidentInZone({ lat: -2.2, lng: 999 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for NaN coordinates', async () => {
      await expect(
        service.validateIncidentInZone({ lat: NaN, lng: -80.8 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves to zone_id=null for a point outside all zones, and does NOT throw (R2)', async () => {
      repository.findZoneByPoint.mockResolvedValue(null);

      const result = await service.resolveZone({ lat: 0, lng: 0 });

      expect(result).toEqual({ zone_id: null, zone: null });
    });

    it('resolveZone returns the matched zone_id when inside a zone', async () => {
      repository.findZoneByPoint.mockResolvedValue({ id: 'zone-1', name: 'Santa Elena' });

      const result = await service.resolveZone({ lat: -2.2, lng: -80.8 });

      expect(result).toEqual({ zone_id: 'zone-1', zone: { id: 'zone-1', name: 'Santa Elena' } });
    });
  });

  describe('buildZoneCacheKey', () => {
    it('formats geo:{zone_id}:{lat3}:{lng3}:{radius}:{status} with 3-decimal rounding', () => {
      const key = service.buildZoneCacheKey({
        zoneId: 'zone-1',
        lat: -2.22881234,
        lng: -80.85912345,
        radiusKm: 5,
        status: 'pending',
      });

      expect(key).toBe('geo:zone-1:-2.229:-80.859:5:pending');
    });

    it('is deterministic for the same rounded inputs', () => {
      const a = service.buildZoneCacheKey({
        zoneId: 'zone-1',
        lat: -2.2288,
        lng: -80.8591,
        radiusKm: 5,
        status: 'pending',
      });
      const b = service.buildZoneCacheKey({
        zoneId: 'zone-1',
        lat: -2.2289,
        lng: -80.8592,
        radiusKm: 5,
        status: 'pending',
      });

      expect(a).toBe(b);
    });
  });

  describe('tagCacheKey / purgeZoneCache', () => {
    it('tagCacheKey SADDs the cache key under geo:tags:{zone_id}', async () => {
      await service.tagCacheKey('zone-1', 'geo:zone-1:-2.229:-80.859:5:pending');

      expect(redis.sadd).toHaveBeenCalledWith(
        'geo:tags:zone-1',
        'geo:zone-1:-2.229:-80.859:5:pending',
      );
    });

    // The tagged VALUES live on the cache database (DB 1) via cache-manager;
    // the tag-set lives on DB 0 with the raw client. Purging the values with
    // redis.del() targets DB 0 and removes nothing — the earlier version of
    // this test asserted exactly that broken behaviour.
    it('purgeZoneCache deletes tagged values through the cache, not the raw client', async () => {
      redis.smembers.mockResolvedValue([
        'incidents:list:zone-1:pending',
        'incidents:list:zone-1:all',
      ]);

      await service.purgeZoneCache('zone-1');

      expect(redis.smembers).toHaveBeenCalledWith('geo:tags:zone-1');
      expect(cache.del).toHaveBeenCalledWith('incidents:list:zone-1:pending');
      expect(cache.del).toHaveBeenCalledWith('incidents:list:zone-1:all');
    });

    it('purgeZoneCache drops the tag-set itself on the raw client', async () => {
      redis.smembers.mockResolvedValue(['incidents:list:zone-1:pending']);

      await service.purgeZoneCache('zone-1');

      expect(redis.del).toHaveBeenCalledWith('geo:tags:zone-1');
    });

    it('purgeZoneCache does nothing beyond deleting the (empty) tag-set when no keys are tagged', async () => {
      redis.smembers.mockResolvedValue([]);

      await service.purgeZoneCache('zone-2');

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith('geo:tags:zone-2');
    });

    it('does not throw when zone_id is null (no-op purge)', async () => {
      await expect(service.purgeZoneCache(null)).resolves.toBeUndefined();
      expect(redis.smembers).not.toHaveBeenCalled();
    });
  });

  describe('getCachedZoneByPoint', () => {
    it('builds the cache key from 3-decimal-rounded lat/lng (~110m grid)', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findZoneByPoint.mockResolvedValue(null);

      await service.getCachedZoneByPoint(-2.22881234, -80.85912345);

      expect(cache.get).toHaveBeenCalledWith('geo:point:-2.229:-80.859');
    });

    it('returns the cached value on a hit without querying the repository', async () => {
      cache.get.mockResolvedValue({ id: 'zone-1', name: 'Cached Zone' });

      const result = await service.getCachedZoneByPoint(-2.2, -80.8);

      expect(result).toEqual({ id: 'zone-1', name: 'Cached Zone' });
      expect(repository.findZoneByPoint).not.toHaveBeenCalled();
    });

    it('queries the repository and populates the cache with a 60s TTL on a miss', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findZoneByPoint.mockResolvedValue({ id: 'zone-2', name: 'Zone' });

      const result = await service.getCachedZoneByPoint(-2.2, -80.8);

      expect(result).toEqual({ id: 'zone-2', name: 'Zone' });
      expect(cache.set).toHaveBeenCalledWith(
        'geo:point:-2.200:-80.800',
        { id: 'zone-2', name: 'Zone' },
        60 * 1000,
      );
    });

    // Regression found by the T4.1a e2e flow test (real cache-manager-redis-yet,
    // not this mock): `cache.set(key, null, ttl)` throws `NoCacheableError:
    // "null" is not a cacheable value` — cache-manager-redis-yet's isCacheable()
    // rejects null/undefined outright. Every point outside all zones (R2 —
    // which MUST still be accepted, not rejected) 500'd on write. Storing it
    // would not even have worked as a negative cache anyway: this store's
    // own get() maps a stored null back to `undefined`, identical to a miss.
    it('does NOT attempt to cache a null "outside all zones" result (R2 / cache-manager-redis-yet rejects null)', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findZoneByPoint.mockResolvedValue(null);

      const result = await service.getCachedZoneByPoint(0, 0);

      expect(result).toBeNull();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
