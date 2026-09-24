"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuOptionRoleEntity = void 0;
const typeorm_1 = require("typeorm");
let MenuOptionRoleEntity = class MenuOptionRoleEntity {
};
exports.MenuOptionRoleEntity = MenuOptionRoleEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'menu_option_id', type: 'uuid' }),
    __metadata("design:type", String)
], MenuOptionRoleEntity.prototype, "menuOptionId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'role_id', type: 'uuid' }),
    __metadata("design:type", String)
], MenuOptionRoleEntity.prototype, "roleId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'can_read', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], MenuOptionRoleEntity.prototype, "canRead", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'can_write', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], MenuOptionRoleEntity.prototype, "canWrite", void 0);
exports.MenuOptionRoleEntity = MenuOptionRoleEntity = __decorate([
    (0, typeorm_1.Entity)('menu_option_roles')
], MenuOptionRoleEntity);
//# sourceMappingURL=menu-option-role.entity.js.map