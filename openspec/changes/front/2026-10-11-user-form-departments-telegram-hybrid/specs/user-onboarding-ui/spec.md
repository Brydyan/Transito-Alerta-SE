# Specification: User Form Departments & Hybrid Telegram Linking

## Requirements (EARS)

### R1 — Catálogo y Filtrado Reactivo de Departamentos en Frontend
- **Evento**: CUANDO el componente `NewUserFormComponent` inicia, el servicio `UsersService.getFormData()` DEBE retornar la lista completa de departamentos `{ id, nombre, organizationId }` provista por el backend.
- **Invariante**: MIENTRAS el selector de organización no tenga un valor seleccionado (`organizationId === null`), el selector de departamentos DEBE permanecer deshabilitado y vacío.
- **Evento**: CUANDO el usuario selecciona una organización, el selector de departamentos DEBE mostrar únicamente aquellos departamentos donde `department.organizationId === selectedOrgId`.
- **Evento**: CUANDO la organización seleccionada cambia o se deselecciona, el sistema DEBE resetear el valor de `departmentId` a `null` de forma inmediata.

### R2 — Validación Condicional de Creación por Rol en Formulario
- **Ubicuo**: Para los roles seccionales `admin_org` y `operador_org`, el formulario DEBE requerir obligatoriamente `organizationId` y `departmentId` para considerar el estado válido (`isFormValid === true`).
- **Ubicuo**: Para los roles globales `master` y `operador_sistema`, el formulario NO DEBE requerir `organizationId` ni `departmentId`, y la interfaz DEBE ocultar o deshabilitar la sección de entidad persistiendo ambos como `null`.
- **Evento**: CUANDO el usuario presiona "Guardar" y el formulario es válido, la llamada `createUserJson` DEBE incluir `department_id: d.departmentId` dentro del payload JSON enviado a `POST /api/users`.

### R3 — Generación Segura de Token de Telegram a Demanda (Backend)
- **Evento**: CUANDO un usuario con sesión activa y rol de personal interno (`master`, `operador_sistema`, `admin_org`, `operador_org`) invoca `POST /api/users/me/telegram-link`, el sistema DEBE generar un nuevo token seguro de 24 horas en Redis y responder con la URL en formato `https://t.me/<BOT_USERNAME>?start=<token>`.
- **No deseado**: SI un usuario con rol `reporter` (ciudadano) o no autenticado intenta acceder a `POST /api/users/me/telegram-link`, ENTONCES el sistema DEBE denegar el acceso con HTTP 403 Forbidden o 401 Unauthorized.
- **Invariante**: La generación de tokens a demanda DEBE mantener idempotencia operativa; si ya existe un token previo sin consumir, se genera uno nuevo reemplazando la referencia o extendiendo su validez.

### R4 — Estado y Acción de Vinculación en Perfil de Usuario (Frontend)
- **Estado**: MIENTRAS un usuario de personal interno autenticado visualiza su perfil en `/app/perfil`:
  - SI `telegram_chat_id` está presente en su perfil, el componente `ProfileActionCardsComponent` DEBE mostrar el estado `"Vinculado"` con indicador visual positivo y opción de re-vincular.
  - SI `telegram_chat_id` es nulo o indefinido, el componente DEBE mostrar el estado `"No vinculado"` y presentar un botón de acción destacada `"Vincular Telegram"`.
- **Evento**: CUANDO el usuario presiona el botón `"Vincular Telegram"` o `"Re-vincular"`, el sistema DEBE invocar el servicio de generación de enlace, recibir la URL y abrirla en una nueva pestaña del navegador para interactuar con el bot.

---

## Scenarios

### Escenario 1: Creación exitosa de usuario seccional con departamento
- **DADO** un administrador autenticado en la pantalla de creación de usuarios
- **Y** que ha completado nombres, apellidos y correo válidos
- **CUANDO** selecciona el rol `admin_org`
- **ENTONCES** los campos Organización y Departamento muestran indicador de obligatoriedad (`*`)
- **Y** el formulario permanece inválido (`isFormValid === false`) hasta que selecciona una organización y un departamento válido de la lista
- **CUANDO** presiona "Guardar"
- **ENTONCES** `POST /api/users` se invoca con `{ ..., "role_id": "...", "organization_id": "org-1", "department_id": "dept-1" }`
- **Y** el backend responde con HTTP 201 Created.

### Escenario 2: Reseteo automático de departamento al cambiar organización
- **DADO** un usuario completando el formulario con Organización "GAD Central" y Departamento "Tránsito y Vialidad"
- **CUANDO** el usuario cambia la Organización a "Policía Nacional"
- **ENTONCES** el campo Departamento se resetea automáticamente a `null`
- **Y** el menú desplegable de departamentos se actualiza para mostrar únicamente las dependencias de "Policía Nacional".

### Escenario 3: Creación de usuario global sin sección de entidad
- **DADO** un administrador en el formulario de creación
- **CUANDO** selecciona el rol `master` u `operador_sistema`
- **ENTONCES** la Sección de Asignación de Entidad se oculta o deshabilita visualmente
- **Y** el formulario es válido sin necesidad de ingresar organización ni departamento
- **Y** al guardar, el payload envía `organization_id: null` y `department_id: null`.

### Escenario 4: Personal interno genera enlace de Telegram desde su Perfil
- **DADO** un usuario con rol `operador_org` autenticado en `/app/perfil` sin cuenta de Telegram vinculada
- **CUANDO** observa la sección de acciones de perfil
- **ENTONCES** visualiza la tarjeta "Notificaciones Telegram" con estado "No vinculado"
- **CUANDO** presiona "Vincular Telegram"
- **ENTONCES** se dispara `POST /api/users/me/telegram-link`
- **Y** el navegador abre la URL `https://t.me/<BOT_USERNAME>?start=<token>` para interactuar con el bot.

### Escenario 5: Rechazo de generación de enlace para usuarios ciudadanos
- **DADO** un usuario autenticado con rol `reporter` (ciudadano)
- **CUANDO** intenta ejecutar `POST /api/users/me/telegram-link`
- **ENTONCES** el backend rechaza la petición con HTTP 403 Forbidden.
