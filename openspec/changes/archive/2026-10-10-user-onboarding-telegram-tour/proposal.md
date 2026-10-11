# Proposal: Onboarding de Usuarios, Selección de Departamento y Tour Telegram por Rol

## Intent

Permitir que el usuario `master` asigne departamento al crear usuarios, automatizar la vinculación segura de Telegram mediante deep-link (`t.me/<bot>?start=<token>`) sin intervención manual en la base de datos, y entregar un tour de bienvenida educativo adaptado al rol del usuario tanto por correo electrónico como por Telegram.

**Shortcut**: Ticket único [sc-436](https://app.shortcut.com/upse/story/436) · Épica 192 «⚠️ GeoReporta» (workspace: `upse`) · Ver detalle en [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/back/2026-10-10-user-onboarding-telegram-tour/shortcut-ticket.md)

---

## Contexto y Problema

1. **Departamento huérfano en creación**:
   - La columna `users.department_id` existe en PostgreSQL desde la migración `0056_departments.sql`.
   - Sin embargo, `UserEntity` no mapea la columna, `AdminCreateUserDto` no la acepta y `NewUserFormComponent` no muestra el selector.
   - Consecuencia: Un usuario creado no queda asignado a ningún departamento a menos que se haga por base de datos directa.

2. **Fricción en vinculación de Telegram (Privacidad y Escalabilidad)**:
   - La migración `0069` agregó `users.telegram_chat_id` para notificar emergencias (F7).
   - La API de Telegram no permite enviar mensajes a usuarios por número de teléfono; el usuario debe iniciar la conversación con el bot primero.
   - Obtener el `chat_id` manual (`/getUpdates` y escribir en BD) no es viable para decenas de operadores y administradores.

3. **Falta de orientación según rol (Onboarding ciego)**:
   - El correo actual solo pide crear contraseña.
   - El nuevo usuario de staff no sabe qué herramientas tiene disponibles según su rol (`master`, `admin_org`, `operador_org`).

---

## Solución Propuesta

### 1. Selección Condicional de Organización y Departamento
- Mapear `department_id` en `UserEntity`.
- **Roles Globales de Sistema (`master`, `operador_sistema`)**: No requieren organización ni departamento (`organization_id = null`, `department_id = null`). Los campos permanecen ocultos/deshabilitados.
- **Roles de Organización (`admin_org`, `operador_org`)**: Es obligatorio seleccionar tanto Organización como Departamento.
- Endpoint `GET /api/users/form-data` expone `{ roles, organizations, departments }` con relación `organization_id` para que el frontend filtre los departamentos dinámicamente según la organización elegida.
- Añadir campo select de Departamento en el formulario frontend `NewUserFormComponent` vinculado a la organización.

### 2. Vinculación Automática Telegram vía Deep-Link (Personal Interno)
- Al crear o invitar a personal interno (`master`, `operador_sistema`, `admin_org`, `operador_org`), el backend genera un token de vinculación efímero (TTL 24h en Redis: `telegram:link:<token> -> userId`).
- Se genera la URL de enlace: `https://t.me/<BOT_USERNAME>?start=<token>`.
- Esta URL se envía en el correo de invitación al staff y se muestra como botón en la pantalla de activación de contraseña.
- Cuando el usuario presiona "Iniciar" en Telegram, el bot recibe `/start <token>`:
  - Valida el token contra Redis.
  - Asocia `users.telegram_chat_id = msg.chat.id`.
  - Invalida el token (un solo uso).

### 3. Tour de Bienvenida Personalizado por Rol Interno
- Una vez vinculado en Telegram, el bot envía un mensaje de bienvenida inmediato con un tour sintetizado de sus funciones operativas:
  - **`master`**: Configuración global del sistema, gestión de organizaciones/departamentos, auditoría y control de accesos.
  - **`operador_sistema`**: Operación y monitoreo transversal a nivel nacional/sistema, despacho y seguimiento de incidentes sin restricción de organización.
  - **`admin_org`**: Monitoreo de incidentes de su organización y departamentos, despacho de emergencias F7, asignación y gestión de operadores locales.
  - **`operador_org`**: Recepción de alertas de incidentes asignados en su jurisdicción, actualización de estados en tiempo real y registro de evidencias en terreno.
- El correo de invitación para staff incluirá también una sección resumen con la misma guía según el rol.
- **Aislamiento de Ciudadanos (`reporter`)**: Los ciudadanos se auto-registran públicamente mediante `POST /api/auth/register` y se verifican por código OTP al correo (`auth.register.ts` + `EmailVerificationService`). NO son creados por Master, NO reciben invitación, NO usan bot de Telegram ni reciben tours operativos. Este flujo permanece completamente desacoplado e intacto.

---

## Áreas Afectadas

- **Backend**:
  - `backend/src/modules/users/entities/user.entity.ts`
  - `backend/src/modules/users/dto/admin-create-user.dto.ts`
  - `backend/src/modules/users/dto/admin-update-user.dto.ts`
  - `backend/src/modules/users/users.service.ts`
  - `backend/src/modules/telegram/telegram.service.ts` & nuevo handler de incoming updates (`telegram-bot.controller.ts` / webhook).
  - `backend/src/modules/mail/mail.service.ts`
- **Frontend**:
  - `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.*`
  - `frontend/src/app/features/admin/users/models/user.interface.ts`
  - Pantalla post-activación de contraseña con botón directo a Telegram.
