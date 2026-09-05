// T3.9 / T3.6 / REG (sc-325) — códigos de error del módulo de auth.
//
// Cada constante es la clave que el cliente recibe en el body
// de la respuesta (campo `code`), para que pueda switchear
// programáticamente en vez de parsear mensajes.

export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
export const INVALID_CREDENTIAL_SHAPE = 'INVALID_CREDENTIAL_SHAPE';
export const INVALID_TOKEN = 'INVALID_TOKEN';
export const SESSION_REQUIRED = 'SESSION_REQUIRED';
export const SESSION_RETRY_UNAVAILABLE = 'SESSION_RETRY_UNAVAILABLE';
export const SESSION_REUSE_DETECTED = 'SESSION_REUSE_DETECTED';
export const SESSION_REVOKED = 'SESSION_REVOKED';
export const SESSION_USER_MISMATCH = 'SESSION_USER_MISMATCH';
export const EMAIL_ALREADY_CLAIMED = 'EMAIL_ALREADY_CLAIMED';
export type SessionErrorCode =
  | typeof SESSION_REQUIRED
  | typeof SESSION_RETRY_UNAVAILABLE
  | typeof SESSION_REUSE_DETECTED
  | typeof SESSION_REVOKED
  | typeof SESSION_USER_MISMATCH;

// REG (sc-325) — códigos nuevos del alta pública. Documentados
// en `openspec/changes/front/2026-09-02-reg-citizen-self-registration/design.md`.
// `EMAIL_VERIFICATION_REQUIRED` lo emite `EmailVerifiedGuard`
// cuando un `reporter` sin verificar intenta crear una
// incidencia o un comentario (D2).
export const EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED';

// `REGISTRATION_RATE_LIMITED` lo emite el limitador por IP /
// por correo del alta. La forma del body es estándar de
// NestJS `{ statusCode: 429, message, code }`; el código
// `code` es lo que el cliente switchea.
export const REGISTRATION_RATE_LIMITED = 'REGISTRATION_RATE_LIMITED';

// ANON (sc-327) — `ANONYMOUS_IDENTITY_CLOSED` lo emite el rechazo
// de `device_uuid = 'anonymous'` en `AuthService.login`. Es
// distinguible de `INVALID_CREDENTIALS` (un cliente antiguo debe
// poder mostrarle al usuario que la ruta del reporte sin sesión
// se cerró, no que las credenciales son inválidas).
export const ANONYMOUS_IDENTITY_CLOSED = 'ANONYMOUS_IDENTITY_CLOSED';
