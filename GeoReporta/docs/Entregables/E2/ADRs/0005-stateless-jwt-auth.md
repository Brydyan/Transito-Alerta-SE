# ADR-0005: Autenticación JWT stateless

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

La API REST necesita autenticar a los usuarios. El SRS v1.0 mencionaba "Token Bearer (JWT) o sesión" como alternativas. Hay que elegir un mecanismo que escale horizontalmente (múltiples instancias de backend detrás de un load balancer) y que no requiera sesiones server-side (que serían un punto único de falla y un cuello de botella).

## Considered Options

1. **Sesiones server-side con cookie** (Laravel Sanctum stateful).
2. **JWT con `tymon/jwt-auth`** — access token corto + refresh token largo. **Elegido.**
3. **OAuth2 con proveedor externo** (Auth0, Keycloak, etc.).
4. **API keys por usuario** (sin expiración, sin refresh).

## Decision Outcome

**Opción 2: JWT con `tymon/jwt-auth`.** Login devuelve `access_token` (TTL 60 min) + `refresh_token` (TTL 30 días). Cada request autenticado envía `Authorization: Bearer <access_token>`. Cuando el access expira, el cliente usa el refresh para obtener uno nuevo sin re-login.

**Razones:**

- **Stateless**: el backend no guarda nada sobre la sesión. Escalar horizontalmente es trivial: cualquier instancia puede validar cualquier token con la misma clave secreta.
- **Estándar de la industria**: JWT (RFC 7519) es lo que esperan los clientes de API.
- **No dependencia externa**: a diferencia de OAuth2 con proveedor, no hay un servicio más que mantener.
- **Compatible con clientes no-browser**: el frontend guarda los tokens y los envía, no requiere cookies ni CSRF.
- **Refresh token permite UX sin re-login continuo**: el usuario no tiene que loguearse cada hora.

## Consequences

### Positive

- **Escalabilidad horizontal trivial**: cualquier instancia del backend valida cualquier token.
- **No requiere sticky sessions en el load balancer**.
- **No hay punto único de falla** en la sesión: la BD de sesiones se va.
- **Compatible con cualquier cliente** (web, mobile, integraciones).
- **TTL del access corto** (60 min) limita el daño si un token se filtra.

### Negative

- **No se puede forzar logout antes de la expiración**: el access token es válido hasta que expire, incluso si el usuario hace logout. El refresh token puede revocarse, pero el access actual sigue vivo hasta 60 min. Mitigación: usar TTL aún más cortos si el riesgo es alto.
- **El secret JWT es un single point of failure**: si se filtra, todos los tokens son falsificables hasta rotar. Mitigación: rotar el secret periódicamente (invalida todos los tokens existentes, fuerza re-login masivo).
- **Más complejo que sesiones**: requiere implementar refresh, manejo de tokens en cliente, lógica de "token expirado" en el frontend.
- **No hay "kick user"**: si un usuario es bloqueado (`User.deleted_at` o `role` cambiado), los tokens existentes siguen siendo válidos hasta expirar. Mitigación: incluir un `token_version` en el User que el backend chequea en cada request (caro: 1 query extra por request).

## Implementation

**Archivos clave:**

- `backend/config/jwt.php` — configuración del secret, TTLs, algoritmos.
- `backend/app/Domains/Auth/Http/AuthController.php` — `login()`, `refresh()`, `logout()`, `me()`, `updateProfile()`.
- `backend/routes/api.php` — `POST /api/login` (público), `POST /api/auth/refresh` (público), resto dentro de grupo `middleware('jwt')`.
- `composer.json` — dependencia `tymon/jwt-auth`.

**Forma del flujo:**

```
[Login]    POST /api/login   {email, password}    → {access_token, refresh_token, expires_in}
[Auth]     GET /api/me       Authorization: Bearer <access_token>  → {user data}
[Refresh]  POST /api/auth/refresh  {refresh_token}  → {access_token, expires_in}
[Logout]   POST /api/logout  Authorization: Bearer <access_token>  → 204
```

**Configuración TTL** (en `config/jwt.php`):
- `ttl` (access): 60 minutos
- `refresh_ttl` (refresh): 30 días
- `algo`: HS256 (HMAC-SHA256)

## References

- [SRS v2.0 §3.1.4 Interfaces de Comunicación](../Requisitos/SRS.md#interfaces-de-comunicación)
- [SRS v2.0 §3.6 RS-006 JWT](../Requisitos/SRS.md#requisitos-de-seguridad)
- [SRS v2.0 §3.2 RF-FUNC-026 Refresh de Token](../Requisitos/SRS.md#autenticación)
- ADR-0006 Frankenphp/Octane — Octane requiere cuidado con JWT porque el state vive en memoria entre requests.
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [tymon/jwt-auth docs](https://jwt-auth.readthedocs.io/)
