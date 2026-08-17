import { DataSource } from 'typeorm';
import {
  buildTree,
  CategoryRow,
  IncidentCategoriesRepository,
} from './incident-categories.repository';

function makeRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'row-1',
    name: 'Row',
    parent_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    depth: 0,
    ...overrides,
  };
}

describe('buildTree (pure fn, no DB)', () => {
  it('links flat CTE rows into a nested tree', () => {
    const rows: CategoryRow[] = [
      makeRow({ id: 'root', name: 'Root', parent_id: null }),
      makeRow({ id: 'child', name: 'Child', parent_id: 'root', depth: 1 }),
      makeRow({ id: 'grandchild', name: 'GrandChild', parent_id: 'child', depth: 2 }),
    ];

    const tree = buildTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('child');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe('grandchild');
  });

  it('sorts each level by name ASC', () => {
    const rows: CategoryRow[] = [
      makeRow({ id: 'b', name: 'Banana', parent_id: null }),
      makeRow({ id: 'a', name: 'Apple', parent_id: null }),
      makeRow({ id: 'z', name: 'Zebra', parent_id: 'a', depth: 1 }),
      makeRow({ id: 'y', name: 'Yak', parent_id: 'a', depth: 1 }),
    ];

    const tree = buildTree(rows);

    expect(tree.map((n) => n.name)).toEqual(['Apple', 'Banana']);
    expect(tree[0].children.map((n) => n.name)).toEqual(['Yak', 'Zebra']);
  });

  it('treats a row whose parent is not present in the row set as a top-level node', () => {
    // Subtree query starting at a non-root category: its own parent is
    // outside the returned row set.
    const rows: CategoryRow[] = [makeRow({ id: 'sub', name: 'Sub', parent_id: 'outside-root' })];

    const tree = buildTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('sub');
  });

  it('returns an empty array for an empty row set', () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe('IncidentCategoriesRepository', () => {
  let dataSource: { query: jest.Mock };
  let repository: IncidentCategoriesRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new IncidentCategoriesRepository(dataSource as unknown as DataSource);
  });

  describe('listFlat', () => {
    it('queries every root and its descendants when rootId is null', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.listFlat(null);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('parent_id IS NULL');
      expect(params).toBeUndefined();
    });

    it('queries the subtree rooted at rootId, parameterized', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.listFlat('root-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('$1');
      expect(sql).not.toContain('root-1');
      expect(params).toEqual(['root-1']);
    });
  });

  describe('getSubtree', () => {
    it('assembles the flat rows returned by the DB into a nested tree', async () => {
      dataSource.query.mockResolvedValue([
        makeRow({ id: 'root', name: 'Root', parent_id: null }),
        makeRow({ id: 'child', name: 'Child', parent_id: 'root', depth: 1 }),
      ]);

      const tree = await repository.getSubtree(null);

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('root');
      expect(tree[0].children[0].id).toBe('child');
    });
  });

  describe('validateNoCycles', () => {
    it('allows a null proposed parent (root assignment) without querying', async () => {
      const result = await repository.validateNoCycles('cat-1', null);

      expect(result).toBe(true);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('rejects a category becoming its own parent (self-parent)', async () => {
      const result = await repository.validateNoCycles('A', 'A');

      expect(result).toBe(false);
    });

    it('rejects a direct cycle: A -> B -> A', async () => {
      // Existing chain: B.parent_id = A. Proposing A.parent_id = B must be
      // rejected — walking up from B reaches A.
      dataSource.query.mockResolvedValueOnce([{ parent_id: 'A' }]); // B's parent is A

      const result = await repository.validateNoCycles('A', 'B');

      expect(result).toBe(false);
    });

    it('rejects a transitive cycle: A -> B -> C -> A', async () => {
      // Existing chain: B.parent=A, C.parent=B. Proposing A.parent_id = C.
      dataSource.query
        .mockResolvedValueOnce([{ parent_id: 'B' }]) // C's parent is B
        .mockResolvedValueOnce([{ parent_id: 'A' }]); // B's parent is A

      const result = await repository.validateNoCycles('A', 'C');

      expect(result).toBe(false);
    });

    it('allows a non-cyclic re-parent', async () => {
      dataSource.query.mockResolvedValueOnce([{ parent_id: null }]); // proposed parent is a root

      const result = await repository.validateNoCycles('A', 'unrelated-root');

      expect(result).toBe(true);
    });

    it('allows creating a brand-new category (categoryId null) under any existing parent', async () => {
      dataSource.query.mockResolvedValueOnce([{ parent_id: null }]);

      const result = await repository.validateNoCycles(null, 'existing-root');

      expect(result).toBe(true);
    });
  });
});
