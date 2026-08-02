# 09 — Registro de usuarios + Login con Google (Firebase)

**Tipo:** Feature
**Severidad:** 🟠 Media (expande el funnel de adopción — hoy el único alta de usuario ciudadano es vía seeder/admin)
**Backend:** ❌ No existe endpoint de registro · **Frontend:** ❌ Solo login, sin alta de cuenta
**Estado:** ❌ No implementado — este doc es el plan, para delegar a otro agente

> Este documento es un plan de implementación, no una implementación. Está pensado para
> entregarse a un agente (u otra persona) que lo ejecute. No asume qué agente lo va a
> correr ni en cuántas sesiones — divide el trabajo en unidades verificables.

## Problema

Hoy la única forma de crear un usuario es que un `admin_sistema`/`admin_organizacion` lo
dé de alta desde `/usuarios`, o vía seeder. No hay autoservicio: un ciudadano que quiere
reportar una incidencia no tiene forma de crear su propia cuenta. Se pide:

1. Un apartado de **registro** en la pantalla de login — datos básicos, contraseña
   ingresada dos veces, con longitud mínima.
2. **Iniciar sesión con Google**, vía Firebase Authentication, como alternativa al
   login con email/contraseña.

## Estado actual (verificado en este repo, no supuesto)

**Backend** (`backend/app/Domains/Auth/`):
- `AuthController.php` expone `POST /login`, `POST /auth/refresh`, `POST /logout`,
  `GET /me`, `PUT /auth/profile`. **No existe ninguna acción de registro** — grep de
  `register` en todo `backend/app` y `backend/routes` no da ningún endpoint propio.
- `AuthService::login()` (`AuthService.php:26`): busca `User::where('email', ...)`,
  `Hash::check`, emite access+refresh JWT vía `JwtService`, crea fila en `Session`
  (uuid, refresh token hasheado, ip/ua, expiración).
- Login devuelve: `access_token` en el body JSON (900s TTL), cookie `refresh_token`
  httpOnly (path `/api/auth`, 30d, `SameSite=Strict`), y la cookie `mercureAuthorization`
  agregada esta sesión (path raíz, JWT con claim `mercure.subscribe` por usuario).
- `JwtService`: HMAC-SHA256, secrets de access/refresh separados (`config('jwt.*')`),
  claims solo `sub` (user id), `sid` (session id), `email` — **no lleva rol/permisos en
  el token**, se resuelven server-side en cada request.
- `LoginRequest.php`: validación mínima, `email: required|email`, `password:
  required|string`, sin mensajes custom.

**Modelo `User`** (`backend/database/migrations/0001_01_01_000000_create_users_table.php:21-32`):
- `role_id` es `foreignId()->constrained()->cascadeOnDelete()` — **obligatorio, no
  nullable**. Cualquier registro público necesita un rol por default.
- `organization_id` no está en esta migración (se agregó después), es nullable.
- Columnas: `email` (unique), `password` (cast `'hashed'`, Eloquent hace `Hash::make`
  solo), `first_name`/`last_name`/`phone` (nullable), `avatar` (jsonb, nullable).
- `RoleSeeder.php`: roles fijos por id — `1 admin_sistema, 2 operador_sistema,
  3 admin_organizacion, 4 operador_organizacion, 5 usuario`. El rol **`5 "usuario"`**
  es el ciudadano llano (`User::isRegularUser()` lo chequea) — es el default obvio
  para autorregistro.

**Estilo de validación de la casa** (`StoreUserRequest.php:46-67`, referencia — no es
el registro público, pero fija el patrón a imitar): `'password' =>
'nullable|string|min:8'` con mensaje en español `'password.min' => 'La contraseña
debe tener al menos 8 caracteres'`. `email` usa `unique:users,email`. No se usa
`Password::min()->...` de Laravel (las reglas fluent), se usa el string plano.

**Frontend** (`frontend/app/auth/`):
- `pages/login/login.component.js`: vanilla JS, patrón `templateUrl`/`styleUrl`,
  `onInit()` cablea `form.addEventListener('submit', ...)` a mano, valida con
  `trim()` no vacío inline (sin librería de validación), usa un `#login-error` para
  mostrar errores y deshabilita/anima el botón de submit durante el request. Al
  loguear, llama `auth.me()` (el rol NO viaja en la respuesta de login, es a
  propósito — hay un comentario explicando el motivo de seguridad) y navega según
  rol.
- `auth.service.js`: `login()` hace `POST /login`, guarda el access token en memoria
  del módulo `http.service.js` (**no** `localStorage`), dispara
  `_notifyAuthChange()`. **No existe** método de registro ni de login con proveedor
  externo.
- Patrón de lazy-load de librería externa ya existe: `frontend/app/shared/leaflet.js`
  carga Leaflet 1.9.4 desde CDN y cachea la promesa — es el precedente a imitar para
  cargar el SDK de Firebase sin agregar un paso de build (el repo es vanilla JS puro,
  sin bundler).

**Firebase/Google**: cero — no hay ninguna mención de `firebase`/`google` en
`backend/composer.json` ni `frontend/package.json`. Tampoco existe `.env.example` en
el repo (gap aparte, no bloqueante para este plan, pero el agente que ejecute esto
debería crear uno si va a agregar variables de entorno nuevas).

**CORS** (`backend/config/cors.php:19,29`): `supports_credentials: true`,
`allowed_origins` viene de `CORS_ALLOWED_ORIGINS` (lista explícita, no wildcard). El
flujo de Firebase JS SDK (popup) habla directo con los servidores de Google desde el
browser — el browser permite eso sin que nuestro CORS intervenga. Lo único que pasa
por **nuestro** backend es el POST final con el ID token verificado. Conclusión:
probablemente **no** hace falta tocar `cors.php` para esto — confirmarlo al
implementar, no asumirlo.

## Decisiones de diseño que hay que tomar ANTES de implementar

Estas no las resolví yo — quedan para quien ejecute el plan, idealmente confirmando
con el usuario/dueño del producto antes de escribir código:

1. **¿Auto-login después de registrarse, o redirect a login con mensaje de éxito?**
   El patrón más común es auto-login (mejor UX, menos fricción). Recomendado, pero
   confirmar.
2. **¿Qué pasa si alguien se registra con email/contraseña y después intenta
   "Iniciar sesión con Google" con el mismo email?** Opciones: (a) vincular
   automáticamente si Firebase confirma `email_verified: true`, (b) rechazar y pedir
   que use el método original. (a) es más cómodo pero hay que ser explícito de que
   **solo** se vincula si el email está verificado por Google — nunca confiar en un
   email no verificado para fusionar cuentas.
3. **¿Se requiere verificación de email para el registro con contraseña?** Hoy no hay
   infraestructura de verificación de email en el proyecto (no hay tabla ni mailer
   configurado para esto, no confirmado pero no visto en la investigación). Si se
   pide, es un sub-scope grande (mailer, tabla de tokens, ruta de confirmación) —
   dejarlo **fuera de este plan** salvo que se pida explícitamente, y documentarlo
   como riesgo de seguridad aceptado (cuentas no verificadas pueden loguear
   inmediatamente).
4. **¿El registro es una vista separada (`/registro`) o un toggle dentro de
   `/login`?** El pedido original dice "un apartado en el login", lo que sugiere
   toggle/tab dentro del mismo componente. Recomendado por consistencia con "no
   sobreingeniería" ya establecido en este proyecto — evita duplicar el layout de
   login. A confirmar con el usuario si prefiere ruta separada.
5. **SDK de Firebase: ¿CDN (ESM) o paquete npm?** El repo no tiene build step
   (`frontend/package.json` solo tiene `eslint`/`prettier`/`vitest`, nada de
   bundler). Instalar `firebase` vía npm sin un bundler obliga a resolver imports a
   mano o servir desde `node_modules` — no es el patrón de este proyecto. Recomendado:
   cargar el SDK modular de Firebase (v9+, `firebase/app` + `firebase/auth`) desde su
   CDN oficial (`https://www.gstatic.com/firebasejs/.../firebase-auth.js`, versión
   ESM), mirando el lazy-loader de `leaflet.js` como precedente. A confirmar.

## Alcance

### Backend

- [ ] **Registro por email/contraseña**
  - [ ] `RegisterRequest` (FormRequest): `first_name`/`last_name` requeridos,
    `email` requerido + `unique:users,email`, `phone` opcional, `password`
    requerido + `min:8` (o la política mínima que se decida) + confirmado
    (`confirmed` de Laravel, que compara contra `password_confirmation`
    automáticamente — evita reinventar la comparación a mano). Mensajes en
    español, mismo estilo que `StoreUserRequest.php:46-67`.
  - [ ] `AuthController::register()` (o un `RegisterController` separado si el
    primero queda muy cargado — decisión del ejecutor): crea el `User` con
    `role_id = 5` (usuario/citizen, fijo — no debe ser parametrizable desde el
    payload del cliente, por seguridad), reutiliza el mismo flujo de emisión de
    tokens/cookies que `login()` si se decidió auto-login (punto 1 de decisiones).
  - [ ] Ruta pública `POST /register` (fuera del grupo `middleware('jwt')`, igual
    que `/login`).
  - [ ] **Rate limiting**: `throttle:register` (o reusar `throttle:feed` como
    referencia de sintaxis) — sin esto, el endpoint es un vector de spam de
    cuentas. No opcional.
  - [ ] Tests: registro exitoso, email duplicado (409/422), contraseñas que no
    coinciden, contraseña corta, rol siempre `5` sin importar qué mande el
    cliente en el payload (test de seguridad explícito — alguien podría intentar
    mandar `role_id: 1` en el body).

- [ ] **Login con Google/Firebase**
  - [ ] Elegir e instalar SDK de verificación server-side. Opción estándar:
    `kreait/firebase-php` (Firebase Admin SDK no oficial pero el más usado en
    Laravel) — verificar versión compatible con la versión de PHP/Laravel de
    este proyecto antes de fijarla en `composer.json`.
  - [ ] `POST /auth/google` (nombre a confirmar): recibe el **ID token** que el
    frontend obtuvo de Firebase (nunca el email/nombre sueltos — siempre el
    token firmado), lo verifica server-side contra el proyecto de Firebase
    (issuer, audience, firma, expiración — todo esto lo hace el SDK, no
    reinventarlo), extrae `email`, `email_verified`, `name`, `picture` del
    token verificado.
  - [ ] Find-or-create: si existe un `User` con ese email, decidir según el
    punto 2 de decisiones (vincular solo si `email_verified === true`). Si no
    existe, crear con `role_id = 5`, sin `password` utilizable (o un password
    random inutilizable, para que ese usuario no pueda loguear con
    email/contraseña por accidente — a decidir el mecanismo exacto).
  - [ ] Reusar el mismo flujo de emisión de tokens/cookies/sesión que
    `AuthService::login()` — **no** duplicar esa lógica, extraerla a un método
    compartido si hace falta (`AuthService::issueSession(User $user)` o similar).
  - [ ] Variables de entorno nuevas: credenciales de service account de Firebase
    (JSON o variables sueltas, según lo que pida `kreait/firebase-php`),
    `FIREBASE_PROJECT_ID`. Documentar en un `.env.example` (crearlo si no
    existe — confirmado que no existe en el repo).
  - [ ] Tests: token válido con email nuevo (crea usuario), token válido con
    email existente y verificado (vincula/loguea), token con email existente
    pero NO verificado (rechaza — test de seguridad explícito), token inválido
    o expirado (401).

### Frontend

- [ ] **Formulario de registro** en/junto a `login.component.js` (según se
  resuelva el punto 4 de decisiones):
  - Campos: nombre, apellido, email, teléfono (opcional), contraseña,
    confirmar contraseña.
  - Validación cliente antes de mandar el POST: contraseñas coinciden, longitud
    mínima — mismo estilo inline que ya usa `login.component.js` (sin librería
    de validación nueva).
  - Mensaje de error visible (`#register-error` o similar, mismo patrón que
    `#login-error`), botón deshabilitado + spinner durante el request, mismo
    patrón que el login existente.
  - `auth.service.js`: nuevo método `register(payload)` que haga `POST
    /register`, mismo manejo de errores que `login()`.

- [ ] **Botón "Iniciar sesión con Google"**:
  - Cargar el SDK de Firebase (`firebase/app` + `firebase/auth`) de forma lazy,
    mirando `frontend/app/shared/leaflet.js` como precedente de lazy-loader
    con promesa cacheada.
  - Nuevo `frontend/app/shared/firebase.config.js` (o similar) con la config
    pública del proyecto Firebase (`apiKey`, `authDomain`, `projectId` — estos
    son públicos por diseño en Firebase, no son secretos, pueden vivir en el
    bundle frontend sin problema; lo que NO debe estar en el frontend es la
    service account key del backend).
  - `signInWithPopup(auth, new GoogleAuthProvider())` → obtener `idToken` →
    `POST /auth/google` con ese token → mismo manejo de respuesta que
    `auth.service.js::login()` (guardar token, `auth.me()`, redirect por rol).
  - Manejar el caso de popup cerrado/cancelado por el usuario sin mostrarlo
    como error genérico.

## Consideraciones de seguridad (no negociables)

- **Nunca confiar en datos del cliente para determinar el rol.** El `role_id`
  de un usuario autorregistrado (por cualquiera de los dos métodos) es
  **siempre** `5`, hardcodeado server-side. No debe poder venir del payload.
- **El ID token de Google se verifica siempre server-side.** El frontend nunca
  decide "este usuario está autenticado" — solo el backend, después de
  verificar la firma del token contra Firebase.
- **Vinculación de cuentas por email solo si `email_verified: true`** en el
  token de Firebase. Si no, tratar como cuenta separada o rechazar
  explícitamente (no fusionar en silencio).
- **Rate limiting en `/register`** — sin esto es un vector de abuso trivial.
- Revisar si `/auth/google` necesita su propio rate limit también (menos
  crítico que `/register` porque requiere un token válido de Google primero,
  pero no gratis).

## Criterios de aceptación

- [ ] Un usuario nuevo puede registrarse desde la pantalla de login con
  nombre, apellido, email, contraseña (dos veces, con mínimo de caracteres) y
  queda con rol `usuario`.
- [ ] Intentar registrar un email ya existente da un error claro, no un 500.
- [ ] Las contraseñas que no coinciden se rechazan con mensaje claro antes de
  llegar al backend (validación cliente) y también si se saltea el cliente
  (validación servidor).
- [ ] Un usuario puede loguearse con "Iniciar sesión con Google" y termina
  autenticado en el sistema con una sesión igual de válida que un login
  normal (mismos cookies, mismo JWT, mismo flujo post-login).
- [ ] El rol de un usuario creado por cualquiera de los dos métodos es
  siempre `usuario` (rol 5), verificado con un test que intente forzarlo desde
  el cliente.
- [ ] Suite de tests backend completa sigue en verde (era 199/214, 15 skip al
  momento de escribir este plan).
- [ ] Verificación manual end-to-end (no solo tests) de ambos flujos contra el
  stack real (`docker compose`), igual que se hizo para las features
  anteriores de esta sesión — no dar por terminado solo con tests en verde.

## Fuera de alcance (explícito)

- Verificación de email para registro con contraseña (ver decisión #3).
- Recuperación de contraseña ("¿olvidaste tu contraseña?" ya existe como link
  en el login pero no está implementado — es un `javascript:void(0)`, es un
  gap preexistente, no de este plan).
- Otros proveedores OAuth (Facebook, Apple, etc.) — solo Google/Firebase por
  ahora.
- Migrar el login existente a Firebase — el login email/contraseña actual
  **se mantiene tal cual**, Google es un método adicional, no un reemplazo.
