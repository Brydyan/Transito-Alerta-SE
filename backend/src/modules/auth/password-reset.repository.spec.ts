import type { DataSource } from 'typeorm';

import { PasswordResetRepository } from './password-reset.repository';

describe('PasswordResetRepository (T3.6 design, same CAS shape as InvitationsRepository)', () => {
  let dataSource: { query: jest.Mock };
  let repository: PasswordResetRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new PasswordResetRepository(dataSource as unknown as DataSource);
  });

  describe('insert', () => {
    it('inserts and returns the row', async () => {
      dataSource.query.mockResolvedValue([{ id: 'reset-1' }]);

      const result = await repository.insert('user-1', 'h'.repeat(64));

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO password_reset_tokens/);
      expect(params).toEqual(['user-1', 'h'.repeat(64)]);
      expect(result).toEqual({ id: 'reset-1' });
    });
  });

  describe('casConsume', () => {
    it('issues UPDATE ... WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'reset-1' }], 1]);

      const result = await repository.casConsume('h'.repeat(64));

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE password_reset_tokens/);
      expect(sql).toMatch(/SET used_at = now\(\)/);
      expect(sql).toMatch(/WHERE token_hash = \$1 AND used_at IS NULL AND expires_at > now\(\)/);
      expect(params).toEqual(['h'.repeat(64)]);
      expect(result).not.toBeNull();
    });

    it('returns null when the CAS matches zero rows', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.casConsume('h'.repeat(64));

      expect(result).toBeNull();
    });

    it('runs against a supplied EntityManager when given', async () => {
      const manager = { query: jest.fn().mockResolvedValue([[{ id: 'reset-1' }], 1]) };

      await repository.casConsume('h'.repeat(64), manager as never);

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('findDiagnosisByHash', () => {
    it('returns used_at/expires_at for the 404-vs-410 decision', async () => {
      dataSource.query.mockResolvedValue([{ used_at: null, expires_at: new Date() }]);

      const result = await repository.findDiagnosisByHash('h'.repeat(64));

      expect(result).not.toBeNull();
    });

    it('returns null for an unknown hash', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findDiagnosisByHash('h'.repeat(64));

      expect(result).toBeNull();
    });
  });
});
