import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../common/authz/subject-scope';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * JwtStrategy — extracts+verifies the access token from the
 * Authorization: Bearer header and attaches the full `AuthContext`
 * (permissions + organizationId + roleName + scope, T3.2 design) to
 * `request.user` for downstream guards (PermissionGuard) and every
 * scope-aware controller/service.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
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
    return this.authService.getAuthContextByUserId(payload.sub);
  }
}
