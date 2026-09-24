"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const core_module_1 = require("./core/core.module");
const app_controller_1 = require("./app.controller");
const auth_module_1 = require("./modules/auth/auth.module");
const geofencing_module_1 = require("./modules/geofencing/geofencing.module");
const audit_module_1 = require("./modules/audit/audit.module");
const incidents_module_1 = require("./modules/incidents/incidents.module");
const comments_module_1 = require("./modules/comments/comments.module");
const users_module_1 = require("./modules/users/users.module");
const assignments_module_1 = require("./modules/assignments/assignments.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
const roles_module_1 = require("./modules/roles/roles.module");
const permissions_module_1 = require("./modules/permissions/permissions.module");
const menus_module_1 = require("./modules/menus/menus.module");
const mail_module_1 = require("./modules/mail/mail.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const incident_categories_module_1 = require("./modules/incident-categories/incident-categories.module");
const map_module_1 = require("./modules/map/map.module");
const geo_zones_module_1 = require("./modules/geo-zones/geo-zones.module");
const status_history_module_1 = require("./modules/status-history/status-history.module");
const organizations_module_1 = require("./modules/organizations/organizations.module");
const sessions_module_1 = require("./modules/sessions/sessions.module");
const invitations_module_1 = require("./modules/invitations/invitations.module");
const operators_module_1 = require("./modules/operators/operators.module");
const incident_social_module_1 = require("./modules/incident-social/incident-social.module");
const departments_module_1 = require("./modules/departments/departments.module");
const rate_limiter_guard_1 = require("./common/guards/rate-limiter.guard");
const all_exceptions_filter_1 = require("./common/observability/all-exceptions.filter");
const request_id_middleware_1 = require("./common/observability/request-id.middleware");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(request_id_middleware_1.RequestIdMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            core_module_1.CoreModule,
            auth_module_1.AuthModule,
            geofencing_module_1.GeofencingModule,
            audit_module_1.AuditModule,
            organizations_module_1.OrganizationsModule,
            incidents_module_1.IncidentsModule,
            comments_module_1.CommentsModule,
            users_module_1.UsersModule,
            assignments_module_1.AssignmentsModule,
            realtime_module_1.RealtimeModule,
            roles_module_1.RolesModule,
            permissions_module_1.PermissionsModule,
            menus_module_1.MenusModule,
            mail_module_1.MailModule,
            notifications_module_1.NotificationsModule,
            incident_categories_module_1.IncidentCategoriesModule,
            map_module_1.MapModule,
            geo_zones_module_1.GeoZonesModule,
            status_history_module_1.StatusHistoryModule,
            sessions_module_1.SessionsModule,
            invitations_module_1.InvitationsModule,
            operators_module_1.OperatorsModule,
            incident_social_module_1.IncidentSocialModule,
            departments_module_1.DepartmentsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: rate_limiter_guard_1.RateLimiterGuard,
            },
            {
                provide: core_1.APP_FILTER,
                useClass: all_exceptions_filter_1.AllExceptionsFilter,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map