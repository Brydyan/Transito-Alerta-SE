"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const notifications_service_1 = require("./notifications.service");
const notifications_controller_1 = require("./notifications.controller");
const notification_entity_1 = require("./entities/notification.entity");
const incident_notifications_listener_1 = require("./listeners/incident-notifications.listener");
const users_module_1 = require("../users/users.module");
const incident_entity_1 = require("../../entities/incident.entity");
const comment_entity_1 = require("../../entities/comment.entity");
const incident_approval_service_1 = require("./incident-approval.service");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([notification_entity_1.Notification, incident_entity_1.IncidentEntity, comment_entity_1.CommentEntity]),
            users_module_1.UsersModule,
        ],
        controllers: [notifications_controller_1.NotificationsController],
        providers: [notifications_service_1.NotificationsService, incident_notifications_listener_1.IncidentNotificationsListener, incident_approval_service_1.IncidentApprovalService],
        exports: [notifications_service_1.NotificationsService, incident_approval_service_1.IncidentApprovalService],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map