"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EventsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const auth_service_1 = require("../auth/auth.service");
const revocation_cache_1 = require("../sessions/revocation-cache");
const room_authorizer_service_1 = require("./room-authorizer.service");
const room_util_1 = require("./room.util");
const ROOM_NAMESPACE_PREFIXES = ['geo:', 'org:', 'incident:'];
let EventsGateway = EventsGateway_1 = class EventsGateway {
    constructor(authService, roomAuthorizer, revocationCache) {
        this.authService = authService;
        this.roomAuthorizer = roomAuthorizer;
        this.revocationCache = revocationCache;
        this.logger = new common_1.Logger(EventsGateway_1.name);
    }
    async handleConnection(socket) {
        const token = this.extractToken(socket);
        if (!token) {
            socket.disconnect(true);
            return;
        }
        try {
            const payload = this.authService.validateToken(token);
            const ctx = await this.authService.getAuthContextByUserId(payload.sub);
            if (!ctx.isAnonymous) {
                if (!payload.sid) {
                    this.logger.warn('Rejected WS connection: access token carries no session id');
                    socket.disconnect(true);
                    return;
                }
                const isRevoked = await this.revocationCache.isRevoked(payload.sid);
                if (isRevoked) {
                    this.logger.warn('Rejected WS connection: session has been revoked');
                    socket.disconnect(true);
                    return;
                }
            }
            socket.data.userId = ctx.userId;
            socket.data.permissions = ctx.permissions;
            socket.data.scope = ctx.scope;
            socket.data.sessionId = ctx.isAnonymous ? null : (payload.sid ?? null);
            socket.data.isAnonymous = ctx.isAnonymous;
            await socket.join((0, room_util_1.userRoom)(payload.sub));
        }
        catch (err) {
            this.logger.warn(`Rejected WS connection: ${err.message}`);
            socket.disconnect(true);
        }
    }
    async handleJoin(socket, body) {
        const { room } = body;
        const isNamespaced = ROOM_NAMESPACE_PREFIXES.some((prefix) => room.startsWith(prefix));
        if (!isNamespaced) {
            return { joined: false, room };
        }
        const ctx = {
            userId: socket.data?.userId,
            permissions: socket.data?.permissions ?? [],
            organizationId: socket.data?.scope?.organizationId ?? null,
            roleName: null,
            scope: socket.data?.scope ?? { kind: 'public' },
            sessionId: socket.data?.sessionId ?? null,
            isAnonymous: socket.data?.isAnonymous ?? true,
        };
        const authorized = await this.roomAuthorizer.authorize(ctx, room);
        if (!authorized) {
            return { joined: false, room };
        }
        await socket.join(room);
        return { joined: true, room };
    }
    broadcast(type, data) {
        const rooms = (0, room_util_1.resolveRoomsForEvent)(data);
        if (rooms.length === 0) {
            return;
        }
        this.server.to(rooms).emit(type, data);
    }
    extractToken(socket) {
        const auth = socket.handshake.auth ?? {};
        const query = socket.handshake.query ?? {};
        return auth.token ?? query.token ?? undefined;
    }
};
exports.EventsGateway = EventsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], EventsGateway.prototype, "server", void 0);
__decorate([
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", Promise)
], EventsGateway.prototype, "handleConnection", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], EventsGateway.prototype, "handleJoin", null);
exports.EventsGateway = EventsGateway = EventsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: '*' } }),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        room_authorizer_service_1.RoomAuthorizer,
        revocation_cache_1.RevocationCache])
], EventsGateway);
//# sourceMappingURL=events.gateway.js.map