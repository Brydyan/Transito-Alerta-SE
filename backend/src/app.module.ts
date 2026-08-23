import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CoreModule } from './core/core.module';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { GeofencingModule } from './modules/geofencing/geofencing.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { CommentsModule } from './modules/comments/comments.module';
import { UsersModule } from './modules/users/users.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { MenusModule } from './modules/menus/menus.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IncidentCategoriesModule } from './modules/incident-categories/incident-categories.module';
import { MapModule } from './modules/map/map.module';
import { GeoZonesModule } from './modules/geo-zones/geo-zones.module';
import { StatusHistoryModule } from './modules/status-history/status-history.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { RateLimiterGuard } from './common/guards/rate-limiter.guard';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    GeofencingModule,
    OrganizationsModule,
    IncidentsModule,
    CommentsModule,
    UsersModule,
    AssignmentsModule,
    RealtimeModule,
    RolesModule,
    PermissionsModule,
    MenusModule,
    MailModule,
    NotificationsModule,
    IncidentCategoriesModule,
    MapModule,
    GeoZonesModule,
    StatusHistoryModule,
    SessionsModule,
    InvitationsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimiterGuard,
    },
  ],
})
export class AppModule {}
