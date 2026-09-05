# Spec: REG — Auto-registro del ciudadano

## Domain: citizen-registration (NEW)

### Requirement: El auto-registro crea siempre un `reporter`
`POST /auth/register` DEBE crear una cuenta con el rol `reporter` y NO DEBE permitir que
la petición influya en el rol asignado.

- Scenario: Alta correcta — GIVEN una petición con correo, contraseña y nombre válidos
  THEN se crea el usuario con rol `reporter` y `email_verified_at` en nulo
- Scenario: Rol inyectado — GIVEN una petición que incluye `role: 'master'`
  THEN el usuario creado tiene rol `reporter`
- Scenario: Rol inyectado por otro nombre — GIVEN una petición con `roleName`,
  `role_id` o `permissions` THEN esos campos se ignoran y el usuario creado es `reporter`
- Scenario: Organización inyectada — GIVEN una petición con `organization_id`
  THEN se ignora: un ciudadano no pertenece a una organización
- Scenario: Permisos correctos — GIVEN el usuario recién creado THEN su
  `users.permissions` es la copia de `roles.permissions` de `reporter`, sin añadidos
- Scenario: Ya no es lápida — GIVEN `POST /auth/register` THEN no responde 410 Gone

### Requirement: La invitación sigue siendo el único camino al personal
El auto-registro NO DEBE poder producir ninguna cuenta con rol distinto de `reporter`.

- Scenario: Ningún rol de personal — GIVEN cualquier combinación de campos en la petición
  THEN no existe entrada que produzca `operador_org`, `admin_org`, `operador_sistema` ni
  `master`
- Scenario: El flujo de invitación intacto — GIVEN el alta por invitación
  THEN sigue funcionando y sigue siendo la vía para los roles de personal

### Requirement: Publicar exige correo verificado
Un `reporter` con `email_verified_at` en nulo DEBE poder entrar y leer, y NO DEBE poder
crear incidencias ni comentarios.

- Scenario: Entrar sin verificar — GIVEN un `reporter` no verificado THEN puede iniciar
  sesión y obtiene sus tokens
- Scenario: Leer sin verificar — GIVEN un `reporter` no verificado THEN puede consultar
  el feed y el detalle de incidencias
- Scenario: Publicar sin verificar — GIVEN un `reporter` no verificado que crea una
  incidencia THEN se rechaza con 403 y un motivo que indica que falta verificar el correo
- Scenario: Comentar sin verificar — GIVEN un `reporter` no verificado que crea un
  comentario THEN se rechaza con 403
- Scenario: Publicar tras verificar — GIVEN un `reporter` que completa el OTP
  THEN `email_verified_at` queda establecido y puede crear incidencias y comentarios
- Scenario: El personal no se ve afectado — GIVEN un `operador_org` o `admin_org`
  THEN esta restricción no aplica: su alta la respalda una invitación

### Requirement: El alta no revela si un correo ya está registrado
La respuesta a un correo ya existente DEBE ser indistinguible de la respuesta a uno nuevo.

- Scenario: Correo nuevo — GIVEN un correo sin cuenta THEN la respuesta indica que se
  envió un correo de verificación
- Scenario: Correo existente — GIVEN un correo con cuenta THEN la respuesta es idéntica
  en código de estado, cuerpo y forma a la del correo nuevo
- Scenario: Sin cuenta duplicada — GIVEN un correo con cuenta THEN no se crea una segunda
  cuenta ni se modifica la existente
- Scenario: Aviso al titular — GIVEN un correo con cuenta THEN su titular recibe un aviso
  de intento de alta, no un código de verificación
- Scenario: Tiempos comparables — GIVEN ambos casos THEN la diferencia de tiempo de
  respuesta no permite distinguirlos

### Requirement: El alta está limitada en tasa
El endpoint DEBE limitar los intentos por IP y por correo.

- Scenario: Ráfaga desde una IP — GIVEN más altas desde una misma IP que el límite
  configurado en su ventana THEN las siguientes se rechazan con 429
- Scenario: Insistencia sobre un correo — GIVEN varios intentos sobre el mismo correo
  THEN se rechazan con 429 aunque provengan de IP distintas
- Scenario: Ciudadano legítimo — GIVEN un alta aislada THEN no se ve afectada

### Requirement: El ciudadano tiene una pantalla de registro
La aplicación DEBE ofrecer `/registro`, pública, y enlazarla desde los dos puntos donde
el ciudadano la necesita.

- Scenario: Ruta pública — GIVEN un visitante sin sesión que navega a `/registro`
  THEN ve el formulario y no se le redirige al login
- Scenario: Enlace desde el login — GIVEN la pantalla de login THEN ofrece un enlace a
  `/registro`
- Scenario: Enlace tras reportar — GIVEN el final del asistente de reporte usado sin
  cuenta THEN se ofrece registrarse o iniciar sesión (cierra F4/B.2.12)
- Scenario: Al OTP — GIVEN un alta correcta THEN se navega al componente `verify-email`
  existente
- Scenario: Sin filtrar existencia — GIVEN un correo ya registrado THEN la pantalla
  muestra el mismo mensaje que ante uno nuevo
- Scenario: Errores de validación — GIVEN correo inválido o contraseña que no cumple la
  política THEN el formulario los señala sin llamar al servidor
