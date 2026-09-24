"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenusModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const core_1 = require("@nestjs/core");
const auth_module_1 = require("../auth/auth.module");
const menu_option_entity_1 = require("./entities/menu-option.entity");
const menu_option_role_entity_1 = require("./entities/menu-option-role.entity");
const api_endpoint_entity_1 = require("./entities/api-endpoint.entity");
const menu_option_endpoint_entity_1 = require("./entities/menu-option-endpoint.entity");
const user_entity_1 = require("../../entities/user.entity");
const role_entity_1 = require("../../entities/role.entity");
const menus_controller_1 = require("./menus.controller");
const menus_service_1 = require("./menus.service");
const menu_options_controller_1 = require("./menu-options.controller");
const menu_options_service_1 = require("./menu-options.service");
const endpoint_discovery_service_1 = require("./services/endpoint-discovery.service");
let MenusModule = class MenusModule {
};
exports.MenusModule = MenusModule;
exports.MenusModule = MenusModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            core_1.DiscoveryModule,
            typeorm_1.TypeOrmModule.forFeature([
                menu_option_entity_1.MenuOptionEntity,
                menu_option_role_entity_1.MenuOptionRoleEntity,
                api_endpoint_entity_1.ApiEndpointEntity,
                menu_option_endpoint_entity_1.MenuOptionEndpointEntity,
                user_entity_1.UserEntity,
                role_entity_1.RoleEntity,
            ]),
        ],
        controllers: [menus_controller_1.MenusController, menu_options_controller_1.MenuOptionsController],
        providers: [menus_service_1.MenusService, menu_options_service_1.MenuOptionsService, endpoint_discovery_service_1.EndpointDiscoveryService],
        exports: [menus_service_1.MenusService, menu_options_service_1.MenuOptionsService, endpoint_discovery_service_1.EndpointDiscoveryService],
    })
], MenusModule);
//# sourceMappingURL=menus.module.js.map