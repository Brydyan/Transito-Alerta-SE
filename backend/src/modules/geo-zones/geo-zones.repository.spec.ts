import { DataSource } from 'typeorm';
import {
  buildZoneTree,
  GeoZoneTreeRow,
  GeoZonesRepository,
  MAX_DEPTH,
} from './geo-zones.repository';

function makeTreeRow(overrides: Partial<GeoZoneTreeRow> = {}): GeoZoneTreeRow {
  return {
    id: 'row-1',
    name: 'Row',
    parent_id: null,
    level: 'zona',
    active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    depth: 0,
    ...overrides,
  };
}

describe('buildZoneTree (pure fn, no DB)', () => {
  it('links flat CTE rows into a nested tree', () => {
    const rows: GeoZoneTreeRow[] = [
      makeTreeRow({ id: 'root', name: 'Root', parent_id: null, level: 'provincia' }),
      makeTreeRow({ id: 'child', name: 'Child', parent_id: 'root', level: 'canton', depth: 1 }),
    ];

    const tree = buildZoneTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('child');
  });

  it('sorts each level by name ASC', () => {
    const rows: GeoZoneTreeRow[] = [
      makeTreeRow({ id: 'b', name: 'Banana', parent_id: null }),
      makeTreeRow({ id: 'a', name: 'Apple', parent_id: null }),
    ];

    const tree = buildZoneTree(rows);

    expect(tree.map((n) => n.name)).toEqual(['Apple', 'Banana']);
  });

  it('treats a row whose parent is not present in the row set as a top-level node', () => {
    const rows: GeoZoneTreeRow[] = [makeTreeRow({ id: 'sub', parent_id: 'outside-root' })];

    const tree = buildZoneTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('sub');
  });

  it('includes inactive zones (not filtered)', () => {
    const rows: GeoZoneTreeRow[] = [makeTreeRow({ id: 'inactive-1', active: false })];

    const tree = buildZoneTree(rows);

    expect(tree[0].active).toBe(false);
  });

  it('returns an empty array for an empty row set', () => {
    expect(buildZoneTree([])).toEqual([]);
  });
});

describe('GeoZonesRepository', () => {
  let dataSource: { query: jest.Mock };
  let repository: GeoZonesRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new GeoZonesRepository(dataSource as unknown as DataSource);
  });

  describe('validateGeometry', () => {
    it('runs the ST_Multi/ST_SetSRID/ST_GeomFromGeoJSON pre-flight and maps the result row (design D6)', async () => {
      dataSource.query.mockResolvedValue([
        { valid: true, reason: null, empty: false, geom_type: 'ST_MultiPolygon' },
      ]);

      const result = await repository.validateGeometry({ type: 'Polygon', coordinates: [] });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ST_IsValid');
      expect(sql).toContain('ST_IsValidReason');
      expect(sql).toContain('ST_IsEmpty');
      expect(sql).toContain('ST_GeometryType');
      expect(sql).toContain('ST_Multi');
      expect(sql).toContain('ST_SetSRID');
      expect(sql).toContain('ST_GeomFromGeoJSON($1::text)');
      expect(params).toEqual([JSON.stringify({ type: 'Polygon', coordinates: [] })]);
      expect(result).toEqual({
        valid: true,
        reason: null,
        empty: false,
        geom_type: 'ST_MultiPolygon',
      });
    });
  });

  describe('create', () => {
    it('inserts with ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(...))) and returns the created row', async () => {
      const returnedRow = {
        id: 'zone-1',
        name: 'Guayas',
        parent_id: null,
        level: 'provincia',
        active: true,
        polygon: { type: 'MultiPolygon', coordinates: [] },
        created_at: new Date(),
      };
      dataSource.query.mockResolvedValue([returnedRow]);

      const result = await repository.create({
        name: 'Guayas',
        parentId: null,
        level: 'provincia',
        active: true,
        polygon: { type: 'Polygon', coordinates: [] },
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO geo_zones');
      expect(sql).toContain('ST_Multi');
      expect(sql).toContain('ST_GeomFromGeoJSON');
      expect(params).toEqual([
        'Guayas',
        null,
        'provincia',
        true,
        JSON.stringify({ type: 'Polygon', coordinates: [] }),
      ]);
      expect(result).toEqual(returnedRow);
    });
  });

  describe('update', () => {
    it('sets parent_id when parentIdProvided is true, even to null (detach to root)', async () => {
      dataSource.query.mockResolvedValue([{ id: 'zone-1' }]);

      await repository.update('zone-1', {
        name: undefined,
        parentIdProvided: true,
        parentId: null,
        level: undefined,
        active: undefined,
        polygon: undefined,
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHEN $3::boolean THEN $4::uuid ELSE parent_id');
      expect(params).toEqual(['zone-1', undefined, true, null, undefined, undefined, undefined]);
    });

    it('leaves parent_id untouched when parentIdProvided is false (field absent from the patch)', async () => {
      dataSource.query.mockResolvedValue([{ id: 'zone-1' }]);

      await repository.update('zone-1', {
        name: 'Renamed',
        parentIdProvided: false,
        parentId: undefined,
        level: undefined,
        active: undefined,
        polygon: undefined,
      });

      const [, params] = dataSource.query.mock.calls[0];
      expect(params).toEqual(['zone-1', 'Renamed', false, undefined, undefined, undefined, undefined]);
    });

    it('returns null when no row matched the id', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.update('missing', {
        name: undefined,
        parentIdProvided: false,
        parentId: undefined,
        level: undefined,
        active: undefined,
        polygon: undefined,
      });

      expect(result).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('sets active=false and reports changed=true when the row was previously active', async () => {
      dataSource.query.mockResolvedValue([{ changed: true }]);

      const result = await repository.deactivate('zone-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('active = false');
      expect(params).toEqual(['zone-1']);
      expect(result).toEqual({ changed: true });
    });

    it('reports changed=false (idempotent no-op) when the row was already inactive', async () => {
      dataSource.query.mockResolvedValue([{ changed: false }]);

      const result = await repository.deactivate('zone-1');

      expect(result).toEqual({ changed: false });
    });

    it('returns null when the id does not exist', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.deactivate('missing');

      expect(result).toBeNull();
    });
  });

  describe('findById / findAll', () => {
    it('findById returns null when no row matches', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findById('missing');

      expect(result).toBeNull();
    });

    it('findById projects polygon via ST_AsGeoJSON(polygon)::json', async () => {
      dataSource.query.mockResolvedValue([{ id: 'zone-1' }]);

      await repository.findById('zone-1');

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ST_AsGeoJSON(polygon)::json');
    });

    it('findAll defaults to active-only and paginates', async () => {
      dataSource.query.mockResolvedValueOnce([{ id: 'zone-1' }]).mockResolvedValueOnce([{ count: '1' }]);

      const result = await repository.findAll({});

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('active = true');
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('findAll includes inactive zones when includeInactive is true', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);

      await repository.findAll({ includeInactive: true });

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).not.toContain('active = true');
    });
  });

  describe('getSubtree', () => {
    it('assembles the flat CTE rows into a nested tree, depth-capped', async () => {
      dataSource.query.mockResolvedValue([
        makeTreeRow({ id: 'root', name: 'Root', parent_id: null }),
        makeTreeRow({ id: 'child', name: 'Child', parent_id: 'root', depth: 1 }),
      ]);

      const tree = await repository.getSubtree(null);

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain(String(MAX_DEPTH));
      expect(tree).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('child');
    });
  });

  describe('validateNoCycles', () => {
    it('allows a null proposed parent without querying', async () => {
      const result = await repository.validateNoCycles('zone-1', null);

      expect(result).toBe(true);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('rejects self-parent', async () => {
      const result = await repository.validateNoCycles('A', 'A');

      expect(result).toBe(false);
    });

    it('rejects a direct cycle: A -> B -> A', async () => {
      dataSource.query.mockResolvedValueOnce([{ parent_id: 'A' }]);

      const result = await repository.validateNoCycles('A', 'B');

      expect(result).toBe(false);
    });

    it('rejects a transitive cycle: A -> B -> C -> A', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ parent_id: 'B' }])
        .mockResolvedValueOnce([{ parent_id: 'A' }]);

      const result = await repository.validateNoCycles('A', 'C');

      expect(result).toBe(false);
    });

    it('allows a non-cyclic re-parent', async () => {
      dataSource.query.mockResolvedValueOnce([{ parent_id: null }]);

      const result = await repository.validateNoCycles('A', 'unrelated-root');

      expect(result).toBe(true);
    });

    it('allows a brand-new zone (zoneId null) under any existing parent', async () => {
      dataSource.query.mockResolvedValueOnce([{ parent_id: null }]);

      const result = await repository.validateNoCycles(null, 'existing-root');

      expect(result).toBe(true);
    });
  });

  describe('findParentLevel', () => {
    it('returns the level of the given parent id', async () => {
      dataSource.query.mockResolvedValue([{ level: 'provincia' }]);

      const result = await repository.findParentLevel('parent-1');

      expect(result).toBe('provincia');
    });

    it('returns null when the parent id does not exist', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findParentLevel('missing');

      expect(result).toBeNull();
    });
  });
});
