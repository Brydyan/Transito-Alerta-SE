# Proposal: REG — Auto-registro del ciudadano

## Intent

**Hoy un ciudadano no puede crearse una cuenta.** Y F4 la da por supuesta:

> `B.2.12` — *«Tras enviar de forma anónima, ofrecer registro o inicio de sesión para
> poder seguir la incidencia.»*

No hay a dónde llevarlo. La carpeta `frontend/src/app/features/auth/` tiene `login`,
`accept-invitation`, `forgot-password`, `reset-password` y `verify-email` — **no hay
registro**. Y el backend lo cerró a propósito:

```ts
// backend/src/modules/auth/auth.controller.ts:54 — T6.8.C1
@Post('register')
@HttpCode(HttpStatus.GONE)
register() { return { message: 'Registration is invitation-only. …' }; }
```

Un **410 Gone** deliberado: el alta es por invitación. Eso es correcto para el personal
—operadores y administradores los da de alta una organización— y deja fuera justo a
quien el producto quiere sumar.

Esta fase revierte esa decisión **sólo para el ciudadano**, tras la decisión de producto
del 2026-09-02: el reporte sin sesión desaparece y su lugar lo ocupa el `reporter`
autenticado que puede publicar de forma anónima (ver ANON y AUD).

## Lo que NO se revierte

La invitación sigue siendo el único camino para todo lo que no sea `reporter`. El límite
es el corazón de esta fase:

```
auto-registro  → SIEMPRE y sólo el rol `reporter`
invitación     → operador_org, admin_org, operador_sistema, master
```

El endpoint **no recibe el rol como dato**. Lo fija. Un parámetro que se valida es un
parámetro que algún día se valida mal; un valor fijo en el servidor no tiene ese modo de
fallo. Ver `design.md` D1.

## Scope

### In Scope — A · Backend
- `POST /auth/register` deja de ser lápida: crea usuario con rol `reporter`
- Reutiliza `EmailVerificationService` y `email_verified_at`, **ya existentes**
  (`0028_users_otp_compliance.sql`) — no se construye verificación nueva
- Limitación de tasa por IP y por correo
- El correo ya registrado no revela si existe una cuenta

### In Scope — B · Frontend
- `/registro` — formulario público, fuera de `authGuard`
- Enlace desde el login y desde el final del asistente de reporte (cierra F4/B.2.12)
- Reutiliza el componente `verify-email` existente para el paso del OTP

### Out of Scope
- Registro con Google/Facebook
- Captcha. Se deja anotado como respuesta si la limitación de tasa resulta insuficiente:
  añadir un tercero antes de tener el problema es coste sin evidencia
- Perfil ciudadano ampliado (foto, teléfono). El alta pide lo mínimo
- Cambiar el flujo de invitación

## Capabilities

- `citizen-registration` (nueva)

## Dependencias

**Bloquea a ANON.** El orden importa y no es negociable: si se cierra el reporte sin
sesión antes de que exista el registro, queda una ventana en la que **ningún ciudadano
puede reportar nada**. Primero la puerta nueva, después se cierra la vieja.

**Bloquea a F4 / B.2.12.**

## Preguntas abiertas

- **Q1** — ¿Se exige correo verificado para *publicar*, o basta para *entrar*? Propuesta:
  verificado para publicar. Si no, el auto-registro es un generador de cuentas
  desechables y la trazabilidad que AUD construye no vale nada. Resuelta en `design.md`
  D2; se anota acá porque cambia la experiencia del ciudadano y le toca al equipo
  confirmarla.
