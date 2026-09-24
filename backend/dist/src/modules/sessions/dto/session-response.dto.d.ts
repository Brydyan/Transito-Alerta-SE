export interface SessionResponseDto {
    id: string;
    device_uuid: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
    last_refresh_at: Date | null;
    expires_at: Date | null;
    current: boolean;
}
export declare function toSessionResponseDto(row: {
    id: string;
    device_uuid: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date | null;
}, currentSessionId: string | null): SessionResponseDto;
