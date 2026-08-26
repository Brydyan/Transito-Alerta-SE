import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AuthModule } from '../auth/auth.module';
import { PasswordHasher } from '../auth/password-hasher';
import { MailModule } from '../mail/mail.module';
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
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, OrganizationEntity]),
    MailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsRepository, InvitationsService, PasswordHasher],
  exports: [InvitationsService],
})
export class InvitationsModule {}
