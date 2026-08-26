import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { InvitationsModule } from '../invitations/invitations.module';
import { MailModule } from '../mail/mail.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordHasher } from './password-hasher';
import { PasswordResetRepository } from './password-reset.repository';
import { PasswordResetService } from './password-reset.service';

/**
 * AuthModule (R1, D1/D2/D3; T3.9 design §8; T3.6 design §5.12) —
 * device-UUID identity + email/password identity, dual JWT, permission
 * resolution, session lifecycle, password reset. Guards used by all other
 * modules (design "Module Dependency DAG": `AuthModule <- guards used by
 * all`).
 *
 * Imports `SessionsModule` (T3.9) for `SessionsRepository` +
 * `RevocationCache` + `GraceBuffer` — NEVER `UsersModule` (that edge
 * already exists in the other direction, `Users -> Auth`, so it would be a
 * hard cycle). `SessionsModule` is a leaf with zero feature-module
 * imports, so this edge can never cycle back.
 *
 * Imports `InvitationsModule` (T3.6) for `AuthController.acceptInvitation`
 * — `InvitationsModule` does NOT import `AuthModule` back (see
 * `InvitationsService.redeem`'s doc comment), so this is a one-way edge.
 * Imports `MailModule` for `PasswordResetService` (which lives here, not
 * its own module — its only consumer is `AuthController`).
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
    forwardRef(() => InvitationsModule),
    MailModule,
  ],
  controllers: [AuthController, EmailVerificationController],
  providers: [AuthService, JwtStrategy, PasswordHasher, PasswordResetRepository, PasswordResetService, EmailVerificationService],
  // JwtModule is exported so the globally-registered RateLimiterGuard can
  // verify access tokens and key limits per authenticated user.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
