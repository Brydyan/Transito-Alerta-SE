import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { AuthContext } from '../../common/authz/subject-scope';
import { RevocationCache } from '../sessions/revocation-cache';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly authService;
    private readonly revocationCache;
    constructor(configService: ConfigService, authService: AuthService, revocationCache: RevocationCache);
    validate(payload: JwtPayload): Promise<AuthContext>;
}
export {};
