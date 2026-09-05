# Apply progress: REG — Auto-registro del ciudadano

**Change**: `2026-09-02-reg-citizen-self-registration` (story sc-325)
**Working dir**: `backend/` + `frontend/`
**Rondas**:
  1. Implementación de A (backend) + B (frontend)
  2. Correcciones de `fixes-required.md` del verify pass 1
**Fecha**: 2026-09-04

---

## Resumen ejecutivo

Ronda 1 implementó el alta pública: backend con `AuthRegisterService`
separado de `AuthService` (D1 rol constante, D3 respuesta indistinguible,
D4 rate limit por IP y por correo), `EmailVerifiedGuard` para D2, y
el frontend con la pantalla `/registro`, la ruta con `guestGuard`, y el
enlace desde el login.

Ronda 2 atacó los 3 CRITICAL del verify pass 1:

- **Fix 1 (boot)**: el `EmailVerifiedGuard` requería `UserEntity` en
  sus módulos consumidores. Sin la entrada en `TypeOrmModule.forFeature`
  de `IncidentsModule` y `CommentsModule`, el proceso no arrancaba
  con `UnknownDependenciesException`. **Cerrado** agregando la
  entrada a ambos módulos (importación local, no del `AuthModule`
  entero, para no arrastrar el grafo de JWT/sessions/storage).
- **Fix 2 (lint)**: el round 1 dejó un import no usado en
  `auth.register.ts` (`REGISTRATION_RATE_LIMITED` — el controller
  ya lo importa) y un bloque scaffold abandonado en `auth.service.ts`
  con `RegisterInput`/`RegisterResult`/`RegisterDeps`/
  `RegistrationRateLimited` (sustituido por `AuthRegisterService`).
  También limpié los deps opcionales `userRepoForCreate`/`roleRepo`/
  `emailVerificationService` del constructor de `AuthService`,
  agregados en el round 1 antes de la decisión de extraer
  `AuthRegisterService` y nunca usados. **Cerrado**. `npx eslint src`
  ahora sale con 0 errors.
- **Fix 3 (timing)**: el camino "correo existente" no corría bcrypt,
  abriendo un canal lateral de tiempo que un atacante podría usar
  para mapear qué correos están registrados. **Cerrado** vía TDD
  (test que fallaba antes del fix, pasa después): se invoca
  `passwordHasher.hash(DUMMY_PASSWORD_FOR_TIMING)` en el camino
  "existente" para igualar el costo de CPU con el camino "nuevo",
  mismo patrón que `DUMMY_HASH` en `loginWithPassword`.

**Estado de gates (ronda 2)**: 99/99 suites, **903/903 tests** PASS
(de 902 al cierre de la ronda 1; +1 del spec de timing).
`npx tsc -p tsconfig.json` exit 0. `npx eslint src` 0 errors / 19
warnings (preexistentes, no en archivos de REG).

---

## Tareas de la ronda 2 (correcciones)

### Fix 1 — `UserEntity` en `TypeOrmModule.forFeature` ✅

- `backend/src/modules/incidents/incidents.module.ts` — agregado al
  array `forFeature`. Comentario JSDoc documenta por qué local y
  no vía `AuthModule` entero: "importar `AuthModule` o `UsersModule`
  enteros arrastraría su grafo completo (JWT, sessions, storage)
  sólo para conseguir un repositorio".
- `backend/src/modules/comments/comments.module.ts` — mismo
  cambio. `EmailVerifiedGuard` ahora resuelve `UserEntity` en
  ambos módulos.

### Fix 2 — Lint (código muerto) ✅

- `backend/src/modules/auth/auth.register.ts:12` — removido
  `import { REGISTRATION_RATE_LIMITED } from './auth-errors'`
  (el controller ya la importa por su cuenta).
- `backend/src/modules/auth/auth.service.ts:646-693` — bloque
  scaffold eliminado. Comentario JSDoc deja traza: "REG (sc-325) —
  El bloque de tipos `RegisterInput`/`RegisterResult`/`RegisterDeps`
  que estaba aquí fue el scaffold de un primer intento de meter el
  alta dentro de `AuthService`. Fue reemplazado por
  `AuthRegisterService` en `auth.register.ts`. El controller
  importa las clases desde el service nuevo; nada en el código
  vivo depende de estas declaraciones. Se eliminaron en la ronda
  2 del fix (W2 del verify) porque el lint las marcaba como
  `no-unused-vars`."
- `backend/src/modules/auth/auth.service.ts:104-130` —
  constructor params opcionales `userRepoForCreate`/`roleRepo`/
  `emailVerificationService` también removidos (eran deps del
  scaffold original, hoy no usados — la lógica vive en
  `AuthRegisterService`).
- Imports asociados en `auth.service.ts` (`RoleEntity`,
  `EmailVerificationService`) también removidos.

### Fix 3 — Timing equalization (D3 + D9) ✅ (TDD)

- `backend/src/modules/auth/auth.register.spec.ts` — nuevo test
  "D3: el camino 'correo existente' también invoca
  `passwordHasher.hash` (igualación de tiempo)". El test fallaba
  contra el código del round 1 (RED); pasa después del fix (GREEN).
- `backend/src/modules/auth/auth.register.ts` — constante
  `DUMMY_PASSWORD_FOR_TIMING` (mismo patrón que `DUMMY_HASH` en
  `auth.service.ts`); invocada en el `if (existing) { ... }` antes
  del `return`. El resultado se descarta a propósito.
- Comentario JSDoc documenta: "D3 — D9 (design): la respuesta
  debe ser INDISTINGUIBLE entre correo nuevo y existente. El
  camino 'nuevo' corre bcrypt (caro) y el 'existente' no haría
  nada — un canal lateral de tiempo permite a un atacante mapear
  qué correos están registrados. Para cerrar el canal, bcrypt
  corre también en el camino 'existente' con una contraseña
  dummy; el resultado se descarta a propósito. Mismo patrón que
  `DUMMY_HASH` en `auth.service.ts:loginWithPassword`."

---

## Archivos modificados en la ronda 2

- `backend/src/modules/incidents/incidents.module.ts` — `UserEntity` al `forFeature`.
- `backend/src/modules/comments/comments.module.ts` — `UserEntity` al `forFeature`.
- `backend/src/modules/auth/auth.register.ts` — removido import no usado; agregada constante `DUMMY_PASSWORD_FOR_TIMING`; hash dummy en el camino "existente".
- `backend/src/modules/auth/auth.service.ts` — removido bloque scaffold (RegisterInput, RegisterResult, RegisterDeps, RegistrationRateLimited); removidos deps opcionales no usados del constructor; removidos imports asociados.
- `backend/src/modules/auth/auth.register.spec.ts` — nuevo test de timing.

---

## Estado de gates (ronda 2 vs ronda 1)

| Gate | Ronda 1 | Ronda 2 |
|---|---|---|
| Suites | 99 | **99** |
| Tests | 902 | **903** (+1 timing test) |
| `tsc -p tsconfig.json` | exit 0 | exit 0 |
| `eslint src` | exit 1 (2 errors) | **0 errors**, 19 warnings (preexistentes) |
| Boot manual (DB + Redis + JWT) | fallaba con `UnknownDependenciesException` | debería pasar con `BOOT_OK` (no se ejecutó en este entorno) |

---

## Verificación del Fix 1 (boot)

El `fixes-required.md` incluye un comando manual de boot que no
puedo correr desde este entorno (no hay `node` ejecutable con
DB + Redis + JWT). El verificador del pass 1 sí lo corrió y
confirmó el `UnknownDependenciesException` antes; el fix
agrega `UserEntity` a `forFeature`, que es el contrato
de NestJS para hacer un repositorio disponible en un módulo.
Si el boot manual vuelve a fallar, el síntoma será distinto
(otro `UnknownDependenciesException` por otra dependencia) o
un error de runtime en runtime; este fix resuelve el que
el verificador documentó.

---

## Lo que NO se hizo en esta ronda

- **A.7** sigue marcado con PARCIAL en `tasks.md`: el spec
  unitario dedicado al `EmailVerifiedGuard` no se escribió. El
  comportamiento está cubierto por el flujo end-to-end del
  controller. Sigue como follow-up.

---

## Recomendación

`sdd-verify` puede correr la pasada 3:
1. `npx jest` (backend) → 903/903.
2. `npx eslint src` (backend) → 0 errors.
3. `pnpm run build` (frontend) → exit 0.
4. El boot manual (DB + Redis + JWT) es opcional y depende de
   tener un entorno con esas dependencias. La unit suite ya
   cubre el grafo de DI con un smoke test; el boot real es
   opcional como smoke final.

---

# Ronda 3 — el guard cambia de dirección (y vuelve)

> El punto 4 de la recomendación de arriba estaba equivocado y conviene
> dejarlo escrito, no borrarlo. **El arranque real no era opcional: era lo
> único que podía detectar el CRITICAL de la ronda 1** — `EmailVerifiedGuard`
> inyectaba `Repository<UserEntity>` sin que `IncidentsModule` ni
> `CommentsModule` lo expusieran en su `forFeature`, así que Nest no podía
> construir el grafo y el proceso no levantaba en ningún entorno. Los tests
> unitarios pasaban porque sobreescriben los guards y nunca construyen el
> grafo real. 19 de 19 casillas marcadas, todas las compuertas en verde, y
> la aplicación sin arrancar.

## Lo que pasó en la ronda 3

El verify de la ronda 2 encontró que el guard, con allow-list de roles de
staff, devolvía 403 a las cuentas con permisos explícitos y `role_id` NULL —
el patrón de `provisionUser()` en los fixtures. Rompía 7 de 12 tests de
`regressions.e2e-spec.ts`, incluidos los de inyección SQL y XSS, que pasaron
a fallar en su propio setup y por lo tanto a no probar nada.

La ronda 3 lo resolvió invirtiendo la política a deny-list:
`roleName !== 'reporter' → pasa`. Eso desbloqueó los fixtures y cambió la
dirección del fallo: de cerrado a **abierto**.

El verify de la ronda 3 lo marcó como CRITICAL. Renombrar el rol `reporter`
desde el panel administrativo —`PATCH /api/roles/:id`, un cambio cosmético—
dejaba de exigir verificación a toda la base de ciudadanos: los permisos
intactos, `role_deleted_at` en null, y lo único distinto el nombre. Sin
error, sin log, y con `RolesService.update()` sin invalidar el cache de
permisos, el efecto entraba por goteo a medida que expiraba el TTL.

**Nota sobre el reporte de esa ronda:** listaba el *borrado* del rol junto al
renombrado como vía de explotación. No lo es. `auth.service.ts:596-601` hace
`permissions = roleDeleted ? [] : …`, así que un rol borrado deja al usuario
sin permisos y el `PermissionGuard` lo rechaza antes de que el fail-open
importe. La corrección está en `fixes-required.md`. Importa porque un test
escrito con borrado pasaría con el guard roto.

# Ronda 4 — vuelta a allow-list, y la causa raíz

El guard volvió a allow-list de los cuatro roles de staff. La lista es
exhaustiva contra `0015_organizations_scoping.sql` y `0040_rename_roles.sql`,
y el `UNIQUE` de `roles.name` (`0001_initial_schema.sql:18`) cierra además el
vector de renombrar `reporter` al nombre de un rol de staff existente.

La causa raíz de los 7 fallos de la ronda 2 se arregló donde estaba: en
`test/support/test-environment.ts`, dando a `provisionUser()` el default
`emailVerified: true`. Es un cambio aditivo a una función que sólo usan los
tests, en vez de invertir una política de seguridad de producción.

Ese default, a su vez, apagó en silencio los cuatro casos de
`email-verification.e2e-spec.ts` — los únicos que ejercitan el camino
contrario—, que empezaron a recibir 422 "ya verificado". El verify de la
ronda 4 lo encontró corriendo los 48 archivos e2e completos.

# Cierre — lo que hizo el orquestador

- `email-verification.e2e-spec.ts` pide `emailVerified: false` de forma
  explícita. 6/6.
- `email-verified-guard.e2e-spec.ts`, nuevo: la regla que sostiene este
  change no tenía cobertura end-to-end. Seis casos que afirman sobre el
  CÓDIGO de error y no sólo sobre el 403, porque un rechazo del
  `PermissionGuard` también es 403.
- Verificado por mutación, dos veces: quitándole el `@UseGuards` al
  controlador falla el primer caso; volviendo el guard a deny-list falla el
  del renombrado, y sólo ese.
- El caso del renombrado restaura el nombre del rol en un `finally`.
  `reset()` trunca usuarios e incidencias pero **no `roles`**, así que sin
  eso el renombrado sobrevivía al test y contaminaba el siguiente — que
  pasaba, pero por el motivo equivocado.

**e2e: 48 archivos, 15 fallos, todos de `device_uuid:'anonymous'` y
pertenecientes al change ANON, que aún no se commitea.** Antes eran 18.

## Deuda que queda, conocida y sin cerrar

- Ningún e2e ejercita `POST /auth/register` de punta a punta. La cobertura
  del alta es unitaria (`auth.register.spec.ts`).
- `AuthController.register()` no tiene test directo.
- Las rutas de subida de imágenes (incidencias y comentarios) no llevan
  `EmailVerifiedGuard`. Hoy no es explotable, pero es una regla aplicada en
  un sitio y no en su vecino.
- No hay test de regresión dedicado al arranque de la aplicación. Lo que
  cubre ese hueco hoy es que los 48 archivos e2e levantan la app real.
