# Specification: User Onboarding, Department Selection & Telegram Tour

## Requirements (EARS)

### R1 — Selección y Validación Condicional de Organización y Departamento
- **Ubicuo**: Para los roles seccionales `admin_org` y `operador_org`, el sistema DEBE exigir obligatoriamente `organization_id` y `department_id`.
- **Invariante**: SI el rol es `admin_org` u `operador_org` y `department_id` no pertenece a `organization_id` (o cualquiera de los dos es nulo), ENTONCES el sistema DEBE rechazar la creación o actualización con HTTP 400 Bad Request.
- **Ubicuo**: Para los roles de sistema global `master` y `operador_sistema`, el sistema NO DEBE exigir `organization_id` ni `department_id`, persistiendo ambos campos como `null`.
- **Evento**: CUANDO el cliente consulta `GET /api/users/form-data`, el sistema DEBE retornar la lista de departamentos activos `{ id, name, organization_id }` para permitir filtrado reactivo en el frontend.

### R2 — Generación de Token de Vinculación de Telegram (Personal Interno)
- **Evento**: CUANDO se crea un usuario de personal interno (`master`, `operador_sistema`, `admin_org`, `operador_org`) o se solicita un enlace de Telegram para staff, el sistema DEBE generar un token criptográfico seguro de un solo uso con expiración de 24 horas.
- **Ubicuo**: El sistema DEBE indexar el token en Redis bajo la clave `telegram:link:<token>` con el ID del usuario como valor y TTL de 86400 segundos.

### R3 — Enlace Profundo (Deep Link) en Correo y Frontend
- **Ubicuo**: El sistema DEBE generar la URL de enlace con el formato `https://t.me/<BOT_USERNAME>?start=<token>`.
- **Evento**: CUANDO se envía el correo de invitación al personal interno, el sistema DEBE incluir el enlace de activación de cuenta y el enlace de conexión a Telegram.
- **Estado**: MIENTRAS el usuario de staff esté en el flujo de activación o en su perfil con `telegram_chat_id` nulo, el sistema frontend DEBE mostrar el botón para vincular Telegram.

### R4 — Recepción y Vinculación en Bot de Telegram
- **Evento**: CUANDO el bot de Telegram recibe un mensaje con el comando `/start <token>`, el sistema DEBE validar la existencia del token en Redis.
- **Evento**: CUANDO el token es válido, el sistema DEBE asignar el `chat.id` del remitente al campo `users.telegram_chat_id` correspondiente y eliminar el token de Redis.
- **No deseado**: SI el token no existe o ha expirado, ENTONCES el bot DEBE responder con un mensaje notificando que el enlace es inválido y solicitando iniciar sesión en la plataforma web para renovarlo.

### R5 — Tour de Bienvenida y Capacitación por Rol Interno (Telegram)
- **Evento**: CUANDO la vinculación de Telegram se completa con éxito, el bot DEBE enviar inmediatamente un mensaje de bienvenida y una guía sintetizada de capacidades basada en el rol del usuario:
  - Para `master`: Configuración global, administración de organizaciones/departamentos y auditoría.
  - Para `operador_sistema`: Operación y monitoreo transversal del sistema, seguimiento de incidentes multi-organización y despacho general.
  - Para `admin_org`: Monitoreo de incidencias de la organización/departamentos, despacho de emergencias F7, gestión de turnos y operadores.
  - Para `operador_org`: Recepción de alertas push de incidentes asignados, actualización de estados (`in_progress` -> `resolved`) y registro de evidencias en terreno.

### R6 — Mini Guía en Correo Electrónico para Staff
- **Ubicuo**: La plantilla de correo de invitación para personal interno DEBE incorporar un bloque informativo con el rol asignado al usuario y un resumen de bienvenida consistente con el tour de Telegram.

### R7 — Aislamiento y Exclusión de Ciudadanos (`reporter`)
- **Ubicuo**: Los usuarios ciudadanos (`reporter`) registrados a través del flujo público (`POST /api/auth/register`) NO DEBEN recibir tokens de vinculación de Telegram, ni invitaciones con deep-link, ni tours del bot de Telegram.
- **Ubicuo**: La verificación de identidad de los ciudadanos continuará ejecutándose exclusivamente mediante el flujo existente de código OTP por correo electrónico (`EmailVerificationService`).

---

## Scenarios

### Escenario 1a: Creación de usuario Global (`operador_sistema` / `master`) sin Org ni Depto
- **DADO** un usuario con rol `master` autenticado
- **CUANDO** envía `POST /api/users` para un `operador_sistema` con `first_name`, `last_name`, `email`, `phone`, `role_id` y sin `organization_id` ni `department_id`
- **ENTONCES** el usuario se crea con `organization_id = null`, `department_id = null`, `is_active: false`
- **Y** el token de enlace de Telegram queda registrado en Redis con TTL de 24h
- **Y** se envía el correo de invitación con el enlace de activación y el deep link de Telegram

### Escenario 1b: Creación de usuario Seccional (`admin_org` / `operador_org`) con Org y Depto válidos
- **DADO** un usuario con rol `master` autenticado
- **CUANDO** envía `POST /api/users` para un `admin_org` con `organization_id` y `department_id` perteneciente a dicha organización
- **ENTONCES** el usuario se crea con ambos campos asignados y persistidos
- **Y** se genera el token de Telegram y se envía la invitación con su respectivo tour de organización

### Escenario 1c: Rechazo de usuario Seccional sin Organización o Departamento
- **DADO** un usuario con rol `master` autenticado
- **CUANDO** envía `POST /api/users` para un `operador_org` omitiendo `organization_id` o `department_id`
- **ENTONCES** el sistema responde HTTP 400 Bad Request indicando que Organización y Departamento son requeridos para este rol

### Escenario 2: Vinculación exitosa de Telegram y recepción de Tour
- **DADO** un usuario con rol `operador_sistema` con un token de vinculación válido `xyz123token`
- **CUANDO** el usuario abre Telegram y envía `/start xyz123token` al bot oficial
- **ENTONCES** el sistema actualiza `users.telegram_chat_id` con el ID del chat de Telegram
- **Y** el token `xyz123token` se elimina de Redis
- **Y** el bot responde con la bienvenida y guía de Operador de Sistema

### Escenario 3: Token de Telegram expirado o inválido
- **DADO** un token `tokenExpirado` que no existe en Redis
- **CUANDO** un usuario envía `/start tokenExpirado` al bot
- **ENTONCES** el bot no modifica ninguna fila en `users`
- **Y** responde: "El enlace de activación ha expirado o no es válido. Ingresa a tu perfil en la plataforma para generar un nuevo enlace."
