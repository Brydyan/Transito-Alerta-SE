// Real NestJS contract from `backend/src/modules/auth/auth.service.ts`
// (`AuthTokens`) and `dto/{login,refresh}.dto.ts`. snake_case matches
// the JSON wire format — DO NOT rename to camelCase, the backend
// does not transform field names. This file is the SINGLE source of
// truth for the wire shape; if a test fakes a response, it must
// use the same field names (see auth.service.spec.ts).

export interface Avatar {
  url: string;
}

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
  /**
   * REG (sc-325) C.1 — booleano derivado de `email_verified_at` en la
   * fila del usuario. `true` cuando el `reporter` (o cualquier
   * usuario con `roleName = 'reporter'`) verificó su correo vía el
   * composer del OTP (C.3). El frontend lo usa en C.4 para decidir
   * si redirige al composer o al dashboard.
   */
  email_verified: boolean;
  /**
   * REG (sc-325) Fix A (ronda 10) — nombre del rol (`reporter`,
   * `operador_org`, `admin_org`, `operador_sistema`, `master`) o
   * `null` para el dispositivo anónimo. Sin este campo, C.4 no
   * puede decidir el redirect (`current?.roleName === 'reporter'`
   * era siempre `false` antes del fix).
   */
  role_name: string | null;
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
  avatar?: Avatar | null;
  /**
   * REG (sc-325) C.1/C.4 — espejado de la respuesta de `/auth/me`.
   * El frontend no consulta la BD; el backend es la fuente.
   * `null` mientras el fetch no haya terminado (entre login
   * y la primera respuesta de `/me`).
   */
  emailVerified?: boolean | null;
}

/** @deprecated — same reason as the removed self-service register flow. */
export interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
  createdAt?: string;
  expiresAt?: string;
}

/**
 * SC-207 — `GET /invitations/preview?token=...` response. Fetched
 * before showing the password form so the user can see who invited
 * them, to which organization, and with what role — without leaking
 * any of that to an attacker holding a stale/forged token (the
 * backend only returns this for a token that still resolves).
 */
export interface InvitationPreview {
  organization_name: string | null;
  inviter_name: string | null;
  role_name: string;
  expires_at: string;
}

/**
 * SC-207 — `POST /auth/accept-invitation` (replaces the dead
 * `register()` flow). Backend mints a live `AuthTokens` session
 * on success (i.e. the user is auto-logged-in, no separate login
 * step). The real flow is invitation-token based: an
 * administrator creates an invitation row in the backend, the
 * invitation token is delivered out-of-band (e.g. by email), the
 * recipient visits `/accept-invitation?token=…`, sets a password,
 * and is signed in.
 *
 * Password minimum is 12 chars — the backend has
 * `PASSWORD_MIN_LENGTH = 12` hardcoded in
 * `accept-invitation.dto.ts`.
 */
export interface AcceptInvitationDto {
  token: string;
  password: string;
  /** Optional; if present, writes termsAcceptedAt + termsVersion. */
  terms_version?: string;
}
