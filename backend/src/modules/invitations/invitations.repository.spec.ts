import type { DataSource } from 'typeorm';

import { InvitationsRepository } from './invitations.repository';

describe('InvitationsRepository (T3.6 design §2.5)', () => {
  let dataSource: { query: jest.Mock };
  let repository: InvitationsRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new InvitationsRepository(dataSource as unknown as DataSource);
  });

  describe('insertPending', () => {
    it('inserts and returns the row', async () => {
      dataSource.query.mockResolvedValue([{ id: 'inv-1' }]);

      const result = await repository.insertPending({
        email: 'a@b.com',
        roleId: 'role-1',
        organizationId: 'org-1',
        tokenHash: 'h'.repeat(64),
        invitedByUserId: 'actor-1',
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO invitations/);
      expect(params).toEqual(['a@b.com', 'role-1', 'org-1', 'h'.repeat(64), 'actor-1']);
      expect(result).toEqual({ id: 'inv-1' });
    });
  });

  describe('redeemCas (D3 — the exact CAS statement)', () => {
    it('issues UPDATE ... WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at > now()', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'inv-1', token_hash: 'h'.repeat(64) }], 1]);

      const result = await repository.redeemCas('h'.repeat(64));

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE invitations/);
      expect(sql).toMatch(/SET accepted_at = now\(\)/);
      expect(sql).toMatch(/WHERE token_hash = \$1 AND accepted_at IS NULL AND expires_at > now\(\)/);
      expect(params).toEqual(['h'.repeat(64)]);
      expect(result).not.toBeNull();
    });

    it('returns null when the CAS matches zero rows', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.redeemCas('h'.repeat(64));

      expect(result).toBeNull();
    });

    it('runs against a supplied EntityManager when given (transactional context)', async () => {
      const manager = { query: jest.fn().mockResolvedValue([[{ id: 'inv-1' }], 1]) };

      await repository.redeemCas('h'.repeat(64), manager as never);

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('findDiagnosisByHash', () => {
    it('returns accepted_at/expires_at for the 404-vs-410 decision', async () => {
      dataSource.query.mockResolvedValue([{ accepted_at: null, expires_at: new Date() }]);

      const result = await repository.findDiagnosisByHash('h'.repeat(64));

      expect(result).not.toBeNull();
    });

    it('returns null for an unknown hash (404)', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findDiagnosisByHash('h'.repeat(64));

      expect(result).toBeNull();
    });
  });

  describe('findByClaimedEmail', () => {
    it('returns the matching user row', async () => {
      dataSource.query.mockResolvedValue([{ id: 'user-1' }]);

      const result = await repository.findByClaimedEmail('a@b.com');

      expect(result).toEqual({ id: 'user-1' });
    });

    it('returns null when no user has claimed the email', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findByClaimedEmail('a@b.com');

      expect(result).toBeNull();
    });
  });

  describe('deleteIfPending', () => {
    it('deletes only an unaccepted invitation, returns true on success', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'inv-1' }], 1]);

      const result = await repository.deleteIfPending('inv-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM invitations WHERE id = \$1 AND accepted_at IS NULL/);
      expect(params).toEqual(['inv-1']);
      expect(result).toBe(true);
    });

    it('returns false when already accepted or missing', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.deleteIfPending('inv-1');

      expect(result).toBe(false);
    });
  });
});
