import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.9',
    headers: { 'user-agent': 'jest-test-agent' },
    ...overrides,
  } as unknown as Request;
}

describe('AuthController', () => {
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    getMe: jest.Mock;
    revokeSession: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      getMe: jest.fn(),
      revokeSession: jest.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  describe('POST /auth/login', () => {
    it('delegates to AuthService.login with device_uuid + request meta (ip/user-agent)', async () => {
      authService.login.mockResolvedValue({
        access_token: 'access.jwt',
        refresh_token: 'refresh.jwt',
        permissions: ['READ incidents'],
      });

      const result = await controller.login({ device_uuid: 'device-abc' }, makeReq());

      expect(authService.login).toHaveBeenCalledWith('device-abc', {
        ip: '203.0.113.9',
        userAgent: 'jest-test-agent',
      });
      expect(result).toEqual({
        access_token: 'access.jwt',
        refresh_token: 'refresh.jwt',
        permissions: ['READ incidents'],
      });
    });
  });

  describe('POST /auth/refresh (T3.9 — returns the full AuthTokens, not just access_token)', () => {
    it('delegates to AuthService.refresh with the token + request meta and returns the full pair', async () => {
      authService.refresh.mockResolvedValue({
        access_token: 'new.access.jwt',
        refresh_token: 'new.refresh.jwt',
        permissions: ['READ incidents'],
      });

      const result = await controller.refresh({ refresh_token: 'refresh.jwt' }, makeReq());

      expect(authService.refresh).toHaveBeenCalledWith('refresh.jwt', {
        ip: '203.0.113.9',
        userAgent: 'jest-test-agent',
      });
      expect(result).toEqual({
        access_token: 'new.access.jwt',
        refresh_token: 'new.refresh.jwt',
        permissions: ['READ incidents'],
      });
    });
  });

  describe('GET /auth/me', () => {
    it('returns user_id, device_uuid, and permissions for the authenticated user', async () => {
      authService.getMe.mockResolvedValue({
        deviceUuid: 'device-abc',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
      const req = {
        user: { userId: 'user-1', permissions: [], sessionId: 'sid-1', isAnonymous: false },
      } as unknown as AuthenticatedRequest;

      const result = await controller.me(req);

      expect(authService.getMe).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        user_id: 'user-1',
        device_uuid: 'device-abc',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
    });
  });

  describe('POST /auth/logout (T3.9 — now stateful)', () => {
    it('revokes the session referenced by req.user.sessionId', async () => {
      const req = {
        user: { userId: 'user-1', permissions: [], sessionId: 'sid-1', isAnonymous: false },
      } as unknown as AuthenticatedRequest;

      const result = await controller.logout(req);

      expect(authService.revokeSession).toHaveBeenCalledWith('sid-1');
      expect(result).toEqual({ success: true });
    });

    it('is a harmless no-op for an anonymous identity (no sessionId to revoke)', async () => {
      const req = {
        user: { userId: 'anon-1', permissions: [], sessionId: null, isAnonymous: true },
      } as unknown as AuthenticatedRequest;

      const result = await controller.logout(req);

      expect(authService.revokeSession).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
