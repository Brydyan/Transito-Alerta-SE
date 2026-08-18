import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * AuthModule (R1, D1/D2/D3; T3.9 design §8) — device-UUID identity, dual
 * JWT, permission resolution, session lifecycle. Guards used by all other
 * modules (design "Module Dependency DAG": `AuthModule <- guards used by
 * all`).
 *
 * Imports `SessionsModule` (T3.9) for `SessionsRepository` +
 * `RevocationCache` + `GraceBuffer` — NEVER `UsersModule` (that edge
 * already exists in the other direction, `Users -> Auth`, so it would be a
 * hard cycle). `SessionsModule` is a leaf with zero feature-module
 * imports, so this edge can never cycle back.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const authConfig = config.get<AuthConfig>('auth')!;
        return {
          secret: authConfig.jwtAccessSecret,
          signOptions: { expiresIn: authConfig.jwtAccessExpiresIn },
        };
      },
    }),
    SessionsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule is exported so the globally-registered RateLimiterGuard can
  // verify access tokens and key limits per authenticated user.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
