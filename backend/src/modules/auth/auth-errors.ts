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

// REG (sc-325) Fix B (ronda 10) — códigos del composer del OTP.
// `EmailVerificationService` emite estos códigos en sus 422 para
// que el frontend (C.3/C.6) pueda distinguir las dos causas del
// 422 que el spec exige separar:
//  - `OTP_INVALID` — código equivocado, vencido, o sin OTP pendiente.
//    El reportero puede reintentar (pedir reenvío + nuevo código).
//  - `EMAIL_ALREADY_VERIFIED` — el correo ya estaba verificado.
//    El reportero terminó; la app lo lleva al dashboard.
//
// Antes de este fix el backend lanzaba `UnprocessableEntityException(string)`
// sin campo `code`, y el frontend (que asumía `code` en el body) caía
// siempre en la rama "OTP inválido" — un reportero cuyo correo ya estaba
// verificado recibía el mensaje de "reintentá", exactamente lo que el
// spec prohíbe.
export const OTP_INVALID = 'OTP_INVALID';
export const EMAIL_ALREADY_VERIFIED = 'EMAIL_ALREADY_VERIFIED';

// ANON (sc-326) — el reporte sin sesión se cierra. La identidad
// anónima (`device_uuid === 'anonymous'`) ya no puede autenticarse.
// El motivo se distingue del error genérico de credenciales para
// que un cliente antiguo pueda mostrar algo accionable al
// ciudadano en vez de un "credenciales inválidas" que no le
// dice qué pasa. Mensaje accionable: «El reporte anónimo sin
// sesión ya no está disponible. Registrate primero para reportar.»
export const ANONYMOUS_IDENTITY_CLOSED = 'ANONYMOUS_IDENTITY_CLOSED';

