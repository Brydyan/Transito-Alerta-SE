import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../common/authz/subject-scope';
import { resolveSubjectScope } from '../../common/authz/resolve-subject-scope';
import { sha256Hex, timingSafeEqualHex } from '../../common/crypto/session-hash';
import { BufferedTokenPair, GraceBuffer } from '../sessions/grace-buffer';
import { RevocationCache } from '../sessions/revocation-cache';
import { isWithinRotationGrace } from '../sessions/session-validity';
import {
  SESSION_REQUIRED,
  SESSION_RETRY_UNAVAILABLE,
  SESSION_REUSE_DETECTED,
  SESSION_REVOKED,
  SESSION_USER_MISMATCH,
  SessionErrorCode,
} from '../sessions/session-errors';
import { SessionsRepository } from '../sessions/sessions.repository';
import { INVALID_CREDENTIALS } from './auth-errors';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { DUMMY_HASH, PasswordHasher } from './password-hasher';

/**
 * T3.9 design §3 [R4]: reshaped to `perm:v3:` — `AuthContext` gains
 * `isAnonymous`, which is NOT derivable from the cached `{permissions,
 * organizationId, roleName}` triple (a real user may legitimately have
 * both null). A warm Redis under the old `perm:v2:` prefix would read
 * `cached.isAnonymous === undefined` (falsy) and 401 every anonymous
 * device for a full TTL — so `perm:v2:` keys are abandoned, not migrated,
 * exactly as `perm:` was abandoned for `perm:v2:` in T3.2.
 */
export const PERMISSION_CACHE_PREFIX = 'perm:v3:';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

interface CachedAuthContext {
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  isAnonymous: boolean;
}

interface AuthContextRow {
  permissions: string[] | null;
  organization_id: string | null;
  device_uuid: string;
  role_name: string | null;
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

function sessionError(code: SessionErrorCode, message: string): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}

function invalidCredentialsError(): UnauthorizedException {
  return new UnauthorizedException({ code: INVALID_CREDENTIALS, message: 'Invalid email or password' });
}

/**
 * AuthService — device-UUID identity + email/password identity (T3.6) +
 * dual JWT + Redis-cached permissions + session lifecycle (T3.9).
 * Implements D1 (identity spectrum), D2 (permissions in Redis, not JWT
 * claims), CC2 (dual anonymous/authenticated identity), and is the SOLE
 * writer of `user_sessions` via `SessionsRepository` (spec "Ownership of
 * Writes").
 *
 * T3.6 design D1: `login()` keeps its exact pre-existing signature and
 * behaviour — the device-UUID identity path is the regression gate for
 * this whole change, proven by `auth.service.spec.ts`'s `login` describe
 * block staying byte-for-byte unmodified. `loginWithPassword` is a sibling
 * entry point; both converge on the private `issueSession`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsRepository: SessionsRepository,
    private readonly revocationCache: RevocationCache,
    private readonly graceBuffer: GraceBuffer,
    // T3.6 — optional so the pre-existing `auth.service.spec.ts` regression
    // suite (which constructs AuthService with the original 8 positional
    // args) keeps compiling and passing unmodified; Nest's DI container
    // always supplies a real instance in production/e2e.
    private readonly passwordHasher?: PasswordHasher,
  ) {}

  private get authConfig(): AuthConfig {
    return this.configService.get<AuthConfig>('auth')!;
  }

  /**
   * T3.9 design "Architecture Overview" — anonymous logins mint tokens
   * without a `sid` and create no session row (D8, spec "Anonymous
   * Identities"). Non-anonymous logins mint `sid` BEFORE signing (both
   * tokens carry the same `sid`), hash the refresh token (D5), then write
   * the session row SYNCHRONOUSLY — a write failure fails the login (D2).
   *
   * UNCHANGED signature and behaviour (T3.6 design D1) — the tail was
   * lifted verbatim into the private `issueSession`, nothing else differs.
   */
  async login(deviceUuid: string, meta: RequestMeta = { ip: null, userAgent: null }): Promise<AuthTokens> {
    if (!deviceUuid || !deviceUuid.trim()) {
      throw new UnauthorizedException('device_uuid is required');
    }

    let user = await this.userRepo.findOne({ where: { deviceUuid } });
    if (!user) {
      user = this.userRepo.create({ deviceUuid, permissions: [], isActive: true });
      user = await this.userRepo.save(user);
    }

    const isAnonymous = deviceUuid === this.authConfig.anonymousDeviceUuid;
    const permissions = await this.getPermissions(deviceUuid);

    if (isAnonymous) {
      return {
        access_token: this.signAccessToken(user.id),
        refresh_token: this.signRefreshToken(user.id),
        permissions,
      };
    }

    return this.issueSession(user, deviceUuid, meta, permissions);
  }

  /**
   * T3.6 design D1/D9 — `{email,password}` login. `bcrypt.compare` is
   * ALWAYS invoked, even when the user does not exist or has no
   * `password_hash` (compared against the constant `DUMMY_HASH` instead) —
   * so an unknown-email 401 costs the same wall-clock as a wrong-password
   * one (no user enumeration via timing, spec "Password Identity").
   * `deviceUuid`, if supplied, is a session LABEL only (D7) — never
   * identity; this path is never anonymous.
   */
  async loginWithPassword(
    input: PasswordCredentialInput,
    meta: RequestMeta = { ip: null, userAgent: null },
  ): Promise<AuthTokens> {
    const user = await this.userRepo.findOne({ where: { email: input.email } });
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await this.passwordHasher!.verify(input.password, hashToCompare);

    if (!user || !passwordMatches || user.isActive === false) {
      throw invalidCredentialsError();
    }

    const permissions = await this.getPermissionsByUserId(user.id);
    return this.issueSession(user, input.deviceUuid, meta, permissions);
  }

  /**
   * T3.6 — invoked by `InvitationsService.redeem` AFTER its transaction
   * commits (design "Component Design": `issueSession` runs outside the
   * tx). Thin public wrapper around the private `issueSession` so
   * `InvitationsModule` never needs access to `AuthService` internals.
   * `deviceUuid` is always `null` — redemption CREATES a new identity, it
   * never adopts a device (design D12).
   */
  async issueSessionForNewIdentity(
    userId: string,
    meta: RequestMeta = { ip: null, userAgent: null },
  ): Promise<AuthTokens> {
    const permissions = await this.getPermissionsByUserId(userId);
    // issueSession only ever reads `user.id` — a full UserEntity is not
    // needed here (the caller just committed the INSERT inside its own
    // transaction and only has the raw row, not a hydrated entity).
    return this.issueSession({ id: userId } as UserEntity, null, meta, permissions);
  }

  /**
   * The `sid`/sign/hash/`SessionsRepository.create` block, lifted VERBATIM
   * out of the pre-T3.6 `login()` tail (T3.6 design D1, task 4.1). Never
   * called for an anonymous identity — callers branch on that BEFORE
   * reaching here, exactly as `login()` always did.
   */
  private async issueSession(
    user: UserEntity,
    deviceUuid: string | null,
    meta: RequestMeta,
    permissions: string[],
  ): Promise<AuthTokens> {
    const sid = randomUUID();
    const accessToken = this.signAccessToken(user.id, sid);
    const refreshToken = this.signRefreshToken(user.id, sid);
    const refreshTokenHash = sha256Hex(refreshToken);

    // Synchronous, throws = login fails (D2) — no more fire-and-forget
    // fan-out to UsersService.recordSession.
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

  /**
   * T3.9 design §1/§7/§9 — verify → require `typ==='refresh'` + `sid` →
   * load session → `user_id === sub` → compare hash → rotate (CAS) or
   * benign-retry (grace) or revoke. See design §1 for why the CAS
   * predicate is one statement, never read-then-write, and §7 [R3] for why
   * the grace path replays a Redis-buffered pair instead of re-deriving
   * the current tokens from a one-way hash.
   */
  async refresh(refreshToken: string, meta: RequestMeta = { ip: null, userAgent: null }): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.authConfig.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Token is not a refresh token');
    }

    if (!payload.sid) {
      // D7 — a token minted before 0016 (or an anonymous token) carries no
      // sid; distinguishable from every other 401 so the client can branch
      // on it and re-login.
      throw sessionError(SESSION_REQUIRED, 'Refresh token carries no session id');
    }
    const sid = payload.sid;

    let session = await this.sessionsRepository.findActiveById(sid);
    if (!session) {
      throw sessionError(SESSION_REVOKED, 'Session is revoked, expired, or does not exist');
    }

    if (session.user_id !== payload.sub) {
      // [R6] — reject, do NOT revoke: `sid` is readable by anyone who can
      // read a JWT payload, so revoke-on-mismatch would hand anyone who
      // observes another user's token a session-kill primitive.
      this.logger.error(
        `SESSION_USER_MISMATCH: sid=${sid} token.sub=${payload.sub} session.user_id=${session.user_id}`,
      );
      throw sessionError(SESSION_USER_MISMATCH, 'Session does not belong to this user');
    }

    const presentedHash = sha256Hex(refreshToken);

    if (timingSafeEqualHex(presentedHash, session.refresh_token_hash)) {
      const newAccessToken = this.signAccessToken(session.user_id, sid);
      const newRefreshToken = this.signRefreshToken(session.user_id, sid);
      const newHash = sha256Hex(newRefreshToken);
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
        const pair: BufferedTokenPair = {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
        };
        await this.graceBuffer.set(
          sid,
          presentedHash,
          pair,
          this.authConfig.sessionRefreshGraceSeconds,
          predecessorHash,
        );
        const permissions = await this.getPermissionsByUserId(session.user_id);
        return { ...pair, permissions };
      }

      // Lost the CAS (0 rows) — design §1: this PROVES a concurrent
      // request already committed the rotation. Re-read and fall through
      // to the grace check below, which now deterministically matches.
      const fresh = await this.sessionsRepository.findActiveById(sid);
      if (!fresh) {
        throw sessionError(SESSION_REVOKED, 'Session is revoked, expired, or does not exist');
      }
      session = fresh;
    }

    // Benign-retry (grace) check — the ONLY comparison is against
    // previous_refresh_token_hash (never a chain, spec "Reuse Detection").
    if (
      timingSafeEqualHex(presentedHash, session.previous_refresh_token_hash) &&
      isWithinRotationGrace(session.rotated_at, new Date(), this.authConfig.sessionRefreshGraceSeconds)
    ) {
      const buffered = await this.graceBuffer.get(sid, presentedHash);
      if (buffered) {
        const permissions = await this.getPermissionsByUserId(session.user_id);
        return { ...buffered, permissions };
      }
      // [R3] — reject, do NOT revoke: the DB says grace, but the buffer is
      // gone (TTL race, Redis restart). Not a security event.
      throw sessionError(
        SESSION_RETRY_UNAVAILABLE,
        'Grace window is open but the buffered token pair is unavailable',
      );
    }

    // Anything else: an older-than-previous hash, garbage, or a previous
    // hash presented after the grace window — revoke the whole chain (D4b).
    const revokedRow = await this.sessionsRepository.revoke(sid);
    const ttlSeconds = revokedRow?.expires_at
      ? Math.max(1, Math.ceil((revokedRow.expires_at.getTime() - Date.now()) / 1000))
      : this.authConfig.sessionRefreshTtlSeconds;
    await this.revocationCache.revoke(sid, ttlSeconds);
    this.logger.warn(`SESSION_REUSE_DETECTED: sid=${sid} user_id=${session.user_id}`);
    throw sessionError(SESSION_REUSE_DETECTED, 'Refresh token reuse detected — session revoked');
  }

  /**
   * Logout / `DELETE /sessions/:id` (task 4.7) — revokes the DB row (the
   * authority) and writes the denylist entry with the row's OWN remaining
   * refresh lifetime as TTL (spec "Revocation").
   */
  async revokeSession(sessionId: string): Promise<void> {
    const revoked = await this.sessionsRepository.revoke(sessionId);
    if (!revoked) {
      return;
    }
    const ttlSeconds = revoked.expires_at
      ? Math.max(1, Math.ceil((revoked.expires_at.getTime() - Date.now()) / 1000))
      : this.authConfig.sessionRefreshTtlSeconds;
    await this.revocationCache.revoke(sessionId, ttlSeconds);
  }

  /**
   * T3.6 design D5/D6 — bulk revoke every currently-active session for a
   * user, spares nobody (not even the caller's own session on
   * `PUT /auth/password`). `SessionsRepository.revokeAllForUser` is
   * DB-only (T3.9 §8 invariant — repository never touches Redis); this
   * method does the `RevocationCache.revoke` fan-out per row, TTL computed
   * exactly as `revokeSession` does. Invoked unconditionally by
   * `PasswordResetService.confirmReset` and `changePassword` immediately
   * after the `password_hash` write.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const rows = await this.sessionsRepository.revokeAllForUser(userId);
    await Promise.all(
      rows.map((row) => {
        const ttlSeconds = row.expires_at
          ? Math.max(1, Math.ceil((row.expires_at.getTime() - Date.now()) / 1000))
          : this.authConfig.sessionRefreshTtlSeconds;
        return this.revocationCache.revoke(row.id, ttlSeconds);
      }),
    );
  }

  /**
   * `PUT /auth/password` (T3.6, SELF-only, spec "Password Identity").
   * `401 INVALID_CREDENTIALS` if the CURRENT password does not match
   * (compared against `DUMMY_HASH` if the account somehow has no hash yet
   * — defensive, not a reachable state for an authenticated caller).
   * Success revokes every session including the caller's own (D5) — the
   * caller must re-login, which is why the UI must say "you will be signed
   * out everywhere".
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw invalidCredentialsError();
    }

    const matches = await this.passwordHasher!.verify(currentPassword, user.passwordHash ?? DUMMY_HASH);
    if (!matches) {
      throw invalidCredentialsError();
    }

    const newHash = await this.passwordHasher!.hash(newPassword);
    await this.userRepo.update(userId, { passwordHash: newHash });
    await this.revokeAllForUser(userId);
  }

  validateToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.authConfig.jwtAccessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * GET /api/auth/me support — resolves `device_uuid` + permissions for a
   * user id. T3.6 D8: return type widens to `device_uuid: string | null`
   * (password-only users have none) and permissions now resolve via
   * `getPermissionsByUserId` (uid-keyed cache) for EVERY user, never the
   * device-keyed `getPermissions(deviceUuid)` — a `null` deviceUuid would
   * otherwise collide every password-only user onto one `perm:v3:null`
   * cache key (the hazard named in the proposal).
   */
  async getMe(userId: string): Promise<{ deviceUuid: string | null; permissions: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const permissions = await this.getPermissionsByUserId(user.id);
    return { deviceUuid: user.deviceUuid, permissions };
  }

  /**
   * T3.6 D8 — `deviceUuid: null` returns `[]` immediately, no cache
   * read/write. Password-only users never resolve permissions through this
   * device-keyed method (see `getMe`/`loginWithPassword`, both of which use
   * `getPermissionsByUserId` instead) — this guard exists purely so a
   * caller that still has only a `null` device cannot accidentally read or
   * poison the shared `perm:v3:null` key.
   */
  async getPermissions(deviceUuid: string | null): Promise<string[]> {
    if (deviceUuid === null) {
      return [];
    }

    const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } =
      this.authConfig;

    if (deviceUuid === anonymousDeviceUuid) {
      return anonymousPermissions;
    }

    const key = `${PERMISSION_CACHE_PREFIX}${deviceUuid}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({ where: { deviceUuid } });
    if (!user) {
      // Do NOT cache a miss: pinning an unknown device to [] for the whole TTL
      // would keep a freshly-provisioned account 403ing until the entry expired.
      return [];
    }

    const permissions = user.permissions ?? [];
    await this.cache.set(key, permissions, permissionCacheTtlSeconds * 1000);
    return permissions;
  }

  /**
   * Resolves permissions from a user id (the JWT `sub` claim). Thin
   * wrapper (T3.2 design D6) — {@link getAuthContextByUserId} is now the
   * single source, so every existing caller of this method keeps working
   * unchanged.
   */
  async getPermissionsByUserId(userId: string): Promise<string[]> {
    return (await this.getAuthContextByUserId(userId)).permissions;
  }

  /**
   * Resolves the full per-request `AuthContext` (permissions +
   * organizationId + roleName + derived scope + isAnonymous) from a user
   * id in ONE query, cached under `perm:v3:uid:{userId}` (T3.2 design D6,
   * T3.9 design §3 [R4]).
   *
   * `sessionId` is ALWAYS returned `null` here — it is NOT derivable from
   * `userId` alone (a user can hold many sessions); `JwtStrategy.validate`
   * attaches the real value from the JWT's own `sid` claim after this call
   * returns (design §3).
   *
   * The anonymous branch CANNOT short-circuit before the query on the uid
   * path — `userId` alone does not reveal the device. `device_uuid` is
   * loaded, then checked: when it equals the configured anonymous device,
   * `permissions` is replaced by `anonymousPermissions` and org/role are
   * forced to `null`.
   */
  async getAuthContextByUserId(userId: string): Promise<AuthContext> {
    const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } =
      this.authConfig;

    const key = `${PERMISSION_CACHE_PREFIX}uid:${userId}`;
    const cached = await this.cache.get<CachedAuthContext>(key);
    if (cached) {
      return {
        userId,
        permissions: cached.permissions,
        organizationId: cached.organizationId,
        roleName: cached.roleName,
        scope: resolveSubjectScope(cached.roleName, cached.organizationId, userId),
        sessionId: null,
        isAnonymous: cached.isAnonymous,
      };
    }

    const rows: AuthContextRow[] = await this.dataSource.query(
      `SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1`,
      [userId],
    );
    const row = rows[0];

    if (!row) {
      // Do NOT cache a miss (same reasoning as getPermissions): pinning an
      // unknown user id to public/[] for the whole TTL would keep a
      // freshly-provisioned account 403ing until the entry expired.
      return {
        userId,
        permissions: [],
        organizationId: null,
        roleName: null,
        scope: resolveSubjectScope(null, null, userId),
        sessionId: null,
        isAnonymous: false,
      };
    }

    const isAnonymous = row.device_uuid === anonymousDeviceUuid;
    const permissions = isAnonymous ? anonymousPermissions : (row.permissions ?? []);
    const organizationId = isAnonymous ? null : row.organization_id;
    const roleName = isAnonymous ? null : row.role_name;

    await this.cache.set(
      key,
      { permissions, organizationId, roleName, isAnonymous },
      permissionCacheTtlSeconds * 1000,
    );

    return {
      userId,
      permissions,
      organizationId,
      roleName,
      scope: resolveSubjectScope(roleName, organizationId, userId),
      sessionId: null,
      isAnonymous,
    };
  }

  /**
   * Invalidates a user's cached permission blob under BOTH keying schemes
   * (design D2's `pv` bump). Called by RolesService.assignRole after a
   * role reassignment writes new permissions to the user row, so the very
   * next request rebuilds `perm:*` from the DB instead of serving the
   * stale cached set for up to `permissionCacheTtlSeconds` more.
   *
   * T3.6 D8: `deviceUuid: null` skips the device-keyed `cache.del` — there
   * is no `perm:v3:null` key to clean up, and issuing that delete would be
   * a harmless-but-pointless no-op every place this is now called for a
   * password-only user.
   */
  async invalidatePermissionCache(userId: string, deviceUuid: string | null): Promise<void> {
    const deletes = [this.cache.del(`${PERMISSION_CACHE_PREFIX}uid:${userId}`)];
    if (deviceUuid !== null) {
      deletes.push(this.cache.del(`${PERMISSION_CACHE_PREFIX}${deviceUuid}`));
    }
    await Promise.all(deletes);
  }

  private signAccessToken(userId: string, sid?: string): string {
    const payload: JwtPayload = {
      sub: userId,
      typ: 'access',
      jti: randomUUID(),
      pv: 1,
      ...(sid ? { sid } : {}),
    };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtAccessSecret,
      expiresIn: this.authConfig.jwtAccessExpiresIn,
    });
  }

  private signRefreshToken(userId: string, sid?: string): string {
    const payload: JwtPayload = {
      sub: userId,
      typ: 'refresh',
      jti: randomUUID(),
      pv: 1,
      ...(sid ? { sid } : {}),
    };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtRefreshSecret,
      expiresIn: this.authConfig.jwtRefreshExpiresIn,
    });
  }
}
