import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { IncidentNotificationsListener } from './listeners/incident-notifications.listener';
import { UsersModule } from '../users/users.module';
import { IncidentEntity } from '../../entities/incident.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, IncidentEntity]), UsersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, IncidentNotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
