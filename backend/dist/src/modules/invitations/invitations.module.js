"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const role_entity_1 = require("../../entities/role.entity");
const auth_module_1 = require("../auth/auth.module");
const password_hasher_1 = require("../auth/password-hasher");
const mail_module_1 = require("../mail/mail.module");
const invitations_controller_1 = require("./invitations.controller");
const invitations_repository_1 = require("./invitations.repository");
const invitations_service_1 = require("./invitations.service");
let InvitationsModule = class InvitationsModule {
};
exports.InvitationsModule = InvitationsModule;
exports.InvitationsModule = InvitationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([role_entity_1.RoleEntity, organization_entity_1.OrganizationEntity]),
            mail_module_1.MailModule,
            (0, common_1.forwardRef)(() => auth_module_1.AuthModule),
        ],
        controllers: [invitations_controller_1.InvitationsController],
        providers: [invitations_repository_1.InvitationsRepository, invitations_service_1.InvitationsService, password_hasher_1.PasswordHasher],
        exports: [invitations_service_1.InvitationsService],
    })
], InvitationsModule);
//# sourceMappingURL=invitations.module.js.map