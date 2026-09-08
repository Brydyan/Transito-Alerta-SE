# Spec: E2E — Usuario de pruebas y credenciales reales

## Domain: e2e-authentication (NEW)

### Requirement: Existe un usuario de pruebas dedicado
El seed DEBE poder crear `e2e@tase.local` con rol `operador_org` y la organización por
defecto, y NO DEBE crearlo con una contraseña conocida por el repositorio.

- Scenario: Sembrado — GIVEN `E2E_PASSWORD` definida THEN se crea `e2e@tase.local` con
  rol `operador_org` y `organization_id` de «CTE - Santa Elena»
- Scenario: Sin contraseña no se siembra — GIVEN `E2E_PASSWORD` ausente o vacía
  THEN el usuario e2e no se crea, y los seis usuarios de demo sí
- Scenario: Sin valor por defecto — GIVEN el código de `database/seeds/users.js`
  THEN no existe ninguna constante con una contraseña por defecto para el usuario e2e
- Scenario: Idempotente — GIVEN una segunda corrida del seed THEN no se duplica la fila
- Scenario: No es master — GIVEN el usuario e2e THEN su rol no es `master` ni
  `operador_sistema`: debe atravesar los guards de permiso como un usuario real
- Scenario: Los seis de demo intactos — GIVEN la siembra del usuario e2e THEN los seis
  usuarios existentes conservan su rol, organización y hash

### Requirement: Los specs toman las credenciales del entorno
Los specs e2e que inician sesión NO DEBEN contener credenciales literales.

- Scenario: Sin literales — GIVEN los archivos de `frontend/e2e/` THEN ninguno contiene
  un correo o contraseña embebidos como cadena
- Scenario: Login con las del entorno — GIVEN `E2E_USER` y `E2E_PASSWORD` definidas
  THEN los specs inician sesión con esos valores
- Scenario: Correo por defecto — GIVEN `E2E_USER` ausente pero `E2E_PASSWORD` presente
  THEN se usa `e2e@tase.local`. El correo no es un secreto; la contraseña sí

### Requirement: «No configurado» se salta; «configurado y roto» falla
La suite DEBE distinguir la ausencia deliberada de entorno de una configuración
incompleta.

- Scenario: Sin entorno — GIVEN `BASE_URL` ausente o vacía THEN los specs se saltan con
  un motivo que indica que hace falta un backend real
- Scenario: Configuración incompleta — GIVEN `BASE_URL` definida y `E2E_PASSWORD`
  ausente THEN la suite **falla** con un mensaje que nombra la variable que falta
- Scenario: No se salta por falta de secret — GIVEN ese mismo caso THEN el resultado no
  es «skipped»: una avería disfrazada de decisión es la falla que este requisito impide
- Scenario: Configuración completa — GIVEN `BASE_URL` y `E2E_PASSWORD` definidas
  THEN los specs se ejecutan de verdad y su resultado no es «skipped»

### Requirement: El login e2e funciona contra el backend real
Con el entorno configurado, el flujo de autenticación DEBE completarse.

- Scenario: Login correcto — GIVEN las credenciales del usuario e2e sembrado
  THEN la navegación llega al dashboard y la petición a `/api/auth/login` se realizó
- Scenario: Credenciales inválidas — GIVEN una contraseña incorrecta THEN se muestra el
  error y no se navega
- Scenario: Alcance de operador — GIVEN el usuario e2e navegando el menú THEN ve el
  subconjunto que corresponde a `operador_org`, no el del `master`

### Requirement: CI cachea los navegadores de Playwright
El job `frontend-e2e` DEBE reutilizar los navegadores descargados entre corridas.

- Scenario: Caché declarada — GIVEN el job THEN cachea `~/.cache/ms-playwright` con una
  clave que incluye el sistema operativo y el hash del lockfile
- Scenario: Acierto de caché — GIVEN una segunda corrida sin cambios en el lockfile
  THEN no se vuelve a descargar el navegador
- Scenario: Invalidación — GIVEN un cambio en `frontend/pnpm-lock.yaml` THEN la clave
  cambia y el navegador se descarga de nuevo

### Requirement: La corrida está acotada
La suite NO DEBE poder consumir el tiempo del job sin un techo propio.

- Scenario: Techo global — GIVEN la configuración en CI THEN declara un `globalTimeout`
- Scenario: Corte temprano — GIVEN 3 fallos en CI THEN la corrida se detiene sin
  completar el resto
- Scenario: En serie — GIVEN la ejecución en CI THEN usa un único worker: los specs
  comparten un staging real y en paralelo se pisarían
