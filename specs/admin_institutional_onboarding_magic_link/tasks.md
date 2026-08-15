# Tasks: Alta e Invitación de Usuarios Internos vía Magic Link / OTP

- [x] Tarea 1: Crear migración y modelo `UserInvitation` (email, token, name, role_id, institution_id, expires_at).
- [x] Tarea 2: Crear `InviteUserRequest` (validar que el email sea único en users, role_id, y validar institution si aplica).
- [x] Tarea 3: Crear los endpoints en `routes/api.php` y en un nuevo o existente controlador (`AdminUserController`).
- [x] Tarea 4: Implementar `UserInvitationNotification` para enviar el correo HTML con el Magic Link, y `UserActivatedNotification` para el correo de confirmación de alta exitosa.
- [x] Tarea 5: Implementar el endpoint público de activación (`POST /v1/auth/activate`).
- [x] Tarea 6: Escribir tests (PHPUnit) probando el flujo de invitación, envío de correos (Mail::fake) y activación.
- [x] Tarea 7: Frontend - Crear/Actualizar componente `app-admin-users` en `frontend/js/pages/admin/users/` (modal de invitación, llamada a la API y listado). Agregarlo al router si no existe.
- [x] Tarea 8: Frontend - Crear el componente público `app-activate-account` en `frontend/js/pages/auth/activate/` con la estética premium y configurar la ruta `#/activate` en `router.js`.
