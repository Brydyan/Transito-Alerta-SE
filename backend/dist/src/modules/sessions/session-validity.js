"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_SESSION_SQL = void 0;
exports.isWithinRotationGrace = isWithinRotationGrace;
exports.ACTIVE_SESSION_SQL = 'revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL';
function isWithinRotationGrace(rotatedAt, now, graceSeconds) {
    if (rotatedAt === null) {
        return false;
    }
    const elapsedSeconds = (now.getTime() - rotatedAt.getTime()) / 1000;
    return elapsedSeconds >= 0 && elapsedSeconds <= graceSeconds;
}
//# sourceMappingURL=session-validity.js.map