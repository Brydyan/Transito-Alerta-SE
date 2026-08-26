import type { DataSource } from 'typeorm';

import { SessionsRepository } from './sessions.repository';

describe('SessionsRepository (T3.9 design §4)', () => {
  let dataSource: { query: jest.Mock };
  let repository: SessionsRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new SessionsRepository(dataSource as unknown as DataSource);
  });

  describe('create', () => {
    it('inserts a row with a computed expires_at and RETURNING all 12 columns', async () => {
      dataSource.query.mockResolvedValue([{ id: 'sid-1' }]);

      const result = await repository.create({
        id: 'sid-1',
        userId: 'user-1',
        deviceUuid: 'device-1',
        refreshTokenHash: 'hash1',
        ipAddress: '1.2.3.4',
        userAgent: 'agent',
        ttlSeconds: 604800,
      });

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO user_sessions/i);
      expect(sql).toMatch(/make_interval\(secs => \$7::int\)/);
      expect(sql).toMatch(/RETURNING/i);
      expect(params).toEqual([
        'sid-1',
        'user-1',
        'device-1',
        'hash1',
        '1.2.3.4',
        'agent',
        604800,
      ]);
      expect(result).toEqual({ id: 'sid-1' });
    });
  });

  describe('findActiveById', () => {
    it('applies the ACTIVE_SESSION_SQL predicate scoped by id', async () => {
      dataSource.query.mockResolvedValue([{ id: 'sid-1' }]);

      const result = await repository.findActiveById('sid-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/WHERE id = \$1 AND revoked_at IS NULL/);
      expect(params).toEqual(['sid-1']);
      expect(result).toEqual({ id: 'sid-1' });
    });

    it('returns null on no match', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findActiveById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findActiveByUser', () => {
    it('applies the ACTIVE_SESSION_SQL predicate scoped by user, ordered created_at DESC', async () => {
      dataSource.query.mockResolvedValue([{ id: 'sid-1' }, { id: 'sid-2' }]);

      const result = await repository.findActiveByUser('user-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/WHERE user_id = \$1 AND revoked_at IS NULL/);
      expect(sql).toMatch(/ORDER BY created_at DESC/);
      expect(params).toEqual(['user-1']);
      expect(result).toHaveLength(2);
    });
  });

  describe('rotate — the exact CAS statement (design §1)', () => {
    it('issues the verbatim one-statement compare-and-swap', async () => {
      // TypeORM's DataSource.query() returns a [rows, affectedCount]
      // TUPLE for UPDATE/DELETE — never a flat rows array (see
      // firstUpdatedRow's doc comment).
      dataSource.query.mockResolvedValue([[{ id: 'sid-1' }], 1]);

      const result = await repository.rotate({
        id: 'sid-1',
        newHash: 'new-hash',
        expectedHash: 'old-hash',
        ttlSeconds: 604800,
        ipAddress: '1.2.3.4',
        userAgent: 'agent',
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE user_sessions/);
      expect(sql).toMatch(/previous_refresh_token_hash = refresh_token_hash/);
      expect(sql).toMatch(/refresh_token_hash\s+= \$2/);
      expect(sql).toMatch(/rotated_at\s+= now\(\)/);
      expect(sql).toMatch(/last_used_at\s+= now\(\)/);
      expect(sql).toMatch(/expires_at\s+= now\(\) \+ make_interval\(secs => \$3::int\)/);
      expect(sql).toMatch(/WHERE\s+id\s+= \$1/);
      expect(sql).toMatch(/AND refresh_token_hash = \$6/);
      expect(sql).toMatch(/AND revoked_at IS NULL/);
      expect(sql).toMatch(/AND expires_at > now\(\)/);
      expect(params).toEqual(['sid-1', 'new-hash', 604800, '1.2.3.4', 'agent', 'old-hash']);
      expect(result).toEqual({ id: 'sid-1' });
    });

    it('returns null when the CAS matches zero rows (lost the race)', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.rotate({
        id: 'sid-1',
        newHash: 'new-hash',
        expectedHash: 'stale-hash',
        ttlSeconds: 604800,
        ipAddress: null,
        userAgent: null,
      });

      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('sets revoked_at and returns the row (for the caller to read expires_at)', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'sid-1', expires_at: new Date() }], 1]);

      const result = await repository.revoke('sid-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/SET revoked_at = now\(\)/);
      expect(sql).toMatch(/WHERE id = \$1 AND revoked_at IS NULL/);
      expect(params).toEqual(['sid-1']);
      expect(result).not.toBeNull();
    });

    it('returns null when already revoked (idempotent no-op)', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.revoke('sid-1');

      expect(result).toBeNull();
    });
  });

  describe('existsRevoked', () => {
    it('returns a boolean, never a row', async () => {
      dataSource.query.mockResolvedValue([{ exists: true }]);

      const result = await repository.existsRevoked('sid-1');

      expect(result).toBe(true);
    });

    it('returns false on no match', async () => {
      dataSource.query.mockResolvedValue([{ exists: false }]);

      const result = await repository.existsRevoked('sid-1');

      expect(result).toBe(false);
    });
  });

  describe('findRevokedUnexpired (boot-warm query)', () => {
    it('selects revoked, unexpired sessions', async () => {
      dataSource.query.mockResolvedValue([{ id: 'sid-1', expires_at: new Date() }]);

      const result = await repository.findRevokedUnexpired();

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/revoked_at IS NOT NULL AND expires_at > now\(\)/);
      expect(result).toHaveLength(1);
    });
  });

  describe('revokeAllForUser (T3.6 D6)', () => {
    it('bulk-revokes every active session for the user, unwrapped via the FULL rows array', async () => {
      // Multi-row RETURNING — proves this uses updatedRows(), not
      // firstUpdatedRow() (which would silently drop rows 2..N).
      dataSource.query.mockResolvedValue([
        [
          { id: 'sid-1', expires_at: new Date('2026-01-01') },
          { id: 'sid-2', expires_at: new Date('2026-01-02') },
        ],
        2,
      ]);

      const result = await repository.revokeAllForUser('user-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE user_sessions/);
      expect(sql).toMatch(/SET revoked_at = now\(\)/);
      expect(sql).toMatch(/WHERE user_id = \$1 AND revoked_at IS NULL AND expires_at > now\(\)/);
      expect(sql).toMatch(/RETURNING id, expires_at/);
      expect(params).toEqual(['user-1']);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sid-1');
      expect(result[1].id).toBe('sid-2');
    });

    it('returns an empty array when the user has no active sessions', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      const result = await repository.revokeAllForUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findManageableTarget', () => {
    it('joins users LEFT JOIN roles and returns the mapped target', async () => {
      dataSource.query.mockResolvedValue([
        { id: 'user-1', organization_id: 'org-1', role_name: 'operador_org' },
      ]);

      const result = await repository.findManageableTarget('user-1');

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/LEFT JOIN roles/);
      expect(params).toEqual(['user-1']);
      expect(result).toEqual({
        id: 'user-1',
        organizationId: 'org-1',
        roleName: 'operador_org',
      });
    });

    it('returns null when the user does not exist', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findManageableTarget('missing');

      expect(result).toBeNull();
    });
  });
});
