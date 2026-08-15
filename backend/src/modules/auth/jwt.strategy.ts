import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from '../../config/auth.config';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * JwtStrategy — extracts+verifies the access token from the
 * Authorization: Bearer header and attaches { sub, permissions } to
 * request.user for downstream guards (PermissionGuard).
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

  async validate(payload: JwtPayload) {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token is not an access token');
    }
    const permissions = await this.authService.getPermissions(payload.sub);
    return { userId: payload.sub, permissions };
  }
}
