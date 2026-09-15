import { DataSource } from 'typeorm';
import { DepartmentsRepository } from './departments.repository';

/**
 * `back/2026-09-15-departments-module` — Phase B.6
 *
 * Raw-SQL repo: the test strategy is to capture `dataSource.query` calls
 * and assert on the SQL string + params. No DB up; no fixtures. This
 * is the same shape `GeofencingRepository` and `OrganizationsRepository`
 * tests use — see `backend/src/modules/geofencing/geofencing.repository.spec.ts`
 * for the canonical template.
 */
describe('DepartmentsRepository', () => {
  let dataSource: { query: jest.Mock };
  let repository: DepartmentsRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new DepartmentsRepository(dataSource as unknown as DataSource);
  });

  describe('create', () => {
    it('INSERTs with gen_random_uuid and returns the new row', async () => {
      dataSource.query.mockResolvedValue([{ id: 'dept-1' }]);

      const result = await repository.create({
        name: 'Traffic',
        description: null,
        organizationId: 'org-1',
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO departments');
      expect(sql).toContain('gen_random_uuid()');
      expect(params).toEqual(['Traffic', null, 'org-1']);
      expect(result).toEqual({ id: 'dept-1' });
    });
  });

  describe('softDelete', () => {
    it('UPDATE stamps deleted_at and only hits non-deleted rows', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'dept-1' }], 1]);

      const changed = await repository.softDelete('dept-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('SET deleted_at = now()');
      expect(sql).toContain('deleted_at IS NULL');
      expect(params).toEqual(['dept-1']);
      expect(changed).toBe(true);
    });

    it('returns false when no non-deleted row matched', async () => {
      dataSource.query.mockResolvedValue([[], 0]);
      const changed = await repository.softDelete('missing');
      expect(changed).toBe(false);
    });
  });

  describe('findByIdActive', () => {
    it('SELECTs only when deleted_at IS NULL', async () => {
      dataSource.query.mockResolvedValue([{ id: 'dept-1' }]);

      const result = await repository.findByIdActive('dept-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['dept-1']);
      expect(result).toEqual({ id: 'dept-1' });
    });

    it('returns null when no row matches', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await repository.findByIdActive('missing');
      expect(result).toBeNull();
    });
  });

  describe('existsByOrgAndName', () => {
    it('returns true when a non-deleted row matches', async () => {
      dataSource.query.mockResolvedValue([{ exists: true }]);
      const result = await repository.existsByOrgAndName('org-1', 'Traffic');
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('EXISTS');
      expect(sql).toContain('organization_id = $1');
      expect(sql).toContain('name = $2');
      expect(sql).toContain('deleted_at IS NULL');
      expect(params).toEqual(['org-1', 'Traffic']);
      expect(result).toBe(true);
    });

    it('returns false when no match', async () => {
      dataSource.query.mockResolvedValue([{ exists: false }]);
      const result = await repository.existsByOrgAndName('org-1', 'Unknown');
      expect(result).toBe(false);
    });

    it('returns false when the row is soft-deleted (excluded from EXISTS)', async () => {
      dataSource.query.mockResolvedValue([{ exists: false }]);
      const result = await repository.existsByOrgAndName('org-1', 'Deleted');
      // The WHERE clause includes `deleted_at IS NULL`; the result shape
      // would have `exists: true` only if a live row matched.
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('clamps perPage to 100 and page to >= 1', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'dept-1' }]) // items
        .mockResolvedValueOnce([{ count: '1' }]); // total

      await repository.list({
        organizationId: 'org-1',
        perPage: 9999,
        page: -3,
      });

      const itemsSql = dataSource.query.mock.calls[0][0];
      expect(itemsSql).toContain('LIMIT $2 OFFSET $3');
      // params order: [orgId, perPage(clamped), offset]
      // page=-3 → max(..., 1) = 1, offset = (1-1)*100 = 0
      expect(dataSource.query.mock.calls[0][1]).toEqual(['org-1', 100, 0]);
    });

    it('applies ILIKE search when provided (case-insensitive partial match)', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      await repository.list({
        organizationId: 'org-1',
        search: '  traffic  ', // trimmed
      });

      const itemsSql = dataSource.query.mock.calls[0][0];
      expect(itemsSql).toContain('name ILIKE $2');
      expect(itemsSql).toContain('ORDER BY name ASC');
      expect(dataSource.query.mock.calls[0][1]).toEqual(['org-1', '%traffic%', 50, 0]);
    });

    it('skips the ILIKE clause when search is empty/whitespace', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      await repository.list({ organizationId: 'org-1', search: '   ' });

      const itemsSql = dataSource.query.mock.calls[0][0];
      expect(itemsSql).not.toContain('ILIKE');
    });

    it('always filters soft-deleted rows (deleted_at IS NULL)', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      await repository.list({ organizationId: 'org-1' });

      const itemsSql = dataSource.query.mock.calls[0][0];
      expect(itemsSql).toContain('deleted_at IS NULL');
    });

    it('returns parsed total as number', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '47' }]);

      const { total } = await repository.list({ organizationId: 'org-1' });
      expect(total).toBe(47);
    });
  });

  describe('findByUser', () => {
    it('joins users on department_id and excludes soft-deleted on both sides', async () => {
      dataSource.query.mockResolvedValue([{ id: 'dept-1' }]);

      const result = await repository.findByUser('user-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('JOIN users u ON u.department_id = d.id');
      expect(sql).toContain('u.deleted_at IS NULL');
      expect(sql).toContain('d.deleted_at IS NULL');
      expect(params).toEqual(['user-1']);
      expect(result).toEqual({ id: 'dept-1' });
    });

    it('returns null when the user has no dept or is deleted', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await repository.findByUser('user-1');
      expect(result).toBeNull();
    });
  });

  describe('orphanIncidents', () => {
    it('UPDATE sets incidents.department_id = NULL and returns affected row count', async () => {
      dataSource.query.mockResolvedValue([[], 3]);

      const affected = await repository.orphanIncidents('dept-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('UPDATE incidents SET department_id = NULL');
      expect(sql).toContain('WHERE department_id = $1');
      expect(params).toEqual(['dept-1']);
      expect(affected).toBe(3);
    });
  });

  describe('update', () => {
    it('UPDATE patches name + description and only hits active rows', async () => {
      dataSource.query.mockResolvedValue([{ id: 'dept-1', name: 'New' }]);

      const result = await repository.update('dept-1', {
        name: 'New',
        descriptionProvided: true,
        description: 'updated',
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('UPDATE departments SET');
      expect(sql).toMatch(/name\s*=\s*COALESCE\(\$2, name\)/);
      expect(sql).toContain('description = CASE WHEN $3::boolean');
      expect(sql).toContain('deleted_at IS NULL');
      expect(params).toEqual(['dept-1', 'New', true, 'updated']);
      expect(result).toEqual({ id: 'dept-1', name: 'New' });
    });

    it('omits description patch when descriptionProvided=false (keeps existing value)', async () => {
      dataSource.query.mockResolvedValue([{ id: 'dept-1' }]);

      await repository.update('dept-1', {
        name: undefined,
        descriptionProvided: false,
        description: 'should-not-be-applied',
      });

      const [, params] = dataSource.query.mock.calls[0];
      expect(params).toEqual(['dept-1', undefined, false, 'should-not-be-applied']);
    });

    it('returns null when the dept is soft-deleted (UPDATE filtered out)', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await repository.update('deleted-dept', {
        name: 'X',
        descriptionProvided: false,
        description: undefined,
      });
      expect(result).toBeNull();
    });
  });
});
