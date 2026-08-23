import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { IncidentNotificationsListener } from './listeners/incident-notifications.listener';
import { UsersModule } from '../users/users.module';
import { IncidentEntity } from '../../entities/incident.entity';
import { CommentEntity } from '../../entities/comment.entity';
import { IncidentApprovalService } from './incident-approval.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, IncidentEntity, CommentEntity]),
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, IncidentNotificationsListener, IncidentApprovalService],
  exports: [NotificationsService, IncidentApprovalService],
})
export class NotificationsModule {}
