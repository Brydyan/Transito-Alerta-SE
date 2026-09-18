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

// sc-323-f6 (D5) — `code` is now part of the tree wire so the catalog
// CRUD can display "EC-17" / "EC-09" without an extra per-zone fetch.
// The CTE used to omit it; buildZoneTree dropped it on the floor even when
// present. RED: propagating a non-null code from a CTE row to the final
// node must round-trip. Today the resulting tree node has no `code` field.
describe('buildZoneTree — code propagation (sc-323-f6)', () => {
  it('propagates `code` from CTE rows onto the matching tree node', () => {
    const rows = [
      makeTreeRow({ id: 'pich', name: 'Pichincha', code: 'EC-17', parent_id: null }),
      makeTreeRow({
        id: 'quito',
        name: 'Quito',
        code: 'EC-17-01',
        parent_id: 'pich',
        depth: 1,
      }),
    ];

    const tree = buildZoneTree(rows);

    expect(tree[0].code).toBe('EC-17');
    expect(tree[0].children[0].code).toBe('EC-17-01');
  });

  it('keeps code optional (zones without code still produce a node)', () => {
    const rows = [makeTreeRow({ id: 'no-code', code: null })];

    const tree = buildZoneTree(rows);

    expect(tree[0].code).toBeNull();
  });
});

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
        code: null,
        created_at: new Date(),
      };
      dataSource.query.mockResolvedValue([returnedRow]);

      const result = await repository.create({
        name: 'Guayas',
        parentId: null,
        level: 'provincia',
        active: true,
        polygon: { type: 'Polygon', coordinates: [] },
        code: null,
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
        null,
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
        codeProvided: false,
        code: undefined,
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHEN $3::boolean THEN $4::uuid ELSE parent_id');
      expect(params).toEqual([
        'zone-1',
        undefined,
        true,
        null,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
      ]);
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
        codeProvided: false,
        code: undefined,
      });

      const [, params] = dataSource.query.mock.calls[0];
      expect(params).toEqual([
        'zone-1',
        'Renamed',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
      ]);
    });

    it('sets code when codeProvided is true, even to null (clear the code)', async () => {
      dataSource.query.mockResolvedValue([{ id: 'zone-1' }]);

      await repository.update('zone-1', {
        name: undefined,
        parentIdProvided: false,
        parentId: undefined,
        level: undefined,
        active: undefined,
        polygon: undefined,
        codeProvided: true,
        code: null,
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHEN $8::boolean THEN $9::varchar ELSE code');
      expect(params).toEqual([
        'zone-1',
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        null,
      ]);
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
        codeProvided: false,
        code: undefined,
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

  // ── New methods for shapefile import (Phase 1) ────────────────────────

  describe('createInTransaction', () => {
    it('runs INSERT on the supplied QueryRunner, not the shared DataSource', async () => {
      const returnedRow = {
        id: 'zone-new',
        name: 'Daule',
        parent_id: 'parent-1',
        level: 'canton',
        active: true,
        polygon: { type: 'MultiPolygon', coordinates: [] },
        code: 'EC-09-01',
        created_at: new Date(),
      };
      const qrManager = { query: jest.fn().mockResolvedValue([returnedRow]) };
      const queryRunner = { manager: qrManager } as unknown as import('typeorm').QueryRunner;

      const result = await repository.createInTransaction(queryRunner, {
        name: 'Daule',
        parentId: 'parent-1',
        level: 'canton',
        active: true,
        polygon: { type: 'Polygon', coordinates: [] },
        code: 'EC-09-01',
      });

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(qrManager.query).toHaveBeenCalledTimes(1);
      const [sql, params] = qrManager.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO geo_zones');
      expect(sql).toContain('ST_Multi');
      expect(sql).toContain('ST_GeomFromGeoJSON');
      expect(params).toContain('Daule');
      expect(params).toContain('parent-1');
      expect(params).toContain('canton');
      expect(result).toEqual(returnedRow);
    });

    it('passes NULL polygon when polygon is null', async () => {
      const qrManager = { query: jest.fn().mockResolvedValue([{ id: 'z', name: 'X' }]) };
      const queryRunner = { manager: qrManager } as unknown as import('typeorm').QueryRunner;

      await repository.createInTransaction(queryRunner, {
        name: 'X',
        parentId: null,
        level: 'zona',
        active: true,
        polygon: null,
        code: null,
      });

      const [sql, params] = qrManager.query.mock.calls[0];
      expect(sql).toContain('CASE WHEN');
      // null polygon → parameter is null
      const polygonParam = params.find((p: unknown) => p === null || typeof p === 'object');
      expect(polygonParam).toBeDefined();
    });
  });

  describe('findByCode', () => {
    it('returns the zone matching the exact code', async () => {
      const row = { id: 'z1', name: 'Guayas', code: 'EC-09' };
      dataSource.query.mockResolvedValue([row]);

      const result = await repository.findByCode('EC-09');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('code = $1');
      expect(params).toEqual(['EC-09']);
      expect(result).toEqual(row);
    });

    it('returns null when no zone has that code', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findByCode('NOT-FOUND');

      expect(result).toBeNull();
    });
  });

  describe('findParentBySpatialContainment', () => {
    it('queries ST_Contains with the geometry and returns the first match', async () => {
      const row = { id: 'parent-1', name: 'Guayas', level: 'provincia' };
      dataSource.query.mockResolvedValue([row]);

      const geometry = { type: 'Point', coordinates: [-79.9, -2.17] };
      const result = await repository.findParentBySpatialContainment(geometry);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ST_Contains');
      expect(params).toContain(JSON.stringify(geometry));
      expect(result).toEqual(row);
    });

    it('returns null when no zone spatially contains the geometry', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findParentBySpatialContainment({
        type: 'Point',
        coordinates: [0, 0],
      });

      expect(result).toBeNull();
    });
  });

  describe('getFormData', () => {
    it('queries active zones ordered by level then name', async () => {
      const rows = [
        { id: 'z1', name: 'Azuay', code: 'EC-01', level: 'canton' },
        { id: 'z2', name: 'Quito', code: 'EC-17-01', level: 'parroquia' },
      ];
      dataSource.query.mockResolvedValue(rows);

      const result = await repository.getFormData();

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('active = true');
      expect(sql).toContain('ORDER BY level, name');
      expect(result).toEqual(rows);
    });

    it('returns empty array when no active zones exist', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.getFormData();

      expect(result).toHaveLength(0);
    });
  });

  describe('findAll — parent_name via LEFT JOIN', () => {
    it('includes parent_name in the SELECT columns via LEFT JOIN', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'z1', name: 'Daule', parent_name: 'Guayas' }])
        .mockResolvedValueOnce([{ count: '1' }]);

      await repository.findAll({});

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('LEFT JOIN geo_zones');
      expect(sql).toContain('parent_name');
    });
  });
});
