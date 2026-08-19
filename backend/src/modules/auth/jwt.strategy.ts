import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../common/authz/subject-scope';
import { RevocationCache } from '../sessions/revocation-cache';
import { SESSION_REQUIRED, SESSION_REVOKED } from '../sessions/session-errors';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * JwtStrategy — extracts+verifies the access token from the
 * Authorization: Bearer header and attaches the full `AuthContext`
 * (permissions + organizationId + roleName + scope, T3.2 design;
 * sessionId + isAnonymous, T3.9 design §3) to `request.user` for
 * downstream guards (PermissionGuard) and every scope-aware
 * controller/service.
 *
 * T3.9 design §3 — per-request revocation check lives HERE, not a guard or
 * middleware: this is the single funnel for every Bearer-authenticated
 * request and already holds the decoded payload. Ordering matters:
 * `getAuthContextByUserId` runs FIRST because `isAnonymous` is derived
 * server-side from `device_uuid` and is only known after that call —
 * anonymous identities skip the `sid`/denylist check entirely (D8).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
    private readonly revocationCache: RevocationCache,
  ) {
    const authConfig = configService.get<AuthConfig>('auth')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtAccessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthContext> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token is not an access token');
    }
    // `sub` is user.id — resolve by id, not by device_uuid.
    const ctx = await this.authService.getAuthContextByUserId(payload.sub);

    if (ctx.isAnonymous) {
      return ctx;
    }

    if (!payload.sid) {
      // D7 — a token minted before 0016 has no sid; distinguishable 401 so
      // the client can branch on it and re-login with the stored device_uuid.
      throw new UnauthorizedException({
        code: SESSION_REQUIRED,
        message: 'Access token carries no session id',
      });
    }

    const isRevoked = await this.revocationCache.isRevoked(payload.sid);
    if (isRevoked) {
      throw new UnauthorizedException({
        code: SESSION_REVOKED,
        message: 'Session has been revoked',
      });
    }

    return { ...ctx, sessionId: payload.sid };
  }
}
