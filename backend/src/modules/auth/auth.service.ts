import { randomUUID } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../common/authz/subject-scope';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
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
import { ANONYMOUS_IDENTITY_CLOSED, INVALID_CREDENTIALS } from './auth-errors';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { DUMMY_HASH, PasswordHasher } from './password-hasher';
import { AuthUserRepository } from './auth-user.repository';
import { AuthContextService } from './auth-context.service';

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
    private readonly authUserRepo: AuthUserRepository,
    private readonly jwtService: JwtService,
    // sc-413 (Slice B) — permission resolution + the Redis `perm:v3:` cache
    // ahora viven en AuthContextService. Ocupa la posición donde estaba
    // `cache`, así la aridad y las posiciones 4-9 del constructor no cambian.
    private readonly authContext: AuthContextService,
    private readonly configService: ConfigService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly revocationCache: RevocationCache,
    private readonly graceBuffer: GraceBuffer,
    // F5 fix — traduce UUIDs a "ACTION resource" para el wire de /auth/me.
    // Requerido (sc-415, Slice C): `PermissionLookupService` es
    // `providedIn: 'root'`, así que Nest siempre lo inyecta; los specs lo
    // pasan explícitamente.
    private readonly permissionLookup: PermissionLookupService,
    // T3.6 — requerido (sc-415, Slice C). El spec construye AuthService con
    // un mock; en producción Nest inyecta la instancia real.
    private readonly passwordHasher: PasswordHasher,
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

    // ANON (sc-326) — la identidad anónima ya no puede
    // autenticarse. El rechazo es ANTES de tocar la BD, la
    // sesión o el cache: la identidad anónima no entra al
    // sistema bajo ninguna circunstancia. La forma de
    // credencial `{device_uuid}` sigue siendo válida
    // (122 tests e2e la usan), sólo se cierra la rama
    // específica del device_uuid configurado como anónimo.
    // El motivo se distingue del error genérico de
    // credenciales para que un cliente antiguo pueda
    // mostrar algo accionable al ciudadano.
    if (deviceUuid === this.authConfig.anonymousDeviceUuid) {
      throw new UnauthorizedException({
        code: ANONYMOUS_IDENTITY_CLOSED,
        message:
          'El reporte anónimo sin sesión ya no está disponible. Registrate primero para reportar.',
      });
    }

    let user = await this.authUserRepo.findByDeviceUuid(deviceUuid);
    if (!user) {
      user = await this.authUserRepo.createDeviceIdentity(deviceUuid);
    }

    const permissions = await this.getPermissions(deviceUuid);
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
    const user = await this.authUserRepo.findByEmail(input.email);
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await this.passwordHasher.verify(input.password, hashToCompare);

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
    const user = await this.authUserRepo.findById(userId);
    if (!user) {
      throw invalidCredentialsError();
    }

    const matches = await this.passwordHasher.verify(currentPassword, user.passwordHash ?? DUMMY_HASH);
    if (!matches) {
      throw invalidCredentialsError();
    }

    const newHash = await this.passwordHasher.hash(newPassword);
    await this.authUserRepo.updatePasswordHash(userId, newHash);
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
  async getMe(userId: string): Promise<{
    deviceUuid: string | null;
    permissions: string[];
    /** REG (sc-325) C.1 — booleano derivado de `email_verified_at`.
     *  `null` cuando la fila no existe (caso que el controller
     *  ya controla arriba). El frontend usa esto para decidir
     *  si muestra el interruptor "verificar mi correo" o el
     *  composer del OTP (C.3). */
    email_verified: boolean;
    /** REG (sc-325) Fix A (ronda 10) — `role_name` resuelto por
     *  `getAuthContextByUserId` (que ya hace el JOIN con `roles`).
     *  El frontend usa esto en C.4 para decidir si redirige al
     *  composer del OTP tras el login: la regla es
     *  `roleName === 'reporter' && emailVerified === false`. */
    role_name: string | null;
  }> {
    const user = await this.authUserRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const ctx = await this.getAuthContextByUserId(user.id);
    // F6 fix: Convert UUID permissions to "ACTION resource" strings so frontend
    // permissionGuard can validate with includes() directly.
    const permissionStrings = await this.permissionLookup.getDescriptionsByUuids(
      ctx.permissions,
    );
    return {
      deviceUuid: user.deviceUuid,
      permissions: permissionStrings,
      email_verified: user.emailVerifiedAt !== null,
      role_name: ctx.roleName,
    };
  }

  /**
   * Device-keyed permission resolution lives in {@link AuthContextService}
   * (sc-413, Slice B). Kept as a public façade method so existing callers
   * are unaffected.
   */
  getPermissions(deviceUuid: string | null): Promise<string[]> {
    return this.authContext.getPermissions(deviceUuid);
  }

  /** Uid-keyed permission resolution — delegates to {@link AuthContextService}. */
  getPermissionsByUserId(userId: string): Promise<string[]> {
    return this.authContext.getPermissionsByUserId(userId);
  }

  /** Full per-request {@link AuthContext} — delegates to {@link AuthContextService}. */
  getAuthContextByUserId(userId: string): Promise<AuthContext> {
    return this.authContext.getAuthContextByUserId(userId);
  }

  /**
   * Purges both cached permission keys (device-keyed and uid-keyed) after a
   * role/org change — delegates to {@link AuthContextService}.
   */
  invalidatePermissionCache(userId: string, deviceUuid: string | null): Promise<void> {
    return this.authContext.invalidatePermissionCache(userId, deviceUuid);
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

/**
 * REG (sc-325) — D1 del design: el alta pública es el único
 * camino que NO va por invitación. Devuelve SIEMPRE el mismo
 * body para correos nuevos y existentes (D3 del design — sin
 * oráculo de existencia), y fija el rol `reporter` en el
 * servidor. El DTO no acepta campos de rol; si el cliente los
 * manda, se ignoran (class-validator con `whitelist: true` +
 * `forbidNonWhitelisted` los rechazaría antes de llegar acá,
 * pero la defense-in-depth sigue aplicando: el método
 * resuelve el rol por nombre, no por lo que diga el DTO).
 *
 * `RequestMeta` se usa para audit; no es relevante para la
 * decisión de éxito/error (D3: indistinguible).
 *
 * El bloque de tipos `RegisterInput`/`RegisterResult`/`RegisterDeps`
 * que estaba aquí fue el scaffold de un primer intento de meter el
 * alta dentro de `AuthService`. Fue reemplazado por
 * `AuthRegisterService` en `auth.register.ts` (REG, sc-325). El
 * controller importa las clases desde el service nuevo; nada en
 * el código vivo depende de estas declaraciones. Se eliminaron
 * en la ronda 2 del fix (W2 del verify) porque el lint las marcaba
 * como `no-unused-vars`.
 */
