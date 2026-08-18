/**
 * Session listing response shape (T3.9 design §4/File Changes). Deliberately
 * never carries `refresh_token_hash`/`previous_refresh_token_hash` — a
 * listing endpoint must never leak a value an attacker could replay.
 */
export interface SessionResponseDto {
  id: string;
  device_uuid: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  last_refresh_at: Date | null;
  expires_at: Date | null;
  current: boolean;
}

/** Maps a raw `SessionRow` to the public listing shape (never a hash field). */
export function toSessionResponseDto(
  row: {
    id: string;
    device_uuid: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date | null;
  },
  currentSessionId: string | null,
): SessionResponseDto {
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
