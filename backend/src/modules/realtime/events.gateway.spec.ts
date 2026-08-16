import { EventsGateway } from './events.gateway';
import { AuthService } from '../auth/auth.service';

function makeSocket(overrides: Record<string, unknown> = {}) {
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
  let authService: { validateToken: jest.Mock; getPermissionsByUserId: jest.Mock };
  let gateway: EventsGateway;
  let server: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    authService = { validateToken: jest.fn(), getPermissionsByUserId: jest.fn() };
    gateway = new EventsGateway(authService as unknown as AuthService);
    server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = server as Partial<typeof server>;
  });

  describe('handleConnection', () => {
    it('verifies the JWT, resolves permissions, and auto-joins user:{id}', async () => {
      authService.validateToken.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
      authService.getPermissionsByUserId.mockResolvedValue(['READ incidents']);
      const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });

      await gateway.handleConnection(socket as Partial<typeof socket>);

      expect(authService.validateToken).toHaveBeenCalledWith('valid.jwt');
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.data.permissions).toEqual(['READ incidents']);
    });

    it('disconnects the socket when the token is missing or invalid', async () => {
      authService.validateToken.mockImplementation(() => {
        throw new Error('invalid');
      });
      const socket = makeSocket({ handshake: { auth: { token: 'garbage' }, query: {} } });

      await gateway.handleConnection(socket as Partial<typeof socket>);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('allows joining a geo/org/incident room when the socket holds READ incidents', async () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'] } });

      const result = await gateway.handleJoin(socket as Partial<typeof socket>, { room: 'geo:zone-1' });

      expect(socket.join).toHaveBeenCalledWith('geo:zone-1');
      expect(result).toEqual({ joined: true, room: 'geo:zone-1' });
    });

    it('denies joining when the socket lacks READ incidents', async () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: [] } });

      const result = await gateway.handleJoin(socket as Partial<typeof socket>, { room: 'geo:zone-1' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ joined: false, room: 'geo:zone-1' });
    });

    it('rejects a room name outside the geo:/org:/incident: namespace (no role-based rooms)', async () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'] } });

      const result = await gateway.handleJoin(socket as Partial<typeof socket>, { room: 'admins' });

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

describe('EventsGateway — permission identity (regression)', () => {
  let authService: { validateToken: jest.Mock; getPermissionsByUserId: jest.Mock };
  let gateway: EventsGateway;

  beforeEach(() => {
    authService = { validateToken: jest.fn(), getPermissionsByUserId: jest.fn() };
    gateway = new EventsGateway(authService as unknown as AuthService);
    gateway.server = { to: jest.fn().mockReturnThis(), emit: jest.fn() } as Partial<{ to: jest.Mock; emit: jest.Mock }>;
  });

  // The JWT `sub` claim is user.id. Passing it to getPermissions(), which
  // resolves by device_uuid, yields [] — and canJoinRoom() requires
  // "READ incidents", so every room join is refused and realtime goes dark
  // for every client. Same defect as the one fixed in JwtStrategy.
  it('resolves the connecting socket permissions by user id', async () => {
    authService.validateToken.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
    authService.getPermissionsByUserId.mockResolvedValue(['READ incidents']);
    const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });

    await gateway.handleConnection(socket as Partial<typeof socket>);

    expect(authService.getPermissionsByUserId).toHaveBeenCalledWith('user-1');
    expect(socket.data.permissions).toEqual(['READ incidents']);
  });

  it('lets a permitted socket actually join a namespaced room', async () => {
    authService.validateToken.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
    authService.getPermissionsByUserId.mockResolvedValue(['READ incidents']);
    const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });
    await gateway.handleConnection(socket as Partial<typeof socket>);

    const result = await gateway.handleJoin(socket as Partial<typeof socket>, { room: 'geo:zone-1' });

    expect(result).toEqual({ joined: true, room: 'geo:zone-1' });
    expect(socket.join).toHaveBeenCalledWith('geo:zone-1');
  });
});
