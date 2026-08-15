import { EventsGateway } from './events.gateway';
import { AuthService } from '../auth/auth.service';

function makeSocket(overrides: Partial<any> = {}) {
  return {
    handshake: { auth: {}, query: {} },
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

describe('EventsGateway', () => {
  let authService: { validateToken: jest.Mock; getPermissions: jest.Mock };
  let gateway: EventsGateway;
  let server: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    authService = { validateToken: jest.fn(), getPermissions: jest.fn() };
    gateway = new EventsGateway(authService as unknown as AuthService);
    server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = server as any;
  });

  describe('handleConnection', () => {
    it('verifies the JWT, resolves permissions, and auto-joins user:{id}', async () => {
      authService.validateToken.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
      authService.getPermissions.mockResolvedValue(['READ incidents']);
      const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });

      await gateway.handleConnection(socket as any);

      expect(authService.validateToken).toHaveBeenCalledWith('valid.jwt');
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.data.permissions).toEqual(['READ incidents']);
    });

    it('disconnects the socket when the token is missing or invalid', async () => {
      authService.validateToken.mockImplementation(() => {
        throw new Error('invalid');
      });
      const socket = makeSocket({ handshake: { auth: { token: 'garbage' }, query: {} } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('allows joining a geo/org/incident room when the socket holds READ incidents', () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'] } });

      const result = gateway.handleJoin(socket as any, { room: 'geo:zone-1' });

      expect(socket.join).toHaveBeenCalledWith('geo:zone-1');
      expect(result).toEqual({ joined: true, room: 'geo:zone-1' });
    });

    it('denies joining when the socket lacks READ incidents', () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: [] } });

      const result = gateway.handleJoin(socket as any, { room: 'geo:zone-1' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ joined: false, room: 'geo:zone-1' });
    });

    it('rejects a room name outside the geo:/org:/incident: namespace (no role-based rooms)', () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'] } });

      const result = gateway.handleJoin(socket as any, { room: 'admins' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ joined: false, room: 'admins' });
    });
  });

  describe('broadcast', () => {
    it('emits to every room resolved from the event payload', () => {
      gateway.broadcast('incident.created', { id: 'inc-1', zone_id: 'zone-1', org_id: 'org-1' });

      expect(server.to).toHaveBeenCalledWith(['geo:zone-1', 'org:org-1', 'incident:inc-1']);
      expect(server.emit).toHaveBeenCalledWith('incident.created', {
        id: 'inc-1',
        zone_id: 'zone-1',
        org_id: 'org-1',
      });
    });

    it('does not call server.to when no rooms resolve (nothing to broadcast to)', () => {
      gateway.broadcast('incident.created', {});

      expect(server.to).not.toHaveBeenCalled();
    });
  });
});
