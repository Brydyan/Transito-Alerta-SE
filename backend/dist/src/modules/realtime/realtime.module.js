"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const sessions_module_1 = require("../sessions/sessions.module");
const events_gateway_1 = require("./events.gateway");
const room_authorizer_service_1 = require("./room-authorizer.service");
const streams_consumer_1 = require("./streams.consumer");
let RealtimeModule = class RealtimeModule {
};
exports.RealtimeModule = RealtimeModule;
exports.RealtimeModule = RealtimeModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, sessions_module_1.SessionsModule],
        providers: [events_gateway_1.EventsGateway, streams_consumer_1.RealtimeStreamsConsumer, room_authorizer_service_1.RoomAuthorizer],
        exports: [events_gateway_1.EventsGateway],
    })
], RealtimeModule);
//# sourceMappingURL=realtime.module.js.map