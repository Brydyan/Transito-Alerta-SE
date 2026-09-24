import { OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RevocationCache } from '../sessions/revocation-cache';
import { RoomAuthorizer } from './room-authorizer.service';
export declare class EventsGateway implements OnGatewayConnection {
    private readonly authService;
    private readonly roomAuthorizer;
    private readonly revocationCache;
    server: Server;
    private readonly logger;
    constructor(authService: AuthService, roomAuthorizer: RoomAuthorizer, revocationCache: RevocationCache);
    handleConnection(socket: Socket): Promise<void>;
    handleJoin(socket: Socket, body: {
        room: string;
    }): Promise<{
        joined: boolean;
        room: string;
    }>;
    broadcast(type: string, data: Record<string, unknown>): void;
    private extractToken;
}
