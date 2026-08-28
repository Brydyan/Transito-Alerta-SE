// Real NestJS contract from `backend/src/modules/auth/auth.service.ts`
// (`AuthTokens`) and `dto/{login,refresh}.dto.ts`. snake_case matches
// the JSON wire format — DO NOT rename to camelCase, the backend
// does not transform field names. This file is the SINGLE source of
// truth for the wire shape; if a test fakes a response, it must
// use the same field names (see auth.service.spec.ts).

/** POST /auth/login — exactly one of the two shapes is required. */
export interface LoginRequest {
  device_uuid?: string;
  email?: string;
  password?: string;
}

/** POST /auth/refresh */
export interface RefreshRequest {
  refresh_token: string;
}

/** POST /auth/login, /auth/refresh, /auth/accept-invitation */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  permissions: string[];
}

/** GET /auth/me */
export interface MeResponse {
  user_id: string;
  device_uuid: string | null;
  permissions: string[];
}

/** POST /auth/logout */
export interface LogoutResponse {
  success: boolean;
}

/**
 * In-memory representation of the current user. The backend only
 * exposes `user_id`, `device_uuid`, and `permissions` via /auth/me;
 * `email` / `name` / `role` are not part of the wire contract and
 * default to `null` until a future `GET /users/:id` is added. Don't
 * rely on them being populated.
 */
export interface User {
  id: string;
  email: string | null;
  name: string | null;
  roleId: number | null;
  roleName: string | null;
  permissions: string[];
  device_uuid: string | null;
}

/** @deprecated — registration is invitation-only (POST /auth/register
 *  returns 410 Gone). The real flow is `POST /auth/accept-invitation`
 *  which is implemented in a follow-up change. Kept here so a stale
 *  import surfaces a TS error that points to the right replacement. */
export interface RegisterRequest {
  readonly __brand: 'use /auth/accept-invitation instead';
  email: string;
  password: string;
  device_uuid?: string;
}
export interface RegisterResponse {
  readonly __brand: never;
}

/** @deprecated — same reason. */
export interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
  createdAt?: string;
  expiresAt?: string;
}
