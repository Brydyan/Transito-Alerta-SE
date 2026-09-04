# Tasks: ANON — Cerrar el reporte sin sesión

> **Strict TDD activo.** Test primero, ver fallar, implementar.
> Comandos desde `backend/`.

---

## A · Cerrar la autenticación anónima

- [ ] **A.1** — `AuthService.login` rechaza `device_uuid === anonymousDeviceUuid` con 401
  y un motivo distinguible del error genérico de credenciales.
- [ ] **A.2** — **No tocar** `LoginDto`, `ExactlyOneCredential` ni `credential-dispatch`.
  La forma `{device_uuid}` debe seguir siendo válida: `exactly-one-credential.validator.ts:24`
  registra que los 122 tests e2e preexistentes envían exactamente esa forma. El cierre va
  en la lógica de autenticación, no en la validación de forma.
- [ ] **A.3** — Specs: login rechazado, sin tokens, motivo distinguible, otras
  credenciales por dispositivo intactas, la forma de credencial sobrevive.
- [ ] **A.4** — Correr la suite e2e completa y **confirmar que los 122 siguen pasando**.
  Si alguno cae, la delimitación de A.2 se rompió: parar y revisar, no ajustar el test.

## B · Vaciar el techo

- [ ] **B.1** — `anonymousPermissions: []` en `auth.config.ts`.
- [ ] **B.2** — Migración `0048_close_anonymous_ceiling.sql`: vaciar
  `users.permissions` de la fila `device_uuid = 'anonymous'`. **La fila NO se borra** —
  AUD la necesita. Rollback en `database/rollback/`.
- [ ] **B.3** — La migración anula el efecto de `0008_anonymous_read_comments.sql` con una
  migración nueva. **No** se edita ni se revierte 0008: reescribir el historial de
  migraciones aplicadas no es el mecanismo.
- [ ] **B.4** — Invalidar `perm:v3:uid:*`. Ojo: `menu:v1:*` es otro espacio de claves.
- [ ] **B.5** — Specs del techo: configuración vacía, sin lectura, sin escritura, fila
  máscara vaciada, efecto de 0008 anulado.
- [ ] **B.6** — Ajustar `auth.config.spec.ts:56`, que hoy afirma literalmente *«lets an
  anonymous device report an emergency without logging in»*. **Ese test debe invertirse,
  no borrarse**: la capacidad se retiró a propósito y el spec tiene que afirmar la nueva
  propiedad, no quedarse callado sobre la vieja.

## C · La máscara sobrevive

- [ ] **C.1** — Specs: fila presente, referenciable como clave foránea, sigue sin rol,
  publica pero no entra.
- [ ] **C.2** — Comentario en la migración explicando el cambio de uso de la fila:
  identidad de autenticación → identidad de publicación. Sin eso, el próximo que la vea
  sin permisos la borrará por «huérfana».

## D · Cerrar las puertas traseras

- [ ] **D.1** — Recorrer las rutas de incidencias y comentarios: ninguna marcada como
  pública para escritura.
- [ ] **D.2** — Specs: crear incidencia sin token → 401, crear comentario sin token →
  401, sin puerta trasera, lectura pública también cerrada.

## E · Reconciliar F4

- [ ] **E.1** — `B.2.11` deja de describir el flujo sin sesión. El asistente exige sesión.
- [ ] **E.2** — `B.2.12` cambia de sentido: ya no es «tras enviar de forma anónima,
  ofrecer registro», sino que el registro ocurre **antes** (REG).
- [ ] **E.3** — `B.2.13` pasa a afirmar lo contrario: sin sesión el asistente **no** se
  completa.
- [ ] **E.4** — Actualizar la sección «In Scope — Fase B (añadido 2026-08-29)» del
  proposal de F4, dejando constancia de qué se revirtió y por qué. **No borrarla**: un
  alcance que desaparece sin rastro reaparece en la siguiente sesión como idea nueva.

---

## Compuerta

**REG debe estar integrada antes de empezar esta fase.** Si no, queda una ventana en la
que ningún ciudadano puede reportar nada.

## Qué NO hacer

- No eliminar la forma de credencial `{device_uuid}` (122 tests e2e)
- No borrar la fila máscara (AUD la necesita)
- No editar ni revertir la migración 0008
- No tocar el techo de `reporter`
