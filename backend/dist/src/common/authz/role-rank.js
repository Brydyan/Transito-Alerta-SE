"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_RANK = void 0;
exports.rankOf = rankOf;
exports.ROLE_RANK = {
    master: 1,
    operador_sistema: 2,
    admin_org: 3,
    operador_org: 4,
    reporter: 5,
};
function rankOf(roleName) {
    if (roleName === null) {
        return Number.MAX_SAFE_INTEGER;
    }
    return exports.ROLE_RANK[roleName] ?? Number.MAX_SAFE_INTEGER;
}
//# sourceMappingURL=role-rank.js.map