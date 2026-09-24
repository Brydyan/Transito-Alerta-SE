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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const revocation_cache_1 = require("../sessions/revocation-cache");
const session_errors_1 = require("../sessions/session-errors");
const auth_service_1 = require("./auth.service");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(configService, authService, revocationCache) {
        const authConfig = configService.get('auth');
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: authConfig.jwtAccessSecret,
        });
        this.authService = authService;
        this.revocationCache = revocationCache;
    }
    async validate(payload) {
        if (payload.typ !== 'access') {
            throw new common_1.UnauthorizedException('Token is not an access token');
        }
        const ctx = await this.authService.getAuthContextByUserId(payload.sub);
        if (ctx.isAnonymous) {
            return ctx;
        }
        if (!payload.sid) {
            throw new common_1.UnauthorizedException({
                code: session_errors_1.SESSION_REQUIRED,
                message: 'Access token carries no session id',
            });
        }
        const isRevoked = await this.revocationCache.isRevoked(payload.sid);
        if (isRevoked) {
            throw new common_1.UnauthorizedException({
                code: session_errors_1.SESSION_REVOKED,
                message: 'Session has been revoked',
            });
        }
        return { ...ctx, sessionId: payload.sid };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        auth_service_1.AuthService,
        revocation_cache_1.RevocationCache])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map