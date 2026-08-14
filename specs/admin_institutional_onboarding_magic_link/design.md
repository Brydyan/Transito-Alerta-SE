# Design: Alta e Invitación de Usuarios Internos vía Magic Link / OTP

## Arquitectura de Backend
- **Endpoint 1:** `POST /v1/admin/users/invite`
  - Protegido por `auth:sanctum` y middleware `CheckResourcePermission` para roles de Administrador.
  - Genera un token aleatorio único y lo almacena en la tabla `user_invitations` (email, token, role_id, institution_id, expires_at).
- **Endpoint 2:** `POST /v1/auth/activate`
  - Endpoint público.
  - Recibe el `token` de la URL y la nueva `password`.
  - Busca el token en `user_invitations`. Si es válido y no está expirado, crea el usuario en `users`, asigna rol e institución.
  - Retorna un token de acceso Sanctum HTTP 201 y borra la invitación.
- **Endpoint 3:** `POST /v1/admin/users/reinvite`
  - Para reenviar una invitación expirada.

## Arquitectura de Frontend
- **Panel de Admin (`app-admin-users`):**
  - **Ubicación:** `frontend/js/pages/admin/users/users.component.js` y `users.component.html`.
  - **Ubicación en el Menú:** Aparecerá en el menú lateral bajo la sección de "Administración" -> "Usuarios".
  - Componente que muestra el listado de usuarios e invitaciones pendientes.
  - Botón "Invitar Usuario" abre un modal con formulario: Nombre, Email, Rol, y de forma dinámica la Institución si el rol lo requiere.
- **Pantalla de Activación Pública (`app-activate-account`):**
  - **Ubicación:** `frontend/js/pages/auth/activate/activate.component.js` y `activate.component.html`.
  - **Ruta:** Configurada en `frontend/js/router.js` como `#/activate?token=XYZ`.
  - Vista pública con diseño Premium (tarjeta flotante similar al login). Pide la nueva contraseña y su confirmación.
  - Manejo interactivo de token inválido o expirado.

## Flujo de Correos Electrónicos (Emails)
1. **Correo de Invitación (Magic Link):** Cuando el Admin invita a un usuario, Laravel (mediante `Mail` / `Notifications`) enviará un correo a la dirección proporcionada. El correo contendrá un diseño HTML profesional con un botón grande de "Activar mi cuenta", el cual dirigirá a la ruta del frontend `#/activate?token=...`.
2. **Correo de Confirmación (Opcional):** Tras activar la cuenta con éxito, se enviará un segundo correo dando la bienvenida al sistema y confirmando que la cuenta está activa.
