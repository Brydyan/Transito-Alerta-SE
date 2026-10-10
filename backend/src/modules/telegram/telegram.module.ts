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

/**
 * TelegramModule (F7 emergency-dispatch, design D5) — calcado de
 * `MailModule`: no controller, no HTTP surface. The only Nest-facing
 * entry is `TelegramService.enqueue` (XADD onto `telegram:outbox`).
 * The consumer takes it from there.
 *
 * `TypeOrmModule.forFeature` is the only DB surface needed: the
 * critical-incident listener queries `users` for admin_org recipients,
 * the reminder scheduler reads/writes `incidents.reminder_count` and
 * `incidents.last_reminded_at`, and the assignment listener reads
 * the freshly-saved assignment row (joined with `incidents`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, IncidentEntity, AssignmentEntity])],
  providers: [
    TelegramService,
    TelegramOutboxConsumer,
    CriticalIncidentListener,
    IncidentAssignedListener,
    TelegramReminderScheduler,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
