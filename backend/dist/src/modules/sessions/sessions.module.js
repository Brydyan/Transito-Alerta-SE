"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsModule = void 0;
const common_1 = require("@nestjs/common");
const grace_buffer_1 = require("./grace-buffer");
const revocation_cache_1 = require("./revocation-cache");
const sessions_boot_warm_service_1 = require("./sessions-boot-warm.service");
const sessions_controller_1 = require("./sessions.controller");
const sessions_repository_1 = require("./sessions.repository");
const sessions_service_1 = require("./sessions.service");
let SessionsModule = class SessionsModule {
};
exports.SessionsModule = SessionsModule;
exports.SessionsModule = SessionsModule = __decorate([
    (0, common_1.Module)({
        controllers: [sessions_controller_1.SessionsController],
        providers: [
            sessions_repository_1.SessionsRepository,
            sessions_service_1.SessionsService,
            revocation_cache_1.RevocationCache,
            grace_buffer_1.GraceBuffer,
            sessions_boot_warm_service_1.SessionsBootWarmService,
        ],
        exports: [sessions_repository_1.SessionsRepository, revocation_cache_1.RevocationCache, grace_buffer_1.GraceBuffer],
    })
], SessionsModule);
//# sourceMappingURL=sessions.module.js.map