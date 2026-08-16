import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let repo: { find: jest.Mock };
  let service: PermissionsService;

  beforeEach(() => {
    repo = { find: jest.fn() };
    service = new PermissionsService(repo as any);
  });

  describe('findAll', () => {
    it('returns the full resource+action catalog (R7)', async () => {
      const rows = [
        { id: 'p-1', resource: 'incidents', action: 'READ' },
        { id: 'p-2', resource: 'incidents', action: 'CREATE' },
      ];
      repo.find.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(result).toEqual(rows);
    });

    // R7: a resource newly introduced with no permission rows must not
    // appear here — PermissionGuard's default-deny (already covers this
    // at the guard level) is not weakened by the catalog inventing rows.
    it('returns an empty array when no permission rows exist yet', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
