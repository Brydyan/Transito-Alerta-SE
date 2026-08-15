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
import { canJoinRoom, resolveRoomsForEvent, userRoom } from './room.util';

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

  constructor(private readonly authService: AuthService) {}

  async handleConnection(@ConnectedSocket() socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const payload = this.authService.validateToken(token);
      const permissions = await this.authService.getPermissions(payload.sub);
      socket.data.userId = payload.sub;
      socket.data.permissions = permissions;
      socket.join(userRoom(payload.sub));
    } catch (err) {
      this.logger.warn(`Rejected WS connection: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { room: string },
  ): { joined: boolean; room: string } {
    const { room } = body;
    const isNamespaced = ROOM_NAMESPACE_PREFIXES.some((prefix) => room.startsWith(prefix));
    const permissions: string[] = socket.data?.permissions ?? [];

    if (!isNamespaced || !canJoinRoom(permissions)) {
      return { joined: false, room };
    }

    socket.join(room);
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
