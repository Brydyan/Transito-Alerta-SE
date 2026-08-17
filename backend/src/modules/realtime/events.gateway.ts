import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { AuthService } from '../auth/auth.service';
import { RoomAuthorizer } from './room-authorizer.service';
import { resolveRoomsForEvent, userRoom } from './room.util';

const ROOM_NAMESPACE_PREFIXES = ['geo:', 'org:', 'incident:'];

/**
 * EventsGateway (T2.5, CC4, design D5/D6).
 *
 * Auth on connect: verify the JWT (AuthService.validateToken), resolve the
 * permission set (Redis-cached, D2), auto-join `user:{id}`. Further room
 * joins (`geo:{zone_id}`, `org:{org_id}`, `incident:{id}`) are gated at
 * join time via `join` — NEVER role-based rooms (the 25k-user failure
 * mode where every admin receives every city-wide incident).
 *
 * Cross-instance fan-out requires BOTH: this gateway's `broadcast()` is fed
 * by RealtimeStreamsConsumer's Redis Streams consumer group (durable,
 * exactly-once-per-group delivery to ONE instance), and the socket.io
 * Redis adapter (wired in main.ts) actually reaches clients connected to
 * *other* instances. Either alone is broken (design D5).
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly roomAuthorizer: RoomAuthorizer,
  ) {}

  async handleConnection(@ConnectedSocket() socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const payload = this.authService.validateToken(token);
      // `sub` is user.id — resolve by id. The full AuthContext (T3.2
      // design) is set on socket.data, mirroring req.user on the HTTP
      // side — the same source of truth for both transports (design
      // "Sequence Flows").
      const ctx = await this.authService.getAuthContextByUserId(payload.sub);
      socket.data.userId = ctx.userId;
      socket.data.permissions = ctx.permissions;
      socket.data.scope = ctx.scope;
      // Awaited: with the Redis adapter, join() is asynchronous — not
      // awaiting races the first event emitted to this room.
      await socket.join(userRoom(payload.sub));
    } catch (err) {
      this.logger.warn(`Rejected WS connection: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { room: string },
  ): Promise<{ joined: boolean; room: string }> {
    const { room } = body;
    const isNamespaced = ROOM_NAMESPACE_PREFIXES.some((prefix) => room.startsWith(prefix));

    if (!isNamespaced) {
      return { joined: false, room };
    }

    // T3.2 design D11 — RoomAuthorizer authorizes the SPECIFIC room
    // against the connecting socket's AuthContext, not just a global
    // permission check.
    const ctx = {
      userId: socket.data?.userId,
      permissions: socket.data?.permissions ?? [],
      organizationId: socket.data?.scope?.organizationId ?? null,
      roleName: null,
      scope: socket.data?.scope ?? { kind: 'public' },
    };
    const authorized = await this.roomAuthorizer.authorize(ctx, room);

    if (!authorized) {
      return { joined: false, room };
    }

    // Awaited: asynchronous under the Redis adapter, and the ack below tells
    // the client it may start receiving — it must be true by then.
    await socket.join(room);
    return { joined: true, room };
  }

  /**
   * Fed by RealtimeStreamsConsumer. Computes target rooms from the EVENT
   * PAYLOAD (design D6), not connection state.
   */
  broadcast(type: string, data: Record<string, unknown>): void {
    const rooms = resolveRoomsForEvent(data);
    if (rooms.length === 0) {
      return;
    }
    this.server.to(rooms).emit(type, data);
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake.auth ?? {};
    const query = socket.handshake.query ?? {};
    return (auth.token as string) ?? (query.token as string) ?? undefined;
  }
}
