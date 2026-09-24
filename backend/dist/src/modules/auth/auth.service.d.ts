import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { AuthContext } from '../../common/authz/subject-scope';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { GraceBuffer } from '../sessions/grace-buffer';
import { RevocationCache } from '../sessions/revocation-cache';
import { SessionsRepository } from '../sessions/sessions.repository';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordHasher } from './password-hasher';
export declare const PERMISSION_CACHE_PREFIX = "perm:v3:";
export interface RequestMeta {
    ip: string | null;
    userAgent: string | null;
}
export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    permissions: string[];
}
export interface PasswordCredentialInput {
    email: string;
    password: string;
    deviceUuid: string | null;
}
export declare class AuthService {
    private readonly userRepo;
    private readonly jwtService;
    private readonly cache;
    private readonly configService;
    private readonly dataSource;
    private readonly sessionsRepository;
    private readonly revocationCache;
    private readonly graceBuffer;
    private readonly permissionLookup?;
    private readonly passwordHasher?;
    private readonly logger;
    constructor(userRepo: Repository<UserEntity>, jwtService: JwtService, cache: Cache, configService: ConfigService, dataSource: DataSource, sessionsRepository: SessionsRepository, revocationCache: RevocationCache, graceBuffer: GraceBuffer, permissionLookup?: PermissionLookupService | undefined, passwordHasher?: PasswordHasher | undefined);
    private get authConfig();
    login(deviceUuid: string, meta?: RequestMeta): Promise<AuthTokens>;
    loginWithPassword(input: PasswordCredentialInput, meta?: RequestMeta): Promise<AuthTokens>;
    issueSessionForNewIdentity(userId: string, meta?: RequestMeta): Promise<AuthTokens>;
    private issueSession;
    refresh(refreshToken: string, meta?: RequestMeta): Promise<AuthTokens>;
    revokeSession(sessionId: string): Promise<void>;
    revokeAllForUser(userId: string): Promise<void>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
    validateToken(token: string): JwtPayload;
    getMe(userId: string): Promise<{
        deviceUuid: string | null;
        permissions: string[];
        email_verified: boolean;
        role_name: string | null;
    }>;
    getPermissions(deviceUuid: string | null): Promise<string[]>;
    getPermissionsByUserId(userId: string): Promise<string[]>;
    getPermissionNames(uuids: string[]): Promise<string[]>;
    getAuthContextByUserId(userId: string): Promise<AuthContext>;
    invalidatePermissionCache(userId: string, deviceUuid: string | null): Promise<void>;
    private signAccessToken;
    private signRefreshToken;
}
