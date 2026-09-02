# Tasks: REG — Auto-registro del ciudadano

> **Strict TDD activo.** Test primero, ver fallar, implementar.
> Backend desde `backend/`; frontend desde `frontend/`.

---

## A · Backend

- [ ] **A.1** — `RegisterDto`: correo, contraseña, nombre y apellido. **Sin campo de rol,
  ni de organización, ni de permisos.** El DTO es la primera línea: lo que no se declara
  no llega.
- [ ] **A.2** — Sustituir la lápida de `auth.controller.ts:54` (410 Gone, T6.8.C1) por el
  alta real. Dejar en el comentario **por qué** se revierte y qué sigue siendo por
  invitación — sin eso, el próximo que lo lea creerá que la lápida se borró por descuido.
- [ ] **A.3** — `AuthService.register`: crea el usuario con `roleName: 'reporter'`
  **constante en el servidor** (D1) y copia `roles.permissions` a `users.permissions`,
  como hace toda alta.
- [ ] **A.4** — Specs de rol: alta correcta, `role: 'master'` ignorado, `roleName`/
  `role_id`/`permissions` ignorados, `organization_id` ignorado, permisos correctos, ya
  no responde 410.
- [ ] **A.5** — Spec de frontera: ninguna combinación de entradas produce un rol de
  personal. Es el escenario que impide que este endpoint público se convierta en una
  escalada de privilegios.
- [ ] **A.6** — Guard `EmailVerifiedGuard`: exige `email_verified_at` para `CREATE
  incidents` y `CREATE comments`, **sólo** para el rol `reporter` (D2).
- [ ] **A.7** — Specs de verificación: entrar sin verificar, leer sin verificar, publicar
  sin verificar → 403, comentar sin verificar → 403, publicar tras verificar, el personal
  no se ve afectado.
- [ ] **A.8** — Respuesta indistinguible ante correo existente (D3): misma forma, mismo
  código, y aviso al titular en vez de OTP.
- [ ] **A.9** — Specs de no-revelación: correo nuevo, correo existente idéntico, sin
  cuenta duplicada, aviso al titular, tiempos comparables.
- [ ] **A.10** — Limitación de tasa por IP y por correo (D4). Specs: ráfaga por IP → 429,
  insistencia por correo → 429, alta aislada no afectada.
- [ ] **A.11** — Verificar la forma que emite el **controlador**, no la clase DTO:
  `SnakeCaseResponseInterceptor` reescribe toda respuesta.

## B · Frontend

- [ ] **B.1** — `features/auth/register/` con los primitivos de F0 (`ui-button`,
  `ui-card`). Nada de botones propios: para eso existe el design system.
- [ ] **B.2** — Ruta `/registro` en `app.routes.ts`, con `guestGuard` y **fuera** de
  `authGuard`. Primera ruta pública del producto (D5).
- [ ] **B.3** — Registrarla también en `MENU_MAP` si corresponde, o dejar constancia de
  por qué no. F1 entregó `menu-map.spec.ts` justo para que rutas y menú no vuelvan a
  divergir.
- [ ] **B.4** — Enlace desde el login.
- [ ] **B.5** — Enlace al final del asistente de reporte. **Cierra F4/B.2.12**, que hoy
  promete algo que no existe.
- [ ] **B.6** — Al completar el alta, navegar al componente `verify-email` **existente**.
  No construir uno nuevo.
- [ ] **B.7** — Validación en el cliente: correo y política de contraseña, sin llamar al
  servidor.
- [ ] **B.8** — Specs de pantalla: ruta pública, enlace desde login, enlace tras
  reportar, navegación al OTP, sin filtrar existencia, errores de validación.

---

## Compuerta

**B no se integra antes que A.** Una pantalla de registro contra un endpoint que responde
410 es una pantalla que miente.

## Y esta fase antes que ANON

Si se cierra el reporte sin sesión antes de que exista el registro, queda una ventana en
la que **ningún ciudadano puede reportar nada**. Primero la puerta nueva.

## Qué NO hacer

- No añadir captcha (D4 — respuesta con evidencia, no preventiva)
- No tocar el flujo de invitación
- No ampliar el perfil del ciudadano más allá del alta mínima
- No exigir verificación para iniciar sesión (D2)
