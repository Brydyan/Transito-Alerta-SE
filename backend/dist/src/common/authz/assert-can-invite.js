"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCanInvite = assertCanInvite;
const common_1 = require("@nestjs/common");
const assert_can_manage_1 = require("./assert-can-manage");
const invitation_errors_1 = require("../../modules/invitations/invitation-errors");
function assertCanInvite(actor, organizationId, invitedRoleName) {
    if (actor.roleName === null) {
        return;
    }
    switch (actor.scope.kind) {
        case 'global':
            break;
        case 'org':
        case 'org_assigned':
            if (organizationId !== actor.scope.organizationId) {
                throw outOfScope();
            }
            break;
        case 'public':
        case 'deny':
            throw outOfScope();
    }
    (0, assert_can_manage_1.assertCanGrantRole)(actor, invitedRoleName);
}
function outOfScope() {
    return new common_1.ForbiddenException({
        code: invitation_errors_1.OUT_OF_SCOPE_ORGANIZATION,
        message: 'Target organization is outside the actor scope',
    });
}
//# sourceMappingURL=assert-can-invite.js.map