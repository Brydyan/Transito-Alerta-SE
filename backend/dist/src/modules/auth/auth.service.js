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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.PERMISSION_CACHE_PREFIX = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const jwt_1 = require("@nestjs/jwt");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const permission_lookup_service_1 = require("../../common/permissions/permission-lookup.service");
const resolve_subject_scope_1 = require("../../common/authz/resolve-subject-scope");
const session_hash_1 = require("../../common/crypto/session-hash");
const grace_buffer_1 = require("../sessions/grace-buffer");
const revocation_cache_1 = require("../sessions/revocation-cache");
const session_validity_1 = require("../sessions/session-validity");
const session_errors_1 = require("../sessions/session-errors");
const sessions_repository_1 = require("../sessions/sessions.repository");
const auth_errors_1 = require("./auth-errors");
const password_hasher_1 = require("./password-hasher");
exports.PERMISSION_CACHE_PREFIX = 'perm:v3:';
function sessionError(code, message) {
    return new common_1.UnauthorizedException({ code, message });
}
function invalidCredentialsError() {
    return new common_1.UnauthorizedException({ code: auth_errors_1.INVALID_CREDENTIALS, message: 'Invalid email or password' });
}
let AuthService = AuthService_1 = class AuthService {
    constructor(userRepo, jwtService, cache, configService, dataSource, sessionsRepository, revocationCache, graceBuffer, permissionLookup, passwordHasher) {
        this.userRepo = userRepo;
        this.jwtService = jwtService;
        this.cache = cache;
        this.configService = configService;
        this.dataSource = dataSource;
        this.sessionsRepository = sessionsRepository;
        this.revocationCache = revocationCache;
        this.graceBuffer = graceBuffer;
        this.permissionLookup = permissionLookup;
        this.passwordHasher = passwordHasher;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    get authConfig() {
        return this.configService.get('auth');
    }
    async login(deviceUuid, meta = { ip: null, userAgent: null }) {
        if (!deviceUuid || !deviceUuid.trim()) {
            throw new common_1.UnauthorizedException('device_uuid is required');
        }
        if (deviceUuid === this.authConfig.anonymousDeviceUuid) {
            throw new common_1.UnauthorizedException({
                code: auth_errors_1.ANONYMOUS_IDENTITY_CLOSED,
                message: 'El reporte anónimo sin sesión ya no está disponible. Registrate primero para reportar.',
            });
        }
        let user = await this.userRepo.findOne({ where: { deviceUuid } });
        if (!user) {
            user = this.userRepo.create({ deviceUuid, permissions: [], isActive: true });
            user = await this.userRepo.save(user);
        }
        const permissions = await this.getPermissions(deviceUuid);
        return this.issueSession(user, deviceUuid, meta, permissions);
    }
    async loginWithPassword(input, meta = { ip: null, userAgent: null }) {
        const user = await this.userRepo.findOne({ where: { email: input.email } });
        const hashToCompare = user?.passwordHash ?? password_hasher_1.DUMMY_HASH;
        const passwordMatches = await this.passwordHasher.verify(input.password, hashToCompare);
        if (!user || !passwordMatches || user.isActive === false) {
            throw invalidCredentialsError();
        }
        const permissions = await this.getPermissionsByUserId(user.id);
        return this.issueSession(user, input.deviceUuid, meta, permissions);
    }
    async issueSessionForNewIdentity(userId, meta = { ip: null, userAgent: null }) {
        const permissions = await this.getPermissionsByUserId(userId);
        return this.issueSession({ id: userId }, null, meta, permissions);
    }
    async issueSession(user, deviceUuid, meta, permissions) {
        const sid = (0, crypto_1.randomUUID)();
        const accessToken = this.signAccessToken(user.id, sid);
        const refreshToken = this.signRefreshToken(user.id, sid);
        const refreshTokenHash = (0, session_hash_1.sha256Hex)(refreshToken);
        await this.sessionsRepository.create({
            id: sid,
            userId: user.id,
            deviceUuid,
            refreshTokenHash,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            ttlSeconds: this.authConfig.sessionRefreshTtlSeconds,
        });
        return { access_token: accessToken, refresh_token: refreshToken, permissions };
    }
    async refresh(refreshToken, meta = { ip: null, userAgent: null }) {
        let payload;
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: this.authConfig.jwtRefreshSecret,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
        if (payload.typ !== 'refresh') {
            throw new common_1.UnauthorizedException('Token is not a refresh token');
        }
        if (!payload.sid) {
            throw sessionError(session_errors_1.SESSION_REQUIRED, 'Refresh token carries no session id');
        }
        const sid = payload.sid;
        let session = await this.sessionsRepository.findActiveById(sid);
        if (!session) {
            throw sessionError(session_errors_1.SESSION_REVOKED, 'Session is revoked, expired, or does not exist');
        }
        if (session.user_id !== payload.sub) {
            this.logger.error(`SESSION_USER_MISMATCH: sid=${sid} token.sub=${payload.sub} session.user_id=${session.user_id}`);
            throw sessionError(session_errors_1.SESSION_USER_MISMATCH, 'Session does not belong to this user');
        }
        const presentedHash = (0, session_hash_1.sha256Hex)(refreshToken);
        if ((0, session_hash_1.timingSafeEqualHex)(presentedHash, session.refresh_token_hash)) {
            const newAccessToken = this.signAccessToken(session.user_id, sid);
            const newRefreshToken = this.signRefreshToken(session.user_id, sid);
            const newHash = (0, session_hash_1.sha256Hex)(newRefreshToken);
            const predecessorHash = session.previous_refresh_token_hash;
            const rotated = await this.sessionsRepository.rotate({
                id: sid,
                newHash,
                expectedHash: presentedHash,
                ttlSeconds: this.authConfig.sessionRefreshTtlSeconds,
                ipAddress: meta.ip,
                userAgent: meta.userAgent,
            });
            if (rotated) {
                const pair = {
                    access_token: newAccessToken,
                    refresh_token: newRefreshToken,
                };
                await this.graceBuffer.set(sid, presentedHash, pair, this.authConfig.sessionRefreshGraceSeconds, predecessorHash);
                const permissions = await this.getPermissionsByUserId(session.user_id);
                return { ...pair, permissions };
            }
            const fresh = await this.sessionsRepository.findActiveById(sid);
            if (!fresh) {
                throw sessionError(session_errors_1.SESSION_REVOKED, 'Session is revoked, expired, or does not exist');
            }
            session = fresh;
        }
        if ((0, session_hash_1.timingSafeEqualHex)(presentedHash, session.previous_refresh_token_hash) &&
            (0, session_validity_1.isWithinRotationGrace)(session.rotated_at, new Date(), this.authConfig.sessionRefreshGraceSeconds)) {
            const buffered = await this.graceBuffer.get(sid, presentedHash);
            if (buffered) {
                const permissions = await this.getPermissionsByUserId(session.user_id);
                return { ...buffered, permissions };
            }
            throw sessionError(session_errors_1.SESSION_RETRY_UNAVAILABLE, 'Grace window is open but the buffered token pair is unavailable');
        }
        const revokedRow = await this.sessionsRepository.revoke(sid);
        const ttlSeconds = revokedRow?.expires_at
            ? Math.max(1, Math.ceil((revokedRow.expires_at.getTime() - Date.now()) / 1000))
            : this.authConfig.sessionRefreshTtlSeconds;
        await this.revocationCache.revoke(sid, ttlSeconds);
        this.logger.warn(`SESSION_REUSE_DETECTED: sid=${sid} user_id=${session.user_id}`);
        throw sessionError(session_errors_1.SESSION_REUSE_DETECTED, 'Refresh token reuse detected — session revoked');
    }
    async revokeSession(sessionId) {
        const revoked = await this.sessionsRepository.revoke(sessionId);
        if (!revoked) {
            return;
        }
        const ttlSeconds = revoked.expires_at
            ? Math.max(1, Math.ceil((revoked.expires_at.getTime() - Date.now()) / 1000))
            : this.authConfig.sessionRefreshTtlSeconds;
        await this.revocationCache.revoke(sessionId, ttlSeconds);
    }
    async revokeAllForUser(userId) {
        const rows = await this.sessionsRepository.revokeAllForUser(userId);
        await Promise.all(rows.map((row) => {
            const ttlSeconds = row.expires_at
                ? Math.max(1, Math.ceil((row.expires_at.getTime() - Date.now()) / 1000))
                : this.authConfig.sessionRefreshTtlSeconds;
            return this.revocationCache.revoke(row.id, ttlSeconds);
        }));
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw invalidCredentialsError();
        }
        const matches = await this.passwordHasher.verify(currentPassword, user.passwordHash ?? password_hasher_1.DUMMY_HASH);
        if (!matches) {
            throw invalidCredentialsError();
        }
        const newHash = await this.passwordHasher.hash(newPassword);
        await this.userRepo.update(userId, { passwordHash: newHash });
        await this.revokeAllForUser(userId);
    }
    validateToken(token) {
        try {
            return this.jwtService.verify(token, {
                secret: this.authConfig.jwtAccessSecret,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired access token');
        }
    }
    async getMe(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const ctx = await this.getAuthContextByUserId(user.id);
        const permissionStrings = this.permissionLookup
            ? await this.permissionLookup.getDescriptionsByUuids(ctx.permissions)
            : ctx.permissions;
        return {
            deviceUuid: user.deviceUuid,
            permissions: permissionStrings,
            email_verified: user.emailVerifiedAt !== null,
            role_name: ctx.roleName,
        };
    }
    async getPermissions(deviceUuid) {
        if (deviceUuid === null) {
            return [];
        }
        const { permissionCacheTtlSeconds } = this.authConfig;
        const key = `${exports.PERMISSION_CACHE_PREFIX}${deviceUuid}`;
        const cached = await this.cache.get(key);
        if (cached) {
            return cached;
        }
        const user = await this.userRepo.findOne({ where: { deviceUuid } });
        if (!user) {
            return [];
        }
        const permissions = user.permissions ?? [];
        await this.cache.set(key, permissions, permissionCacheTtlSeconds * 1000);
        return permissions;
    }
    async getPermissionsByUserId(userId) {
        return (await this.getAuthContextByUserId(userId)).permissions;
    }
    async getPermissionNames(uuids) {
        if (!this.permissionLookup) {
            return [];
        }
        return this.permissionLookup.getNamesByUuids(uuids);
    }
    async getAuthContextByUserId(userId) {
        const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } = this.authConfig;
        const key = `${exports.PERMISSION_CACHE_PREFIX}uid:${userId}`;
        const cached = await this.cache.get(key);
        if (cached) {
            return {
                userId,
                permissions: cached.permissions,
                organizationId: cached.organizationId,
                roleName: cached.roleName,
                scope: (0, resolve_subject_scope_1.resolveSubjectScope)(cached.roleName, cached.organizationId, userId),
                sessionId: null,
                isAnonymous: cached.isAnonymous,
            };
        }
        const rows = await this.dataSource.query(`SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name,
              r.deleted_at AS role_deleted_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`, [userId]);
        const row = rows[0];
        if (!row) {
            return {
                userId,
                permissions: [],
                organizationId: null,
                roleName: null,
                scope: (0, resolve_subject_scope_1.resolveSubjectScope)(null, null, userId),
                sessionId: null,
                isAnonymous: false,
            };
        }
        const isAnonymous = row.device_uuid === anonymousDeviceUuid;
        const roleDeleted = row.role_deleted_at != null;
        const permissions = isAnonymous
            ? anonymousPermissions
            : roleDeleted
                ? []
                : (row.permissions ?? []);
        const organizationId = isAnonymous ? null : row.organization_id;
        const roleName = isAnonymous || roleDeleted ? null : row.role_name;
        await this.cache.set(key, { permissions, organizationId, roleName, isAnonymous }, permissionCacheTtlSeconds * 1000);
        return {
            userId,
            permissions,
            organizationId,
            roleName,
            scope: (0, resolve_subject_scope_1.resolveSubjectScope)(roleName, organizationId, userId),
            sessionId: null,
            isAnonymous,
        };
    }
    async invalidatePermissionCache(userId, deviceUuid) {
        const deletes = [this.cache.del(`${exports.PERMISSION_CACHE_PREFIX}uid:${userId}`)];
        if (deviceUuid !== null) {
            deletes.push(this.cache.del(`${exports.PERMISSION_CACHE_PREFIX}${deviceUuid}`));
        }
        await Promise.all(deletes);
    }
    signAccessToken(userId, sid) {
        const payload = {
            sub: userId,
            typ: 'access',
            jti: (0, crypto_1.randomUUID)(),
            pv: 1,
            ...(sid ? { sid } : {}),
        };
        return this.jwtService.sign(payload, {
            secret: this.authConfig.jwtAccessSecret,
            expiresIn: this.authConfig.jwtAccessExpiresIn,
        });
    }
    signRefreshToken(userId, sid) {
        const payload = {
            sub: userId,
            typ: 'refresh',
            jti: (0, crypto_1.randomUUID)(),
            pv: 1,
            ...(sid ? { sid } : {}),
        };
        return this.jwtService.sign(payload, {
            secret: this.authConfig.jwtRefreshSecret,
            expiresIn: this.authConfig.jwtRefreshExpiresIn,
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __param(4, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService, Object, config_1.ConfigService,
        typeorm_2.DataSource,
        sessions_repository_1.SessionsRepository,
        revocation_cache_1.RevocationCache,
        grace_buffer_1.GraceBuffer,
        permission_lookup_service_1.PermissionLookupService,
        password_hasher_1.PasswordHasher])
], AuthService);
//# sourceMappingURL=auth.service.js.map