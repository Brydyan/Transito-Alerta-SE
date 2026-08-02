# 10 — Enforcement real de permisos en rutas del frontend

**Tipo:** Seguridad / Deuda de arquitectura
**Severidad:** 🟡 Media (los datos están protegidos por el backend; el gap es de UX/superficie, no de fuga de datos — con una excepción real, ver abajo)
**Backend:** ⚠️ Mayormente correcto, un gap confirmado + 5 controllers sin auditar · **Frontend:** ❌ No existe enforcement de rutas por permiso
**Estado:** ❌ No implementado — este doc es el plan, para delegar a otro agente

> Plan de implementación, no implementación. Basado en una auditoría real del código
> (no supuestos) hecha en esta sesión. Cada afirmación cita archivo:línea.

## Problema

El usuario reportó: *"de acuerdo al rol, al permiso y el permiso al menú no
deberíamos ver ni tener acceso a ciertos menús del frontend"*. La auditoría confirma
que esto es cierto **a nivel de navegación**, aunque **no** a nivel de datos (el
backend sí protege los datos en los 5 recursos que usan `authorizeResource`). Hay dos
problemas distintos, de severidad distinta, que no hay que confundir:

1. **Frontend**: cualquier usuario autenticado puede navegar a `#/usuarios`,
   `#/roles`, `#/organizaciones`, etc. tipeando la URL, sin importar su rol. La
   página monta completa (shell + componente), y solo falla cuando el componente
   pega al backend y recibe un 403 — que además se muestra como un error genérico,
   no como "no tenés acceso". Es un problema de UX/superficie, no de fuga de datos,
   **para los recursos que el backend protege correctamente**.
2. **Backend**: `RoleController::availablePermissions` (`GET /api/permissions`) no
   tiene NINGÚN chequeo de autorización — cualquier usuario autenticado, incluido un
   ciudadano recién registrado por Google, puede listar **todos los permisos del
   sistema**. Esto sí es una fuga de datos real (baja severidad — es metadata, no
   PII ni datos de negocio, pero es information disclosure real). Y hay 5
   controllers sin auditar todavía (ver más abajo) que podrían tener el mismo
   problema.

## Estado actual (verificado, no supuesto)

### Frontend — rutas y guards (`frontend/app/app.js`)

Cada `router.addRoute(path, component, guards, roleTag)` registrado:

| Rutas | Guards | Role tag |
|---|---|---|
| `/feed`, `/feed/crear`, `/feed/:id` | `[authGuard]` | `'citizen'` |
| `/configuracion/perfil` | `[authGuard]` | `'both'` |
| `/dashboard`, `/incidencias`, `/incidencias/crear`, `/incidencias/:id`, `/mapa`, `/usuarios`, `/usuarios/crear`, `/organizaciones`, `/organizaciones/crear`, `/localizaciones`, `/localizaciones/crear`, `/categorias`, `/categorias/crear` | **`[]`** | `'admin'` |
| `/mapa-ciudadano` | `[authGuard]` | `'citizen'` |
| `/roles`, `/roles/:id` | `[roleGuard(['admin_sistema'])]` | `'admin'` |
| `/notificaciones` | `[authGuard]` | `'admin'` |

**13 rutas de back-office tienen `guards: []`** — ningún guard corre antes de
montarlas.

`frontend/app/core/router.js::resolve()` — el 4º argumento (`role`) se usa
**solamente** para elegir el outlet de render (`isFullPage = route.role ===
undefined`) y se pasa como `ctx.role` al componente. **Nunca se compara contra el
rol real del usuario logueado.** Es metadata de layout, no un guard.

`authGuard` (`frontend/app/auth/auth.guard.js`): solo verifica que exista un access
token — cualquier usuario autenticado pasa, sin importar el rol.

`roleGuard(allowedRoles)` (`frontend/app/auth/role.guard.js:16-43`): compara
`resolveRoleName(user)` contra un array hardcodeado de nombres de rol. Es el único
guard con algo de granularidad, y solo está en 2 de ~20 rutas protegidas (`/roles`).
Compara por **nombre de rol**, no por permiso — no usa el sistema
`role_permission`/`menu_permission` que ya existe y que `GET /api/menus/my` sí
respeta correctamente.

**Consecuencia concreta**: un ciudadano (`usuario`) logueado por Google puede
tipear `#/usuarios` en la barra de direcciones. El router monta la página completa
(shell + `usuarios.index.component.js`). Recién ahí el componente pega a `GET
/api/users`, que el backend rechaza con 403 (`UserPolicy::viewAny` — ver abajo). El
componente muestra un estado de error genérico (`catch { mostrarEstado('error') }`,
sin distinguir 401/403 de una falla de red) — no hay redirect a "no autorizado", el
usuario ve el cascarón de una página de admin con un mensaje de error ambiguo.

### Backend — autorización por endpoint (`backend/routes/api.php`)

Dentro del grupo `middleware('jwt')`, solo 2 rutas declaran `middleware('can:...')`
a nivel de ruta (`incidents/{incident}/claim` y `.../release`). El resto —
`apiResource('users', ...)`, `apiResource('roles', ...)`, `apiResource('organizations',
...)`, `apiResource('locations', ...)`, `apiResource('incident-categories', ...)`,
`roles/{role}/permissions`, `permissions`, `menus/my`, todo `notifications/*` — no
tiene autorización visible a nivel de ruta.

**Pero** revisando los controllers directamente: `UserController`,
`RoleController` (para el CRUD de roles, no para `availablePermissions`),
`OrganizationController`, `LocationController`, `IncidentCategoryController`
llaman `$this->authorizeResource(Model::class, 'param')` en el constructor. Esto
engancha las Policies de Laravel automáticamente para cada acción resourceful. Sus
Policies extienden `PermissionPolicy`
(`backend/app/Domains/Shared/Http/Policies/PermissionPolicy.php`), cuyo
`viewAny`/`view`/`create`/`update`/`delete` por default chequean
`$user->can("{resource}.{action}")` — un gate real contra `role_permission`.
`UserPolicy` además agrega scoping por organización en `view`/`update`/`delete`.

**Conclusión: estos 5 recursos están correctamente protegidos en el backend.** El
problema del frontend (sección anterior) no filtra datos para ellos — solo permite
que la UI intente y falle.

**Gaps confirmados en el backend:**

- `RoleController::availablePermissions` (línea 109) — **sin ningún chequeo de
  autorización**. Cualquier JWT válido, de cualquier rol, puede `GET
  /api/permissions` y enumerar el catálogo completo de permisos del sistema.
- `RoleController::syncPermissions` (líneas 82-90) — usa un chequeo manual
  `isSystemAdmin()` en vez de una Policy. Funciona, pero es inconsistente con el
  patrón del resto del código (deuda de estilo, no vulnerabilidad).
- **Sin auditar en esta pasada** (no confirmado seguro, no confirmado vulnerable —
  directamente no se llegó a revisar por presupuesto de tiempo de la investigación):
  `IncidentController`, `CommentController`, `NotificationController`,
  `StatusHistoryController`, `OperatorLocationController`. Cualquier plan de
  implementación debe auditar estos 5 antes de darlos por buenos.

### El mapeo permiso→menú ya funciona bien

`GET /api/menus/my` (confirmado con los tests de `MenuApiTest.php` de esta misma
sesión) filtra correctamente según `role_permission` real del usuario — un
`usuario` no ve "Usuarios"/"Roles", un `operador_organizacion` tampoco, etc. **Esta
parte no es el problema** — el dato de "qué puede ver este usuario" ya existe y es
correcto, el problema es que el router del frontend no lo usa para bloquear
navegación directa, solo lo usa `app-shell.component.js` para decidir qué *mostrar*
en el sidebar.

## Decisiones de diseño para quien implemente

1. **Fuente de verdad para el guard del frontend**: no inventar un segundo sistema
   de permisos en el cliente. La opción más simple y consistente con "no
   sobreingeniería": reusar la respuesta de `GET /api/menus/my` (ya cacheada por
   `menuService`, ya trae `route` + de qué permiso depende cada item) como la lista
   de rutas permitidas, y que el guard compare `path` actual contra esa lista
   aplanada. Alternativa más granular pero más trabajo: exponer un endpoint nuevo
   `GET /api/permissions/my` con la lista de permisos crudos (`resource.action`) del
   usuario, y taggear cada `router.addRoute()` con el permiso que requiere (mismo
   par `resource`/`action` que ya usa `MenuSeeder`). Recomendado: empezar con la
   opción del menú (cero endpoints nuevos), migrar a permisos crudos solo si
   aparece una ruta protegida que no tiene entrada de menú.
2. **Qué hacer cuando el guard bloquea**: ¿redirect a `/not-found` (ya existe y se
   usa para 404s), a `/dashboard`, o un `/no-autorizado` nuevo con mensaje
   explícito? Recomendado: `/not-found` reusa lo que ya existe — no revela "esta
   ruta existe pero no es para vos", que es marginalmente mejor por seguridad
   (no confirma la existencia de la ruta a quien no debería verla).
3. **¿Se arregla `RoleController::availablePermissions` en el mismo cambio o
   aparte?** Es un fix de una línea (agregar `$this->authorize(...)` o una
   Policy), no depende de nada del trabajo de frontend. Recomendado: arreglarlo
   primero y aparte, es trivial y ya está confirmado como bug real.
4. **¿Se completa la auditoría de los 5 controllers no revisados antes o después
   del fix de frontend?** Recomendado: antes, o en paralelo — si alguno de esos
   5 tiene el mismo gap que `availablePermissions`, un guard de frontend nuevo le
   daría una falsa sensación de seguridad sin arreglar el problema real (los datos
   seguirían expuestos a quien pegue directo a la API).

## Alcance

### Backend

- [ ] **Fix inmediato**: agregar autorización a `RoleController::availablePermissions`
  — a definir si es `$user->can('roles.view')` (reusa el permiso existente del
  recurso "roles") o uno nuevo `permissions.view`. Test que confirme 403 para un
  rol sin ese permiso.
- [ ] **Auditar** `IncidentController`, `CommentController`,
  `NotificationController`, `StatusHistoryController`, `OperatorLocationController`
  — confirmar si cada acción sensible tiene autorización real (Policy,
  `$this->authorize()`, o un chequeo manual equivalente) o si son otro caso como
  `availablePermissions`. Documentar el resultado, arreglar lo que falte.
- [ ] Uniformar `RoleController::syncPermissions` al patrón de Policy si se decide
  que vale la pena (deuda de estilo, no urgente).

### Frontend

- [ ] Definir el guard genérico (`permissionGuard` o reusar/extender `roleGuard`)
  según la decisión de diseño #1 — compara la ruta actual contra lo que
  `GET /api/menus/my` ya resolvió para el usuario.
- [ ] Aplicar el guard a las 13 rutas de back-office que hoy tienen `guards: []`
  en `app.js`, y también a `/roles` (reemplazando o complementando el
  `roleGuard(['admin_sistema'])` actual, que es por nombre de rol fijo, no por
  permiso — revisar si conviene mantenerlo como caso especial o migrarlo también).
- [ ] Redirect consistente cuando el guard bloquea, según decisión #2.
- [ ] Mejorar el manejo de error en los componentes que hoy muestran un catch
  genérico (`usuarios.index.component.js` fue el caso confirmado, probablemente
  hay otros con el mismo patrón) — al menos distinguir 403 de una falla de red,
  aunque el guard nuevo debería hacer que este caso ya no ocurra en el flujo
  normal (solo quedaría como defensa en profundidad).

### Tests

- [ ] Backend: test de `availablePermissions` rechazando un rol sin permiso.
- [ ] Backend: tests de autorización para cada uno de los 5 controllers auditados,
  según lo que se encuentre.
- [ ] Frontend: test del guard nuevo — un usuario sin el permiso/menú
  correspondiente no puede montar la ruta protegida, es redirigido.
- [ ] Verificación manual end-to-end (no solo tests) con al menos 2 roles
  distintos (`usuario` y `operador_organizacion`) contra el stack real, mismo
  criterio que se usó en el resto de esta sesión — no dar por cerrado solo con
  tests en verde.

## Criterios de aceptación

- [ ] Un `usuario` (ciudadano) que tipea `#/usuarios`, `#/roles`, etc. directamente
  en la URL es redirigido, no ve la página montada.
- [ ] `GET /api/permissions` requiere un permiso real, no solo un JWT válido.
- [ ] Los 5 controllers no auditados quedan con un veredicto explícito (protegidos
  o arreglados), no en un estado desconocido.
- [ ] La suite de tests backend sigue en verde (era 199/214, 15 skip al momento de
  escribir este plan).
- [ ] No se rompe el acceso legítimo — un `admin_sistema` sigue viendo y accediendo
  a todo, un `operador_organizacion` sigue viendo lo que la spec de
  `RolePermissionSeeder` le da hoy.

## Fuera de alcance (explícito)

- Rediseñar el modelo de permisos (`role_permission`/`menu_permission`) — el
  modelo de datos está bien, el problema es que el frontend no lo consulta para
  bloquear navegación.
- Auditoría de permisos a nivel de campo/columna (ej. un operador viendo un campo
  que no debería dentro de un recurso al que sí tiene acceso) — este plan es sobre
  acceso a rutas/recursos completos, no field-level authorization.
