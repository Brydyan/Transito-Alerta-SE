"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSessionResponseDto = toSessionResponseDto;
function toSessionResponseDto(row, currentSessionId) {
    return {
        id: row.id,
        device_uuid: row.device_uuid,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        created_at: row.created_at,
        last_refresh_at: row.last_used_at,
        expires_at: row.expires_at,
        current: row.id === currentSessionId,
    };
}
//# sourceMappingURL=session-response.dto.js.map