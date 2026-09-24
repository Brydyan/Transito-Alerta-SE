"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCanManage = assertCanManage;
exports.assertVisible = assertVisible;
exports.assertCanGrantRole = assertCanGrantRole;
const common_1 = require("@nestjs/common");
const role_rank_1 = require("./role-rank");
function assertCanManage(actor, target) {
    if (actor.roleName === null) {
        return;
    }
    assertVisible(actor, target);
    if (!((0, role_rank_1.rankOf)(actor.roleName) < (0, role_rank_1.rankOf)(target.roleName))) {
        throw new common_1.ForbiddenException({
            code: 'INSUFFICIENT_ROLE_RANK',
            message: 'Actor does not outrank the target user',
        });
    }
}
function assertVisible(actor, target) {
    if (!isVisibleUnderScope(actor, target)) {
        throw new common_1.NotFoundException('User not found');
    }
}
function assertCanGrantRole(actor, grantedRoleName) {
    if (actor.roleName === null) {
        return;
    }
    if (!((0, role_rank_1.rankOf)(actor.roleName) < (0, role_rank_1.rankOf)(grantedRoleName))) {
        throw new common_1.ForbiddenException({
            code: 'INSUFFICIENT_ROLE_RANK',
            message: 'Actor does not outrank the granted role',
        });
    }
}
function isVisibleUnderScope(actor, target) {
    switch (actor.scope.kind) {
        case 'global':
            return true;
        case 'org':
            return target.organizationId === actor.scope.organizationId;
        case 'org_assigned':
            return target.organizationId === actor.scope.organizationId;
        case 'public':
            return target.id === actor.userId;
        case 'deny':
            return false;
    }
}
//# sourceMappingURL=assert-can-manage.js.map