# Technical Design: User Onboarding, Department Selection & Telegram Tour

## Architecture Decisions

### D1 — Persistencia y Reglas de Validación para Organización y Departamento
- **Decisión**: La columna `users.department_id` ya fue creada en la migración `0056_departments.sql` con clave foránea a `departments(id) ON DELETE SET NULL`.
- **Acción**: Se mapea la columna en TypeORM dentro de `UserEntity`:
  ```ts
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;
  ```
- **Reglas de Negocio en Backend (`UsersService.adminCreate` / DTO)**:
  - **Roles Globales (`master`, `operador_sistema`)**:
    - `organization_id: null` y `department_id: null`.
    - No se admiten ni exigen organizaciones ni departamentos.
  - **Roles Seccionales (`admin_org`, `operador_org`)**:
    - Ambos campos son obligatorios: `organization_id` y `department_id`.
    - Integridad relacional: Se valida que `department.organization_id === dto.organization_id`. Si no coinciden o falta alguno, retorna HTTP 400 Bad Request.

### D2 — Tokens de vinculación efímeros en Redis (Sin ensuciar PostgreSQL)
- **Decisión**: Los tokens de vinculación de Telegram son transitorios y de corta vida (24 horas). Almacenarlos en PostgreSQL crearía filas basura o exigiría cron jobs de limpieza.
- **Implementación**:
  - Llave Redis: `telegram:link:<token>`
  - Valor: `userId`
  - TTL: 86400 segundos (24 horas).
  - Formato de token: `crypto.randomBytes(24).toString('base64url')` (caracteres seguros para URLs de Telegram).
  - URL generada: `https://t.me/${botUsername}?start=${token}`.

### D3 — Ingestión de comandos Telegram (`/start <token>`)
- **Decisión**: Para recibir el comando cuando el usuario presiona "Iniciar" en el bot, se implementa un endpoint de Webhook oficial:
  - Ruta: `POST /api/telegram/webhook`
  - Seguridad: Cabecera `X-Telegram-Bot-Api-Secret-Token` validada contra `TELEGRAM_WEBHOOK_SECRET` de la configuración.
  - Soporte de desarrollo local: Servicio opcional `TelegramPollingService` activable mediante `TELEGRAM_POLLING=true` cuando no se dispone de HTTPS público o ngrok.

### D4 — Flujo de Procesamiento del Comando `/start`
```text
Usuario en Telegram pulsa "Iniciar" (envía /start <token>)
   ↓
Telegram API envía update a POST /api/telegram/webhook
   ↓
TelegramService extrae el token del texto (/start <token>)
   ├─ Si no hay token o no existe en Redis:
   │    └─ Responde: Mensaje de enlace expirado o inválido con sugerencia de login.
   │
   └─ Si el token existe en Redis:
        ├─ Resuelve userId = GET telegram:link:<token>
        ├─ DEL telegram:link:<token> (Consumido de inmediato)
        ├─ UPDATE users SET telegram_chat_id = msg.chat.id WHERE id = userId
        ├─ Lee rol del usuario desde la BD
        └─ Envía mensaje de bienvenida + Tour interactivo específico para ese rol
```

### D5 — Contenido del Tour por Rol Interno (`TOUR_PROFILES`)
El contenido de los mensajes de bienvenida se centraliza en un diccionario inmutable exclusivamente para personal interno:
- **`master`**:
  - Rol: *Administrador General del Sistema*.
  - Funciones clave: Configuración global, creación y supervisión de organizaciones/departamentos, auditoría y control de accesos.
- **`operador_sistema`**:
  - Rol: *Operador General del Sistema*.
  - Funciones clave: Operación transversal nacional, monitoreo de incidentes de todas las organizaciones en tiempo real y despacho global.
- **`admin_org`**:
  - Rol: *Administrador de Organización*.
  - Funciones clave: Supervisión de su jurisdicción, despacho y reasignación de incidentes `critical`, monitoreo de capacidad de operadores de sus departamentos y notificaciones de emergencia F7.
- **`operador_org`**:
  - Rol: *Operador de Campo / Atención*.
  - Funciones clave: Recepción de alertas de incidentes asignados en su organización/departamento vía Telegram, transición de estados (`in_progress` -> `resolved`), subida de notas y reportes fotográficos.

### D6 — Frontend: Integración en `NewUserFormComponent`
- `GET /api/users/form-data` ahora retorna `{ roles, organizations, departments }` donde cada departamento incluye `{ id, name, organization_id }`.
- `ROLES_REQUIRING_ORG_AND_DEPT = ['admin_org', 'operador_org']`.
- **Comportamiento reactivo**:
  - Si el rol seleccionado es `admin_org` u `operador_org`:
    - Se muestran los selectores de "Organización" y "Departamento". Ambos son obligatorios en `isFormValid()`.
    - Al seleccionar una organización, el selector de Departamento se filtra reactivamente con los departamentos cuyo `organization_id` coincida.
  - Si el rol es `master` u `operador_sistema`:
    - Los selectores de Organización y Departamento se ocultan o limpian (`organizationId = null`, `departmentId = null`).
- En la pantalla post-activación de contraseña o en el perfil de usuario de staff, si `telegram_chat_id` está vacío, se muestra un banner:
  - "📲 Conecta tu cuenta con Telegram para recibir alertas en tiempo real" con un botón de acción directa a `t.me/<bot>?start=<token>`.

### D7 — Aislamiento Arquitectónico del Flujo de Ciudadanos (Zero-Leakage)
- El flujo de alta ciudadana (`AuthRegisterService`, `POST /api/auth/register`) y verificación por código OTP (`EmailVerificationService`, `POST /api/auth/verify-email`) permanece 100% inalterado y aislado.
- Ningún usuario con rol `reporter` recibe tokens de Telegram, ni enlaces de bot, ni interactúa con este flujo administrativo.
- Telegram se mantiene estrictamente como canal de alerta y despacho operativo institucional interno.
