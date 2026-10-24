# Proposal: Formulario de Usuarios con Departamentos y Vinculación Híbrida de Telegram

## Intent

Desbloquear la creación de usuarios con roles seccionales (`admin_org`, `operador_org`) en el frontend mediante la incorporación reactiva del selector de departamentos filtrado por organización, sanear la experiencia de usuario para roles globales (`master`, `operador_sistema`), e implementar un flujo híbrido seguro para la vinculación y re-vinculación de Telegram tanto por correo como mediante auto-servicio autenticado en el perfil de usuario.

**Shortcut**: Ticket único [sc-446](https://app.shortcut.com/upse/story/446) · Épica 192 «⚠️ GeoReporta» (workspace: `upse`) · Ver detalle en [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/front/2026-10-11-user-form-departments-telegram-hybrid/shortcut-ticket.md)

---

## Contexto y Problema

1. **Bloqueo en Creación de Usuarios Seccionales (`admin_org`, `operador_org`)**:
   - El backend (`UsersService.adminCreate`, implementado en `sc-436`) exige obligatoriamente `organization_id` y `department_id` para roles seccionales, respondiendo con HTTP 400 Bad Request si alguno falta.
   - En el frontend, `NewUserFormComponent` no cuenta con el selector de departamento ni envía `department_id` en `CreateUserJsonPayload`.
   - Consecuencia: Cualquier intento de crear un usuario de organización desde la interfaz web falla inmediatamente con error 400.

2. **Omisión de Departamentos en `UsersService.getFormData()`**:
   - El endpoint `GET /api/users/form-data` ya entrega `departments: [{ id, name, organization_id }]`.
   - Sin embargo, `UsersService.getFormData()` en el frontend descarta dicho campo, tipando únicamente `{ roles, organizations }`.

3. **Inconsistencia de UX en Roles Globales (`master`, `operador_sistema`)**:
   - Para roles globales, la sección de organización permanece visible y editable en la interfaz, a pesar de que el backend fuerza `organization_id = null` y `department_id = null`.

4. **Vulnerabilidad y Fricción en el Enlace de Telegram (TTL Expirado)**:
   - Los tokens de Telegram emitidos al invitar usuarios tienen un TTL de 24 horas en Redis.
   - Si el enlace de invitación expira o si el operador cambia de teléfono/cuenta de Telegram, actualmente no existe ninguna vía en la plataforma web para generar un nuevo enlace sin intervención manual directa en la base de datos.
   - Exponer el enlace en la pantalla pública de invitación (`/accept-invitation`) es inseguro por carecer de autenticación de sesión previa.

---

## Solución Propuesta: Modo Híbrido Seguro

### 1. Desbloqueo de Departamentos y Reactividad en Formulario
- Tipar la interfaz `Department` (`id`, `nombre`, `organizationId`) en `user.interface.ts`.
- Mapear `departments` en `UsersService.getFormData()`.
- Agregar control `<select id="new-user-dept">` en `NewUserFormComponent`.
- Filtrado reactivo mediante `computed()`: los departamentos listados corresponden estrictamente a la organización seleccionada (`department.organizationId === selectedOrgId`).
- Si la organización cambia o se deselecciona, el valor de `departmentId` se reinicia a `null` automáticamente.
- Validación condicional en `isFormValid()`:
  - `admin_org` y `operador_org`: exigen tanto `organizationId` como `departmentId` con asterisco visual (`*`).
  - `master` y `operador_sistema`: ocultan o deshabilitan la sección de entidad, asegurando que `organizationId` y `departmentId` viajen como `null`.
- Incorporar `department_id: d.departmentId` en el payload de `createUserJson()`.

### 2. Flujo Híbrido Seguro de Telegram
- **Capa 1 (Out-of-band)**: Se mantiene el enlace original enviado por correo en la invitación (TTL 24h).
- **Capa 2 (Backend Quirúrgico)**: Exponer `POST /api/users/me/telegram-link`:
  - Protegido por `JwtAuthGuard` y `PermissionGuard`.
  - Solo disponible para personal interno (`master`, `operador_sistema`, `admin_org`, `operador_org`); rechaza a ciudadanos (`reporter`) con 403 Forbidden.
  - Genera un token efímero seguro mediante `TelegramLinkService.issueFor(userId)`.
  - Retorna `{ telegram_link: "https://t.me/<BOT>?start=<token>" }`.
- **Capa 3 (Frontend Perfil Self-Service)**:
  - En `profile-action-cards.component.ts` (Perfil), agregar tarjeta de **Notificaciones Telegram**.
  - Si el usuario ya está vinculado (`telegram_chat_id` presente): muestra badge verde *"● Vinculado"* con acción para *"Re-vincular"*.
  - Si no está vinculado (`telegram_chat_id` es null): muestra badge *"● No configurado"* con botón *"Vincular bot de Telegram"*.
  - Al presionar el botón, solicita el enlace seguro y abre la ventana directa hacia Telegram o presenta el diálogo de vinculación.

---

## Archivos Afectados

- **Frontend**:
  - `frontend/src/app/features/admin/users/models/user.interface.ts`
  - `frontend/src/app/features/admin/users/services/users.service.ts`
  - `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts`
  - `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html`
  - `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.spec.ts`
  - `frontend/src/app/features/admin/users/services/users.service.spec.ts`
  - `frontend/src/app/core/services/user.service.ts`
  - `frontend/src/app/features/profile/components/profile-action-cards.component.ts`
  - `frontend/src/app/features/profile/components/profile-action-cards.component.spec.ts`
- **Backend**:
  - `backend/src/modules/users/users.controller.ts`
  - `backend/src/modules/users/users.controller.spec.ts`
  - `backend/src/modules/users/users.service.ts`
