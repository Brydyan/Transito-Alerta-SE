import { BadRequestException } from '@nestjs/common';
import { GeofencingRepository } from './geofencing.repository';
import { GeofencingService } from './geofencing.service';

describe('GeofencingService', () => {
  let repository: { findZoneByPoint: jest.Mock; findZonesNearby: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let service: GeofencingService;

  beforeEach(() => {
    repository = { findZoneByPoint: jest.fn(), findZonesNearby: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    service = new GeofencingService(
      repository as unknown as GeofencingRepository,
      cache as any,
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
  });
});
