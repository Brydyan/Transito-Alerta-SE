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
exports.PermissionGuard = void 0;
exports.hasPermission = hasPermission;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const require_permission_decorator_1 = require("../decorators/require-permission.decorator");
const permission_lookup_service_1 = require("../permissions/permission-lookup.service");
async function hasPermission(userPermissions, action, resource, lookup) {
    const uuid = await lookup.getUuid(action, resource);
    return uuid !== null && userPermissions.includes(uuid);
}
let PermissionGuard = class PermissionGuard {
    constructor(reflector, lookup) {
        this.reflector = reflector;
        this.lookup = lookup;
    }
    async canActivate(context) {
        const required = this.reflector.get(require_permission_decorator_1.REQUIRE_PERMISSION_KEY, context.getHandler());
        if (!required) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const resource = required.resource ?? (0, require_permission_decorator_1.inferResourceFromPath)(request.path ?? '');
        const userPermissions = request.user?.permissions ?? [];
        const ok = await hasPermission(userPermissions, required.action, resource, this.lookup);
        if (!ok) {
            throw new common_1.ForbiddenException(`Missing permission: ${(0, require_permission_decorator_1.formatPermissionString)(required.action, resource)}`);
        }
        return true;
    }
};
exports.PermissionGuard = PermissionGuard;
exports.PermissionGuard = PermissionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        permission_lookup_service_1.PermissionLookupService])
], PermissionGuard);
//# sourceMappingURL=permission.guard.js.map