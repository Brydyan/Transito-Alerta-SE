# Fixes Required — REG: Auto-registro del ciudadano (sc-325)

**Estado: el change se DESARCHIVÓ.** Se dio por cerrado y no lo estaba.

Los Fixes 1–8 de las rondas 1–4 están cerrados y re-verificados por ejecución real; quedan
como referencia histórica al final. Lo que sigue son **dos defectos nuevos**, encontrados al
auditar tarea por tarea las 18 casillas marcadas y al correr la suite e2e completa después
de revertir el código del change hermano ANON.

Los dos son bloqueantes. Ninguno lo vieron las cuatro rondas de verify.

---

## Fix 9 (bloqueante) — El registro exitoso termina en la página de error

**Archivos**: `frontend/src/app/features/auth/register/register.component.ts:111`,
`frontend/src/app/app.routes.ts`

### Síntoma

Un ciudadano completa el alta. El backend crea la cuenta y le manda el OTP. La aplicación
lo deja en una página de error 404.

```ts
// register.component.ts:111
this.router.navigate(['/verify-email'], { … });
```

**Esa ruta no existe.** `app.routes.ts` declara `''`, `login`, `registro`,
`accept-invitation` y `app/**`. No hay `verify-email`. La navegación cae en el comodín:

```ts
{ path: '**', loadComponent: () => … ErrorPageComponent }
```

### Por qué la casilla B.6 está mal

B.6 afirma: *«El componente `verify-email` **ya existe** en `features/auth/verify-email/`.
No se construye uno nuevo.»*

Lo que hay en ese directorio:

```
verify-email.component.html   10092 bytes   27/08
verify-email.component.js     11041 bytes   27/08
```

`.html` y `.js`. **No hay `.ts`.** Es código heredado de GeoReporta — su cabecera dice
`story sc-117` — anterior a este change. No tiene decorador `@Component`, no es standalone,
ningún `.ts` lo importa, y el build de Angular ni lo mira.

**Existe el archivo. No existe el componente.** Son cosas distintas, y la casilla se marcó
sobre la primera.

### Por qué cuatro rondas de verify no lo vieron

`register.component.spec.ts:88` afirma la navegación con el `Router` mockeado:

```ts
it('POST /auth/register con body correcto y navega al verify-email al éxito')
```

Comprueba que se **llamó** a `navigate(['/verify-email'])`. No que el destino exista. Pasa
igual con la ruta ausente.

Lo que lo habría cazado es la deuda que el propio verify dejó anotada: **ningún e2e
ejercita `POST /auth/register` de punta a punta.** El hueco de cobertura y el defecto son
el mismo hueco.

### Qué hacer

**1 — Construir el componente en Angular.** `features/auth/verify-email/verify-email.component.ts`
(+ `.html`, `.css`), standalone, con los primitivos de F0 como el resto de `features/auth/`.

El `.html` y el `.js` heredados sirven de **referencia** para el flujo del OTP, no para
copiar. El `.js` documenta el contrato:

- `POST /api/email/verify-otp` con el OTP de 6 dígitos
- `POST /api/email/resend-verification` para reenviar

Contrastá esos dos endpoints contra el backend real
(`backend/src/modules/auth/email-verification.service.ts` y su controlador) **antes** de
escribir el componente. No los derives del `.js`: tiene un mes y nadie lo compila.

El componente recibe `email` y `hint` por query params, como ya los manda
`register.component.ts:111`.

Los códigos que el backend emite y la pantalla debe distinguir:

| | |
|---|---|
| 202 | reenvío aceptado |
| 200 | OTP correcto |
| 422 | OTP expirado, y también correo ya verificado |
| 429 | reenvío repetido dentro de los 60s |

Los cuatro están cubiertos por `backend/test/e2e/email-verification.e2e-spec.ts`; leelo
para ver la forma exacta de cada respuesta.

**2 — Declarar la ruta** en `app.routes.ts`, con `guestGuard` y fuera de `app/**`, igual que
`registro`: quien verifica su correo todavía no tiene sesión.

**3 — Specs.** Del componente: cada uno de los cuatro códigos y el estado inicial con los
query params. Y **un spec que afirme que la ruta existe** — el defecto de B.6 fue
exactamente que nadie lo comprobaba. Sirve el patrón de
`frontend/src/app/features/placeholder/placeholder.component.spec.ts`, que lee
`app.routes.ts` como texto y afirma sobre su contenido.

**4 — El e2e que falta.** En `backend/test/e2e/`: el alta completa de punta a punta —
`POST /api/auth/register` con un correo nuevo, y comprobar que la cuenta queda creada con
rol `reporter`, sin verificar, y con OTP emitido. Es la deuda que escondió este defecto.
Mirá `email-verified-guard.e2e-spec.ts` como modelo: afirma sobre el **código** de error y
no sólo sobre el estado HTTP.

**5 — Corregir las casillas.** B.6 destildar y reescribir. B.8: el test de navegación no
prueba lo que la casilla dice que prueba — reescribir la descripción, o el test.

---

## Fix 10 (bloqueante) — `EmailVerifiedGuard` rompe el reporte anónimo

**Archivo**: `backend/src/common/guards/email-verified.guard.ts`

### Síntoma reproducible

```bash
cd backend && pnpm run test:e2e
# Test Suites: 5 failed, 44 passed, 49 total
# Tests:       13 failed, 424 passed, 437 total
# expected 201 "Created", got 403 "Forbidden"
```

Suites afectadas: `flows`, `incident-categories`, `organizations`, `roles`,
`t7-referential-integrity`.

### Causa

La cadena, verificada línea por línea:

```
fila anónima en tests   INSERT (device_uuid, permissions, is_active)  ← sin email_verified_at
auth.service.ts:566     roleName = isAnonymous || roleDeleted ? null : row.role_name
EmailVerifiedGuard      roleName null → no está en STAFF_ROLES → exige email_verified_at
                        → NULL → 403 EMAIL_VERIFICATION_REQUIRED
```

**El dispositivo anónimo no tiene correo que verificar.** El guard se lo pide igual y le
niega `POST /incidents`, que es una capacidad soportada hasta que ANON la cierre.

### Por qué no se vio antes

Estaba tapado. El código de ANON —el cierre del login anónimo— se commiteó por error junto
con REG en `fa005b8`, así que estas mismas pruebas fallaban ANTES, en el login, con 401. Al
revertir ANON apareció el 403 que había debajo.

Un bug ocultaba al otro, y el ruido de ANON hizo que las cuatro rondas de verify
descartaran estos fallos como ajenos al change.

### Qué cambiar

Eximir la identidad anónima en el guard, junto a los roles de staff. El techo de permisos
(`anonymousPermissions`) es lo que gobierna al dispositivo anónimo; la verificación de
correo no le aplica porque no tiene correo.

`request.user` ya trae `isAnonymous` desde `getAuthContextByUserId` — usalo, no compares
`device_uuid` a mano en el guard.

**Cuando ANON aterrice, esta exención desaparece con él**, porque el login anónimo deja de
existir. Dejalo escrito en el comentario para que quien haga ANON sepa que este bloque le
pertenece.

### Test que debe existir

En `backend/test/e2e/email-verified-guard.e2e-spec.ts`, junto a los seis que ya están:

```ts
it('el dispositivo anónimo publica sin verificación — no tiene correo que verificar', …)
```

Y verificalo por mutación: quitá la exención, el test debe fallar con 403
`EMAIL_VERIFICATION_REQUIRED`.

---

## Cómo verificar que los dos están hechos de verdad

No alcanza con que los tests pasen. **Verificalo por mutación**, como se hizo con el guard
en la ronda 4:

1. Borrá la ruta `verify-email` de `app.routes.ts` → el spec de ruta debe fallar.
2. Quitá la exención anónima del guard → el e2e nuevo debe fallar.
3. Restaurá las dos. Todo verde.

Si al romper algo no falla nada, el test no prueba nada y estamos donde empezamos.

Es la quinta y sexta vez en este change que algo pasa por el motivo equivocado. Al
implementar esto, la pregunta no es «¿el test pasa?» sino **«¿qué tendría que romperse para
que este test falle?»**.

Compuertas de `ci.yml`, las mismas de siempre:

- `frontend/`: `pnpm test`, `pnpm run build`
- `backend/`: `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`
- `pnpm run test:e2e` **completo**, no una muestra

Referencia tras revertir ANON: backend 100 suites / 910 tests, lint 0 errores, typecheck 0;
frontend 42 suites / 298 tests, build 0; e2e 49 suites / 437 tests con los 13 fallos del
Fix 10 — que deben quedar en cero.

---

## Referencia histórica — Fixes 1–8 (rondas 1–4, CERRADOS)

- ~~Fix 1 — boot roto por `UserEntity` faltante en `forFeature`~~
- ~~Fix 2 — lint en rojo por código muerto~~
- ~~Fix 3 — canal lateral de tiempo permitía enumerar correos~~
- ~~Fix 4 — el guard bloqueaba cuentas con `role_id` NULL~~
- ~~Fix 5 — deny-list fail-open ante renombrado del rol `reporter`~~ — cerrado con
  allow-list exhaustiva; el `UNIQUE` de `roles.name` cierra además la colisión de nombres.
- ~~Fix 6 — e2e propio en rojo por el contrato derogado del 410 Gone~~
- ~~Fix 7 — casilla B.5 marcada sobre un escenario sin implementar~~
- ~~Fix 8 — el default de `provisionUser()` apagó los tests del camino sin verificar~~

## Deuda conocida, no bloqueante

- `AuthController.register()` no tiene test directo.
- Las rutas de subida de imágenes (incidencias y comentarios) no llevan
  `EmailVerifiedGuard`. Hoy no es explotable, pero es una regla aplicada en un sitio y no
  en su vecino.
- No hay test de regresión dedicado al arranque de la aplicación. Lo que cubre ese hueco
  es que los archivos e2e levantan la app real.
