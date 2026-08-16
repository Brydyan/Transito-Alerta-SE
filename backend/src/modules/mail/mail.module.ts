import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../../entities/user.entity';
import { IncidentMailListener } from './incident-mail.listener';
import { MailOutboxConsumer } from './mail-outbox.consumer';
import { MailService } from './mail.service';

/**
 * MailModule (T3.5, design D8) — no controller, no HTTP surface (Mail is a
 * transport, not a domain). `CoreModule` is global so `MAIL_BLOCKING_CLIENT`
 * / `MAIL_EVENTS_BLOCKING_CLIENT` / `REDIS_CLIENT` are already available;
 * `TypeOrmModule.forFeature([UserEntity])` is the only import this module
 * needs for `IncidentMailListener`'s recipient resolution. Zero import
 * edges to Incidents/Comments (D7/D8) — this module only ever reads the
 * `incidents:events` stream those modules already publish to.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [MailService, MailOutboxConsumer, IncidentMailListener],
  exports: [MailService],
})
export class MailModule {}
