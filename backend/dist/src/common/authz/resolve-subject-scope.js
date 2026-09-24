"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSubjectScope = resolveSubjectScope;
function resolveSubjectScope(roleName, organizationId, userId) {
    switch (roleName) {
        case 'master':
            return { kind: 'global' };
        case 'operador_sistema':
            return { kind: 'global' };
        case 'admin_org':
            return organizationId === null
                ? { kind: 'deny', reason: 'staff_without_organization' }
                : { kind: 'org', organizationId };
        case 'operador_org':
            return organizationId === null || userId === undefined
                ? { kind: 'deny', reason: 'staff_without_organization' }
                : { kind: 'org_assigned', organizationId, userId };
        default:
            return { kind: 'public' };
    }
}
//# sourceMappingURL=resolve-subject-scope.js.map