import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../users/entities/user.entity';
import { IncidentMailListener } from './incident-mail.listener';
import { MailOutboxConsumer } from './mail-outbox.consumer';
import { MailService } from './mail.service';

/**
 * MailModule (T3.5, design D8) — no controller, no HTTP surface (Mail is a
 * transport, not a domain). `CoreModule` is global so `MAIL_BLOCKING_CLIENT`
 * / `MAIL_EVENTS_BLOCKING_CLIENT` / `REDIS_CLIENT` are already available;
 * `TypeOrmModule.forFeature([UserEntity])` is the only import this module
 * needs for `IncidentMailListener`'s recipient resolution. Zero import
 * edges to Incidents/Comments (D7/D8) — this module only reads the
 * `incidents:events` stream those modules publish to, plus the in-process
 * bus for `comment.added`.
 *
 * 2026-10-20 — `comment.added` arrives via `@OnEvent`, not the stream:
 * `CommentsService` never published to `incidents:events`, so the mail
 * handler that claimed to read it had never run. `EventEmitterModule` needs
 * no import here — `CoreModule` installs `forRoot()` globally, the same
 * way the Telegram and Notifications listeners already rely on.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [MailService, MailOutboxConsumer, IncidentMailListener],
  exports: [MailService],
})
export class MailModule {}
