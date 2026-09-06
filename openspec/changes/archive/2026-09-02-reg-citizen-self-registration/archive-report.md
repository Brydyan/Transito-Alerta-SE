# Archive Report — REG: Auto-registro del ciudadano (sc-325)

**Archivado**: 2026-09-05
**Rondas de verify**: 10
**Veredicto final**: `pass-with-warnings` — 0 CRITICAL

---

## Qué entrega

Un ciudadano puede crearse una cuenta, verificar su correo y publicar. El personal sigue
entrando sólo por invitación.

```
registrar  →  entrar  →  403 al publicar  →  verificar el código  →  201
```

`backend/test/e2e/registration-otp-flow.e2e-spec.ts` recorre esa cadena completa contra la
aplicación real. Es el primer test del change que lo hace, y llegó en la ronda 10.

El delta spec se fusionó en `openspec/specs/citizen-registration/spec.md` — dominio nuevo,
7 requirements y 37 escenarios. Verificado por conteo contra el delta antes de borrar el
origen.

---

## Compuertas al archivar

| | |
|---|---|
| backend lint | 0 errores, 19 warnings preexistentes |
| backend typecheck | exit 0 |
| backend build | exit 0 |
| backend unit | 100 suites / 915 tests |
| e2e | 51 suites / 445 tests, 0 fallos |
| frontend unit | 47 suites / 326 tests |
| frontend build | exit 0 |
| frontend `tsc -b --noEmit` | 10 errores, todos preexistentes |

---

## Los doce defectos, y qué tienen en común

| # | Ronda | Defecto |
|---|---|---|
| 1 | 1 | La aplicación no arrancaba: `EmailVerifiedGuard` inyectaba `UserEntity` sin `forFeature` |
| 2 | 1 | `pnpm run lint` en rojo por imports muertos |
| 3 | 1 | Canal lateral de tiempo: bcrypt sólo en el camino «correo nuevo» |
| 4 | 2 | El guard bloqueaba cuentas con `role_id` NULL |
| 5 | 3 | El guard invertido a lista negra: renombrar el rol desactivaba la verificación |
| 6 | 3 | Un e2e defendía el contrato del 410 que este change derogó |
| 7 | 3 | Casilla B.5 marcada sobre un escenario sin implementar |
| 8 | 4 | El default de `provisionUser()` apagó los tests del camino sin verificar |
| 9 | 6 | El alta exitosa navegaba a una ruta inexistente: 404 |
| 10 | 6 | `EmailVerifiedGuard` rompía el reporte anónimo |
| 11 | 7 | El e2e del alta no compilaba; sus 3 tests nunca corrieron |
| 12 | 8 | La respuesta del registro revelaba si un correo estaba registrado |
| 13 | 9 | Tres eslabones de la verificación marcados hechos y no funcionaban |

**El change se archivó dos veces por error** — una tras cuatro rondas verdes, otra por
iniciativa del implementador sin pasar por verify. Las dos veces hubo que desarchivarlo.

La causa es una sola y se repite: **los tests cubrían las piezas y nadie recorría el
camino**. Cada defecto vivía en una costura — entre el frontend y el wire, entre una ruta y
su componente, entre el registro y el login. Los specs mockeaban justo lo que había que
probar: el `Router`, la respuesta del backend, el estado de la sesión.

Los defectos 9, 11, 12 y 13 se destaparon en cadena cuando el e2e de punta a punta empezó a
correr. Antes de eso, doce compuertas en verde convivían con un flujo que no funcionaba.

**La lección que vale para el resto del proyecto**: una regla que importa necesita un test
que la recorra de extremo a extremo, no uno por pieza. Y un test que pasa no prueba nada
hasta que se lo ve fallar — las correcciones de las rondas 8 a 10 se verificaron por
mutación, rompiendo el código a propósito para comprobar que el test caía.

---

## Fuera de alcance, declarado

**B.5** — el enlace al registro al final del asistente de reporte. Ese asistente vive en F4;
el escenario del spec se cierra ahí. REG cubre el enlace desde el login como punto de
entrada alternativo.

---

## Deuda conocida

1. **La regla del desvío está duplicada implícitamente.** `LoginComponent` decide por «es
   `reporter`»; `EmailVerifiedGuard` por «no está en la lista de staff». Hoy coinciden por
   casualidad de qué roles existen, no por una invariante. El día que se agregue un rol,
   una de las dos se queda vieja. Es el patrón recurrente del proyecto: una regla aplicada
   en un sitio y no en su vecino.
2. **Llegar a `/verificar` con el correo ya verificado no redirige** hasta que el ciudadano
   envía algo.
3. **No hay Playwright que una el recorrido en la interfaz.** El backend lo cubre entero;
   la UI se prueba por piezas.
4. **`AuthController.register()` no tiene test directo** — la cobertura del alta es del
   service y del e2e.
5. **Las rutas de subida de imágenes no llevan `EmailVerifiedGuard`.** Hoy no es
   explotable, pero es la misma regla aplicada en un sitio y no en su vecino.
6. **10 errores de `tsc -b` en el frontend**, preexistentes y ajenos a este change: faltan
   tipos de Node en archivos de spec. Candidatos a un ticket de limpieza.

---

## Operación

El envío de correo depende de configuración, no de código. En el servidor hacen falta
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` con un dominio
verificado, y `FRONTEND_BASE_URL` apuntando al frontend real — de ahí salen los enlaces de
invitación y recuperación de contraseña.

Sin `SMTP_HOST`, `MailService` cae en un transporte que sólo escribe al log. Es un estado
válido de desarrollo, y explica por qué los correos no salen si la variable está vacía.

El e2e no depende de nada de esto: lee el OTP de `users.verification_otp`.
