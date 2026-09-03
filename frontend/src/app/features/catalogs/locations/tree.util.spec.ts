import { IGeoZone, IGeoZoneNode } from './interfaces/igeo-zone.interface';
import { buildTree, filterTreePreservingAncestors, getLevelParentLevel } from './tree.util';

describe('tree.util', () => {
  describe('buildTree', () => {
    it('should build a tree and assign correct depth', () => {
      // Child appears before parent to test ordering independence
      const rows: IGeoZone[] = [
        {
          id: '3',
          code: 'P1',
          name: 'Parroquia 1',
          level: 'parroquia',
          parent_id: '2',
          active: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: '1',
          code: 'PROV1',
          name: 'Provincia 1',
          level: 'provincia',
          parent_id: null,
          active: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: '4',
          code: 'Z1',
          name: 'Zona 1',
          level: 'zona',
          parent_id: '3',
          active: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: '2',
          code: 'C1',
          name: 'Canton 1',
          level: 'canton',
          parent_id: '1',
          active: true,
          created_at: '',
          updated_at: '',
        },
      ];

      const tree = buildTree(rows);

      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe('1');
      expect(tree[0].depth).toBe(0);

      const canton = tree[0].children[0];
      expect(canton.id).toBe('2');
      expect(canton.depth).toBe(1);

      const parroquia = canton.children[0];
      expect(parroquia.id).toBe('3');
      expect(parroquia.depth).toBe(2);

      const zona = parroquia.children[0];
      expect(zona.id).toBe('4');
      expect(zona.depth).toBe(3);
    });

    it('should handle nodes with missing parent_id as roots', () => {
      const rows: IGeoZone[] = [
        {
          id: '1',
          code: 'PROV1',
          name: 'Provincia 1',
          level: 'provincia',
          parent_id: 'nonexistent',
          active: true,
          created_at: '',
          updated_at: '',
        },
      ];
      const tree = buildTree(rows);
      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe('1');
    });

    it('should return empty array for empty input', () => {
      expect(buildTree([])).toEqual([]);
    });
  });

  describe('filterTreePreservingAncestors', () => {
    let tree: IGeoZoneNode[];

    beforeEach(() => {
      tree = [
        {
          id: '1',
          code: 'P1',
          name: 'Pichincha',
          level: 'provincia',
          parent_id: null,
          active: true,
          created_at: '',
          updated_at: '',
          depth: 0,
          children: [
            {
              id: '2',
              code: 'C1',
              name: 'Quito',
              level: 'canton',
              parent_id: '1',
              active: true,
              created_at: '',
              updated_at: '',
              depth: 1,
              children: [
                {
                  id: '3',
                  code: 'PR1',
                  name: 'Calderón',
                  level: 'parroquia',
                  parent_id: '2',
                  active: true,
                  created_at: '',
                  updated_at: '',
                  depth: 2,
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: '4',
          code: 'P2',
          name: 'Guayas',
          level: 'provincia',
          parent_id: null,
          active: true,
          created_at: '',
          updated_at: '',
          depth: 0,
          children: [],
        },
      ];
    });

    it('should return the original tree if term is empty', () => {
      expect(filterTreePreservingAncestors(tree, '  ')).toBe(tree);
    });

    it('should match by name and preserve ancestors', () => {
      const result = filterTreePreservingAncestors(tree, 'calderón');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1'); // Pichincha (ancestor)
      expect(result[0].children[0].id).toBe('2'); // Quito (ancestor)
      expect(result[0].children[0].children[0].id).toBe('3'); // Calderón (match)
    });

    it('should match by code', () => {
      const result = filterTreePreservingAncestors(tree, 'PR1');
      expect(result[0].children[0].children[0].name).toBe('Calderón');
    });

    it('should filter out non-matching branches', () => {
      const result = filterTreePreservingAncestors(tree, 'Guayas');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('4');
    });
  });

  describe('getLevelParentLevel', () => {
    it('should map levels to their required parent level', () => {
      expect(getLevelParentLevel('provincia')).toBeNull();
      expect(getLevelParentLevel('canton')).toBe('provincia');
      expect(getLevelParentLevel('parroquia')).toBe('canton');
      expect(getLevelParentLevel('zona')).toBe('*');
    });
  });
});
