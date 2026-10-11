import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { AuthModule } from '../auth/auth.module';
import { PasswordHasher } from '../auth/password-hasher';
import { MailModule } from '../mail/mail.module';
import { TelegramModule } from '../telegram/telegram.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';

/**
 * InvitationsModule (T3.6 design §6.3, tasks-artifact corrections table).
 * Leaf-ish edge: does NOT import `AuthModule` — `AuthModule` already
 * imports THIS module (for `AuthController.acceptInvitation`), and
 * `InvitationsService.redeem` returns only the new user's id rather than
 * calling `AuthService.issueSessionForNewIdentity` itself (see that
 * method's doc comment), so there is no reverse edge to resolve. This
 * keeps `PasswordHasher` provided directly here too (config-only
 * dependency, `ConfigModule` is global — precedent: `SessionsModule`
 * providing its own leaf classes without importing anything for them)
 * rather than sharing `AuthModule`'s instance.
 *
 * 2026-10-10-user-onboarding-telegram-tour: also imports
 * `TelegramModule` so `InvitationsService` can mint a one-shot
 * Telegram link token at invitation time (R3). `TelegramModule`
 * is a regular import — there is no circular edge here, and the
 * `TelegramLinkService` is exported from it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, OrganizationEntity]),
    MailModule,
    TelegramModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsRepository, InvitationsService, PasswordHasher],
  exports: [InvitationsService],
})
export class InvitationsModule {}
