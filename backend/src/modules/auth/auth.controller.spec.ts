import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    getMe: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      getMe: jest.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  describe('POST /auth/login', () => {
    it('delegates to AuthService.login and returns access/refresh tokens + permissions', async () => {
      authService.login.mockResolvedValue({
        access_token: 'access.jwt',
        refresh_token: 'refresh.jwt',
        permissions: ['READ incidents'],
      });

      const result = await controller.login({ device_uuid: 'device-abc' });

      expect(authService.login).toHaveBeenCalledWith('device-abc');
      expect(result).toEqual({
        access_token: 'access.jwt',
        refresh_token: 'refresh.jwt',
        permissions: ['READ incidents'],
      });
    });
  });

  describe('POST /auth/refresh', () => {
    it('delegates to AuthService.refresh and returns a new access_token', async () => {
      authService.refresh.mockResolvedValue({ access_token: 'new.access.jwt' });

      const result = await controller.refresh({ refresh_token: 'refresh.jwt' });

      expect(authService.refresh).toHaveBeenCalledWith('refresh.jwt');
      expect(result).toEqual({ access_token: 'new.access.jwt' });
    });
  });

  describe('GET /auth/me', () => {
    it('returns user_id, device_uuid, and permissions for the authenticated user', async () => {
      authService.getMe.mockResolvedValue({
        deviceUuid: 'device-abc',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
      const req = { user: { userId: 'user-1', permissions: [] } } as any;

      const result = await controller.me(req);

      expect(authService.getMe).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        user_id: 'user-1',
        device_uuid: 'device-abc',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success:true (stateless JWT discard)', () => {
      const result = controller.logout();

      expect(result).toEqual({ success: true });
    });
  });
});
