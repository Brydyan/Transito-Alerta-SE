import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../shared/authz/subject-scope';
import { RevocationCache } from '../sessions/revocation-cache';
import { SESSION_REQUIRED, SESSION_REVOKED } from '../sessions/session-errors';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Decode-only del header JWS (no verification). Usado por
 * `secretOrKeyProvider` para extraer el `kid` antes de validar la
 * firma. NO usamos el `decode` de `jsonwebtoken` con `complete: true`
 * porque ese verifica la firma — solo necesitamos el header en claro.
 *
 * P14 (MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md) — para soportar
 * rotación de keys sin downtime.
 */
function decodeHeader(rawToken: string): { kid?: string; alg?: string } {
  const firstDot = rawToken.indexOf('.');
  if (firstDot <= 0) {
    throw new Error('malformed token');
  }
  const headerB64 = rawToken.slice(0, firstDot);
  const json = Buffer.from(headerB64, 'base64url').toString('utf8');
  return JSON.parse(json);
}

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
 *
 * P14 (MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md) — JWT key
 * rotation: cuando `authConfig.jwtAccessKid` está set, los tokens
 * nuevos llevan el kid en el header JWS y la estrategia valida por
 * kid. Si no, back-compat: un solo secret, tokens sin kid header
 * (byte-equivalente al comportamiento previo).
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
      // `secretOrKeyProvider` se llama UNA VEZ por request, recibe
      // el token crudo y retorna el secret a usar. Esto permite
      // multi-key rotation sin reiniciar el proceso. Si el token
      // trae `kid` en el header, lo usamos para resolver; si no
      // (back-compat: tokens pre-rotación), usamos el secret legacy.
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | false) => void,
      ) => {
        try {
          // Decode SIN verificar (sólo header). passport-jwt
          // todavía no validó la firma; lo hacemos manualmente con
          // el secret elegido.
          const decoded = decodeHeader(rawJwtToken);
          const kid = decoded.kid;
          // Sin kid = tokens legacy (firma con JWT_ACCESS_SECRET).
          // Con kid que coincide al actual = tokens actuales.
          // Cualquier otro kid = token firmado con una key que ya
          // no rotamos; passport-jwt rechaza con 401.
          if (kid === undefined || kid === null || kid === '') {
            return done(null, authConfig.jwtAccessSecret);
          }
          if (kid === authConfig.jwtAccessKid) {
            return done(null, authConfig.jwtAccessSecret);
          }
          // kid distinto al actual. En esta primera versión NO
          // mantenemos un mapa multi-kid (eso entra en una fase
          // posterior de rotación real). Por ahora, rechazar
          // explícitamente para que cualquier token "huérfano"
          // (kid desconocido) no se acepte con el secret por
          // default — fail-closed.
          return done(new Error(`unknown kid: ${kid}`));
        } catch (err) {
          return done(err as Error);
        }
      },
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
