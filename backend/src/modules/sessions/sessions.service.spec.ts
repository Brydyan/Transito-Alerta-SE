import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuthContext } from '../../common/authz/subject-scope';
import { RevocationCache } from './revocation-cache';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sid-1',
    user_id: 'user-1',
    device_uuid: 'device-abc',
    created_at: new Date(),
    refresh_token_hash: 'hash',
    previous_refresh_token_hash: null,
    rotated_at: null,
    ip_address: null,
    user_agent: null,
    revoked_at: null,
    last_used_at: null,
    expires_at: new Date(Date.now() + 604800_000),
    ...overrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    permissions: [],
    organizationId: 'org-A',
    roleName: 'admin_org',
    scope: { kind: 'org', organizationId: 'org-A' },
    sessionId: 'sid-current',
    isAnonymous: false,
    ...overrides,
  };
}

describe('SessionsService (T3.9 design §8 D9)', () => {
  let sessionsRepository: {
    findActiveByUser: jest.Mock;
    findActiveById: jest.Mock;
    findManageableTarget: jest.Mock;
    revoke: jest.Mock;
  };
  let revocationCache: { revoke: jest.Mock };
  let service: SessionsService;

  beforeEach(() => {
    sessionsRepository = {
      findActiveByUser: jest.fn(),
      findActiveById: jest.fn(),
      findManageableTarget: jest.fn(),
      revoke: jest.fn(),
    };
    revocationCache = { revoke: jest.fn() };
    service = new SessionsService(
      sessionsRepository as unknown as SessionsRepository,
      revocationCache as unknown as RevocationCache,
    );
  });

  describe('listForSelf', () => {
    it('lists the actor own sessions, marking the current one', async () => {
      sessionsRepository.findActiveByUser.mockResolvedValue([
        { ...makeSessionRow(), id: 'sid-current' },
        { ...makeSessionRow(), id: 'sid-other' },
      ]);

      const result = await service.listForSelf(makeActor());

      expect(result.find((s) => s.id === 'sid-current')!.current).toBe(true);
      expect(result.find((s) => s.id === 'sid-other')!.current).toBe(false);
    });
  });

  describe('listForTarget (D9 — visibility only, never rank)', () => {
    it('cross-user invisible -> 404', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-B',
        roleName: 'operador_org',
      });

      await expect(
        service.listForTarget(makeActor({ scope: { kind: 'org', organizationId: 'org-A' } }), 'target-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('visible-not-outranked (equal rank) still succeeds — reads never rank-gate', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'admin_org', // equal rank to the actor
      });
      sessionsRepository.findActiveByUser.mockResolvedValue([]);

      await expect(
        service.listForTarget(makeActor({ roleName: 'admin_org' }), 'target-1'),
      ).resolves.toEqual([]);
    });

    it('unknown target -> 404', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue(null);

      await expect(service.listForTarget(makeActor(), 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('revokeForActor (D9 — self always allowed, zero permissions)', () => {
    it('self always allowed regardless of permissions/rank', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-current', user_id: 'user-1' }),
      );
      sessionsRepository.revoke.mockResolvedValue(
        makeSessionRow({ id: 'sid-current', expires_at: new Date(Date.now() + 10_000) }),
      );

      await service.revokeForActor(makeActor({ permissions: [] }), 'sid-current');

      expect(sessionsRepository.revoke).toHaveBeenCalledWith('sid-current');
      expect(revocationCache.revoke).toHaveBeenCalledWith('sid-current', expect.any(Number));
    });

    it('throws 404 when the session does not exist', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(null);

      await expect(service.revokeForActor(makeActor(), 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('cross-user without the DELETE sessions permission -> 403', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-2', user_id: 'target-1' }),
      );

      await expect(
        service.revokeForActor(makeActor({ permissions: [] }), 'sid-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
    });

    it('cross-user invisible target -> 404', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-2', user_id: 'target-1' }),
      );
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-B',
        roleName: 'operador_org',
      });

      await expect(
        service.revokeForActor(makeActor({ permissions: ['DELETE sessions'] }), 'sid-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cross-user visible-not-outranked (including equal rank) -> 403 INSUFFICIENT_ROLE_RANK', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-2', user_id: 'target-1' }),
      );
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'admin_org', // equal rank
      });

      try {
        await service.revokeForActor(makeActor({ permissions: ['DELETE sessions'] }), 'sid-2');
        fail('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'INSUFFICIENT_ROLE_RANK',
        });
      }
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
    });

    it('cross-user visible-and-outranked succeeds', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-2', user_id: 'target-1' }),
      );
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'operador_org',
      });
      sessionsRepository.revoke.mockResolvedValue(
        makeSessionRow({ id: 'sid-2', expires_at: new Date(Date.now() + 10_000) }),
      );

      await service.revokeForActor(makeActor({ permissions: ['DELETE sessions'] }), 'sid-2');

      expect(sessionsRepository.revoke).toHaveBeenCalledWith('sid-2');
    });

    it('is idempotent when the session was already revoked (repository.revoke returns null)', async () => {
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ id: 'sid-current', user_id: 'user-1' }),
      );
      sessionsRepository.revoke.mockResolvedValue(null);

      await service.revokeForActor(makeActor(), 'sid-current');

      expect(revocationCache.revoke).not.toHaveBeenCalled();
    });
  });
});
