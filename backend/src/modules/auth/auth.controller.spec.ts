import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PasswordResetService } from './password-reset.service';
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
    loginWithPassword: jest.Mock;
    refresh: jest.Mock;
    getMe: jest.Mock;
    revokeSession: jest.Mock;
    changePassword: jest.Mock;
    issueSessionForNewIdentity: jest.Mock;
  };
  let invitationsService: { redeem: jest.Mock };
  let passwordResetService: { requestReset: jest.Mock; confirmReset: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      loginWithPassword: jest.fn(),
      refresh: jest.fn(),
      getMe: jest.fn(),
      revokeSession: jest.fn(),
      changePassword: jest.fn(),
      issueSessionForNewIdentity: jest.fn(),
    };
    invitationsService = { redeem: jest.fn() };
    passwordResetService = { requestReset: jest.fn(), confirmReset: jest.fn() };
    controller = new AuthController(
      authService as unknown as AuthService,
      invitationsService as unknown as InvitationsService,
      passwordResetService as unknown as PasswordResetService,
    );
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

  describe('POST /auth/login — password dispatch (T3.6 design D1)', () => {
    it('dispatches to AuthService.loginWithPassword for an {email,password} body', async () => {
      authService.loginWithPassword.mockResolvedValue({
        access_token: 'access.jwt',
        refresh_token: 'refresh.jwt',
        permissions: [],
      });

      await controller.login({ email: 'a@b.com', password: 'secret1234567' }, makeReq());

      expect(authService.loginWithPassword).toHaveBeenCalledWith(
        { email: 'a@b.com', password: 'secret1234567', deviceUuid: null },
        { ip: '203.0.113.9', userAgent: 'jest-test-agent' },
      );
      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/accept-invitation (T3.6)', () => {
    it('redeems then mints a session strictly after (issueSessionForNewIdentity)', async () => {
      invitationsService.redeem.mockResolvedValue('user-1');
      authService.issueSessionForNewIdentity.mockResolvedValue({
        access_token: 'a',
        refresh_token: 'r',
        permissions: [],
      });

      const result = await controller.acceptInvitation(
        { token: 'tok', password: 'secret1234567' },
        makeReq(),
      );

      expect(invitationsService.redeem).toHaveBeenCalledWith('tok', 'secret1234567');
      expect(authService.issueSessionForNewIdentity).toHaveBeenCalledWith('user-1', {
        ip: '203.0.113.9',
        userAgent: 'jest-test-agent',
      });
      expect(result.access_token).toBe('a');
    });
  });

  describe('POST /auth/password-reset (T3.6 D9 — always 202)', () => {
    it('delegates to PasswordResetService.requestReset', async () => {
      await controller.passwordReset({ email: 'a@b.com' });
      expect(passwordResetService.requestReset).toHaveBeenCalledWith('a@b.com');
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('delegates to PasswordResetService.confirmReset', async () => {
      await controller.passwordResetConfirm({ token: 'tok', password: 'secret1234567' });
      expect(passwordResetService.confirmReset).toHaveBeenCalledWith('tok', 'secret1234567');
    });
  });

  describe('PUT /auth/password (T3.6 — SELF-only)', () => {
    it('delegates to AuthService.changePassword with the caller userId', async () => {
      const req = {
        user: { userId: 'user-1', permissions: [], sessionId: 'sid-1', isAnonymous: false },
      } as unknown as AuthenticatedRequest;

      await controller.changePassword(
        { current_password: 'old12345678', new_password: 'newpassword1234' },
        req,
      );

      expect(authService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old12345678',
        'newpassword1234',
      );
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

    it('returns device_uuid: null for a password-only identity (T3.6 D8)', async () => {
      authService.getMe.mockResolvedValue({ deviceUuid: null, permissions: ['READ incidents'] });
      const req = {
        user: { userId: 'user-2', permissions: [], sessionId: 'sid-2', isAnonymous: false },
      } as unknown as AuthenticatedRequest;

      const result = await controller.me(req);

      expect(result.device_uuid).toBeNull();
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
