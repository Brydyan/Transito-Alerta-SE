import { DataSource } from 'typeorm';
import { GeofencingRepository } from './geofencing.repository';

describe('GeofencingRepository', () => {
  let dataSource: { query: jest.Mock };
  let repository: GeofencingRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new GeofencingRepository(dataSource as unknown as DataSource);
  });

  describe('findZoneByPoint', () => {
    it('calls ST_Point with lng first, lat second (classic PostGIS argument-order bug)', async () => {
      dataSource.query.mockResolvedValue([]);
      const lat = -2.2288; // Santa Elena approx
      const lng = -80.859;

      await repository.findZoneByPoint(lat, lng);

      const [, params] = dataSource.query.mock.calls[0];
      // ST_Point(x, y) = ST_Point(lng, lat) — params[0] must be lng, params[1] lat.
      expect(params[0]).toBe(lng);
      expect(params[1]).toBe(lat);
    });

    it('uses parameterized placeholders, never string-interpolated SQL', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findZoneByPoint(-2.2, -80.8);

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('$1');
      expect(sql).toContain('$2');
      expect(sql).not.toContain('-2.2');
      expect(sql).not.toContain('-80.8');
    });

    it('returns the first matching zone row, or null when none contain the point', async () => {
      dataSource.query.mockResolvedValue([{ id: 'zone-1', name: 'Santa Elena', active: true }]);

      const result = await repository.findZoneByPoint(-2.2, -80.8);

      expect(result).toEqual({ id: 'zone-1', name: 'Santa Elena', active: true });
    });

    it('returns null when no zone contains the point', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findZoneByPoint(0, 0);

      expect(result).toBeNull();
    });
  });

  describe('findZonesNearby', () => {
    it('converts radiusKm to meters and orders params (lng, lat, radiusMeters)', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findZonesNearby(-2.2, -80.8, 5);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ST_DWithin');
      expect(params).toEqual([-80.8, -2.2, 5000]);
    });

    it('returns all rows from the query result', async () => {
      const rows = [{ id: 'zone-1' }, { id: 'zone-2' }];
      dataSource.query.mockResolvedValue(rows);

      const result = await repository.findZonesNearby(-2.2, -80.8, 5);

      expect(result).toEqual(rows);
    });
  });
});
