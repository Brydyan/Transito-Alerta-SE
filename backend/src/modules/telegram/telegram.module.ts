import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { UserEntity } from '../users/entities/user.entity';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { TelegramOutboxConsumer } from './telegram-outbox.consumer';
import { TelegramService } from './telegram.service';
import { CriticalIncidentListener } from './listeners/critical-incident.listener';
import { IncidentAssignedListener } from './listeners/incident-assigned.listener';
import { TelegramReminderScheduler } from './telegram-reminder.scheduler';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramBotController } from './telegram-bot.controller';

/**
 * TelegramModule (F7 emergency-dispatch, design D5) — calcado de
 * `MailModule`: no controller for the F7 outbox side, but a controller
 * for the 2026-10-10 onboarding webhook (`POST /api/telegram/webhook`).
 *
 * The webhook handler is the inbound path (Telegram → backend). The
 * outbox consumer is the outbound path (backend → Telegram). They
 * never block each other: the controller writes only to Postgres +
 * Redis + the outbox stream; the consumer does the HTTP POST.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, IncidentEntity, AssignmentEntity])],
  controllers: [TelegramBotController],
  providers: [
    TelegramService,
    TelegramLinkService,
    TelegramOutboxConsumer,
    CriticalIncidentListener,
    IncidentAssignedListener,
    TelegramReminderScheduler,
  ],
  exports: [TelegramService, TelegramLinkService],
})
export class TelegramModule {}
