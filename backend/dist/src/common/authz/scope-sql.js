"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeToSql = scopeToSql;
exports.scopeCacheKey = scopeCacheKey;
function scopeToSql(scope, opts) {
    const { table, paramOffset } = opts;
    switch (scope.kind) {
        case 'global':
        case 'public':
            return { fragment: 'TRUE', params: [] };
        case 'deny':
            return { fragment: 'FALSE', params: [] };
        case 'org':
            return {
                fragment: `organization_id = $${paramOffset}`,
                params: [scope.organizationId],
            };
        case 'org_assigned':
            return {
                fragment: `organization_id = $${paramOffset} AND EXISTS ` +
                    `(SELECT 1 FROM assignments a WHERE a.incident_id = ${table}.id ` +
                    `AND a.operator_id = $${paramOffset + 1})`,
                params: [scope.organizationId, scope.userId],
            };
    }
}
function scopeCacheKey(scope) {
    switch (scope.kind) {
        case 'global':
            return 'g';
        case 'public':
            return 'p';
        case 'deny':
            return 'deny';
        case 'org':
            return `o:${scope.organizationId}`;
        case 'org_assigned':
            return `oa:${scope.organizationId}:${scope.userId}`;
    }
}
//# sourceMappingURL=scope-sql.js.map