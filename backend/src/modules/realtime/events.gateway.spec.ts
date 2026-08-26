import { Server, Socket, DefaultEventsMap } from 'socket.io';
import { EventsGateway } from './events.gateway';
import { AuthService } from '../auth/auth.service';
import { RevocationCache } from '../sessions/revocation-cache';
import { RoomAuthorizer } from './room-authorizer.service';
import { AuthContext } from '../../common/authz/subject-scope';

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

function makeAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    permissions: ['READ incidents'],
    organizationId: null,
    roleName: null,
    scope: { kind: 'global' },
    sessionId: null,
    isAnonymous: false,
    ...overrides,
  };
}

describe('EventsGateway', () => {
  let authService: { validateToken: jest.Mock; getAuthContextByUserId: jest.Mock };
  let roomAuthorizer: { authorize: jest.Mock };
  let revocationCache: { isRevoked: jest.Mock };
  let gateway: EventsGateway;
  let server: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    authService = { validateToken: jest.fn(), getAuthContextByUserId: jest.fn() };
    roomAuthorizer = { authorize: jest.fn() };
    revocationCache = { isRevoked: jest.fn().mockResolvedValue(false) };
    gateway = new EventsGateway(
      authService as unknown as AuthService,
      roomAuthorizer as unknown as RoomAuthorizer,
      revocationCache as unknown as RevocationCache,
    );
    server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = server as unknown as jest.Mocked<Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>;
  });

  describe('handleConnection', () => {
    it('verifies the JWT, resolves the full AuthContext, and auto-joins user:{id}', async () => {
      authService.validateToken.mockReturnValue({
        sub: 'user-1',
        typ: 'access',
        jti: 'x',
        pv: 1,
        sid: 'sid-1',
      });
      authService.getAuthContextByUserId.mockResolvedValue(makeAuthContext({ userId: 'user-1' }));
      const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });

      await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

      expect(authService.validateToken).toHaveBeenCalledWith('valid.jwt');
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.data.permissions).toEqual(['READ incidents']);
      expect(socket.data.scope).toEqual({ kind: 'global' });
      expect(socket.data.sessionId).toBe('sid-1');
    });

    it('disconnects the socket when the token is missing or invalid', async () => {
      authService.validateToken.mockImplementation(() => {
        throw new Error('invalid');
      });
      const socket = makeSocket({ handshake: { auth: { token: 'garbage' }, query: {} } });

      await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('T3.9 — disconnects when a non-anonymous token carries no sid', async () => {
      authService.validateToken.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
      authService.getAuthContextByUserId.mockResolvedValue(makeAuthContext({ userId: 'user-1' }));
      const socket = makeSocket({ handshake: { auth: { token: 'legacy.jwt' }, query: {} } });

      await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('T3.9 — disconnects when RevocationCache reports the session revoked', async () => {
      authService.validateToken.mockReturnValue({
        sub: 'user-1',
        typ: 'access',
        jti: 'x',
        pv: 1,
        sid: 'sid-1',
      });
      authService.getAuthContextByUserId.mockResolvedValue(makeAuthContext({ userId: 'user-1' }));
      revocationCache.isRevoked.mockResolvedValue(true);
      const socket = makeSocket({ handshake: { auth: { token: 'revoked.jwt' }, query: {} } });

      await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

      expect(revocationCache.isRevoked).toHaveBeenCalledWith('sid-1');
      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('T3.9 — an anonymous identity skips the sid/denylist check entirely (D8)', async () => {
      authService.validateToken.mockReturnValue({ sub: 'anon-1', typ: 'access', jti: 'x', pv: 1 });
      authService.getAuthContextByUserId.mockResolvedValue(
        makeAuthContext({ userId: 'anon-1', isAnonymous: true }),
      );
      const socket = makeSocket({ handshake: { auth: { token: 'anon.jwt' }, query: {} } });

      await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

      expect(revocationCache.isRevoked).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith('user:anon-1');
    });
  });

  describe('handleJoin (T3.2 design D11 — delegates to RoomAuthorizer)', () => {
    it('allows joining when RoomAuthorizer authorizes the room', async () => {
      roomAuthorizer.authorize.mockResolvedValue(true);
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'], scope: { kind: 'global' } } });

      const result = await gateway.handleJoin(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>, { room: 'geo:zone-1' });

      expect(roomAuthorizer.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', scope: { kind: 'global' } }),
        'geo:zone-1',
      );
      expect(socket.join).toHaveBeenCalledWith('geo:zone-1');
      expect(result).toEqual({ joined: true, room: 'geo:zone-1' });
    });

    it('denies joining when RoomAuthorizer denies the room (e.g. cross-org)', async () => {
      roomAuthorizer.authorize.mockResolvedValue(false);
      const socket = makeSocket({
        data: { userId: 'user-1', permissions: [], scope: { kind: 'org', organizationId: 'org-A' } },
      });

      const result = await gateway.handleJoin(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>, { room: 'org:org-B' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(result).toEqual({ joined: false, room: 'org:org-B' });
    });

    it('rejects a room name outside the geo:/org:/incident: namespace (no role-based rooms)', async () => {
      const socket = makeSocket({ data: { userId: 'user-1', permissions: ['READ incidents'], scope: { kind: 'global' } } });

      const result = await gateway.handleJoin(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>, { room: 'admins' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(roomAuthorizer.authorize).not.toHaveBeenCalled();
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
  let authService: { validateToken: jest.Mock; getAuthContextByUserId: jest.Mock };
  let roomAuthorizer: { authorize: jest.Mock };
  let revocationCache: { isRevoked: jest.Mock };
  let gateway: EventsGateway;

  beforeEach(() => {
    authService = { validateToken: jest.fn(), getAuthContextByUserId: jest.fn() };
    roomAuthorizer = { authorize: jest.fn() };
    revocationCache = { isRevoked: jest.fn().mockResolvedValue(false) };
    gateway = new EventsGateway(
      authService as unknown as AuthService,
      roomAuthorizer as unknown as RoomAuthorizer,
      revocationCache as unknown as RevocationCache,
    );
    gateway.server = { to: jest.fn().mockReturnThis(), emit: jest.fn() } as unknown as jest.Mocked<Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>;
  });

  // The JWT `sub` claim is user.id. Resolving by device_uuid would yield []
  // and every room join would be refused, going dark for every client.
  it('resolves the connecting socket AuthContext by user id', async () => {
    authService.validateToken.mockReturnValue({
      sub: 'user-1',
      typ: 'access',
      jti: 'x',
      pv: 1,
      sid: 'sid-1',
    });
    authService.getAuthContextByUserId.mockResolvedValue(makeAuthContext({ userId: 'user-1' }));
    const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });

    await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

    expect(authService.getAuthContextByUserId).toHaveBeenCalledWith('user-1');
    expect(socket.data.permissions).toEqual(['READ incidents']);
  });

  it('lets a permitted socket actually join a namespaced room', async () => {
    authService.validateToken.mockReturnValue({
      sub: 'user-1',
      typ: 'access',
      jti: 'x',
      pv: 1,
      sid: 'sid-1',
    });
    authService.getAuthContextByUserId.mockResolvedValue(makeAuthContext({ userId: 'user-1' }));
    roomAuthorizer.authorize.mockResolvedValue(true);
    const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt' }, query: {} } });
    await gateway.handleConnection(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>);

    const result = await gateway.handleJoin(socket as unknown as jest.Mocked<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>, { room: 'geo:zone-1' });

    expect(result).toEqual({ joined: true, room: 'geo:zone-1' });
    expect(socket.join).toHaveBeenCalledWith('geo:zone-1');
  });
});
