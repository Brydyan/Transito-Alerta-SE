"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirePermission = exports.REQUIRE_PERMISSION_KEY = void 0;
exports.formatPermissionString = formatPermissionString;
exports.inferResourceFromPath = inferResourceFromPath;
const common_1 = require("@nestjs/common");
exports.REQUIRE_PERMISSION_KEY = 'atl:require-permission';
const RequirePermission = (action, resource) => (0, common_1.SetMetadata)(exports.REQUIRE_PERMISSION_KEY, { action, resource });
exports.RequirePermission = RequirePermission;
function formatPermissionString(action, resource) {
    return `${action} ${resource}`;
}
function inferResourceFromPath(path) {
    const segments = path.split('/').filter(Boolean);
    const apiIndex = segments.indexOf('api');
    const resourceIndex = apiIndex >= 0 ? apiIndex + 1 : 0;
    return segments[resourceIndex] ?? '';
}
//# sourceMappingURL=require-permission.decorator.js.map