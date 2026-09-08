# Archive Report — MAIL: El correo de verificación nunca se pudo enviar (sc-330)

**Archivado**: 2026-09-06
**Rondas de verify**: 3
**Veredicto final**: **PASS** — 0 CRITICAL
**Historia**: [sc-330](https://app.shortcut.com/upse/story/330) · épica 192 · **bloqueaba F4 (sc-306)**

---

## Qué entrega

Que el correo de verificación salga. Nunca lo había hecho.

`EmailVerificationService` encolaba dos plantillas que no existían en el registro —
`email_verification` y `existing_account_attempt`— mientras `TemplateName` declaraba otras
seis. `renderMailTemplate` lanzaba, y el consumidor lo trataba como defecto de datos:
directo a `mail:dead`, sin reintentar. Y como `MailService.deliver` renderiza **antes** de
abrir la conexión, el proveedor nunca se enteraba de que había un correo que mandar.

Medido en staging el 2026-09-06, con Resend ya configurado y su DNS propagado:

```
template   email_verification
attempts   0
```

`attempts 0` es el dato. No falló al entregar: nunca intentó entregar. Las credenciales y
el dominio estaban bien desde el principio.

### Los ocho bloques

| | |
|---|---|
| **A** | Las dos plantillas, con ayudantes propios: IP enmascarada, dispositivo sin versiones, hora de Ecuador |
| **B** | Fuera los dos `as never` — el compilador vuelve a ser la primera barrera |
| **C** | Cobertura del camino que nadie recorría |
| **D** | `mail:dead` acotado, que guardaba el OTP en claro y no caducaba |
| **E** | «Verifique su correo» en el alta, con validador de grupo |
| **F** | El mensaje del alta con un solo dueño |
| **G** | `trust proxy` acotado por dirección |
| **H** | El nombre de la aplicación en una constante: **GeoReporta** |

---

## Por qué sobrevivió diez rondas de verify de REG

Tres causas, y las tres son patrones que este proyecto ya había pisado.

**El cast apagó el único control automático.** `'email_verification'` no es asignable a
`TemplateName`; el compilador lo rechazaba, y `as never` lo calló. Sin el cast, esto nunca
habría compilado y no habría hecho falta ningún test.

**El test del vecino comprobaba lo que éste no.**

```
password-reset.service.spec.ts:58      { to, template: 'password-reset' }
email-verification.service.spec.ts:99  { to }
```

Una regla aplicada en un sitio y no en su vecino.

**El spec no lo pedía.** `citizen-registration` exigía que *la respuesta diga* que se envió
un correo, no que el correo **se pueda enviar**. Un sistema que responde «te enviamos un
mensaje» y no envía nada cumplía el spec al pie de la letra.

---

## El segundo defecto, encontrado por el camino

Al ir a ver de dónde salía la IP del aviso, apareció algo mayor: **`trust proxy` no estaba
declarado en ninguna parte**. nginx mandaba `X-Forwarded-For` (`nginx.conf:56`) y Express
lo ignoraba, devolviendo la IP del contenedor de nginx — idéntica para todo el tráfico.

Esa misma `req.ip` es la llave del límite de tasa del alta (`auth.register.ts:146`,
`IP_MAX = 5` por hora). Con una sola llave compartida eran **cinco altas por hora para todo
internet**: el sexto ciudadano recibía un rechazo sin haber hecho nada, y cualquiera lo
disparaba con cinco intentos.

Se declaró la confianza **por dirección**, no por número de saltos: `true` confía en
cualquiera, y contar saltos supone una topología que cambia sin aviso. Importa porque
`APP_PORT=3004` está publicado en el host, así que el backend es alcanzable sin pasar por
nginx — hay un test dedicado a que una cabecera falsificada desde fuera no cuele.

**Y un tercero dentro de ése**: `isTrustedProxyAddress` comparaba sin quitar el prefijo
`::ffff:`. Node entrega `::ffff:127.0.0.1` en sockets dual-stack aunque la peer sea IPv4,
así que la comparación fallaba siempre y `trust proxy` quedaba inactivo **en silencio** —
el bloque G habría parecido hecho y habría estado roto.

---

## Hallazgos de las rondas de verify

### Ronda 1 — el arnés aislaba todo menos el correo

`test-environment.ts` sobreescribe base, Redis, JWT y rate limit, y dejaba fuera
`SMTP_HOST`. Como `CoreModule` carga el `.env` del repo incondicionalmente, el valor de la
máquina de quien corriera los tests se colaba.

**Lo grave no era el test frágil.** `.env` está en `.gitignore`, así que en CI no existe:

```
local   SMTP_HOST=localhost:1025   →  FALLA
CI      sin definir                →  PASA
```

Rojo en local, verde en CI, y **CI del lado permisivo**. Es la misma ceguera que la
compuerta de migraciones (ver el archive-report de ANON): el comportamiento difería entre
los dos lados y decidía el que no veía el problema.

### Ronda 2 — el particionado de CI, roto por un `--`

Para acelerar el e2e se particionó la suite en cuatro con `--shard=N/4`. La línea entró
como `pnpm run test:e2e -- --shard=N/4`, y pnpm **reenvía el `--` literal** en vez de
consumirlo (npm sí lo consume). Jest lo recibe como argumento posicional, deja de reconocer
la bandera y la trata como patrón de ruta:

```
Pattern: --shard=1/4 - 0 matches
No tests found, exiting with code 1
```

Las cuatro particiones habrían quedado **rojas en cada push a develop y main, sin ejecutar
un solo test**. Es la misma trampa que el repo ya tenía documentada con `rtk pnpm test --`.
Va con un comentario en `ci.yml` que dice qué se rompe si alguien vuelve a poner el
separador, porque la línea correcta parece el error.

### Ronda 3 — PASS

---

## Un test que no podía ponerse en rojo

La tarea C.2 pedía un test que recorriera la costura entre lo que se encola y lo que se
renderiza. Lo entregado fue un bucle sobre `ENQUEUED_TEMPLATE_NAMES`, un array escrito a
mano y tipado `ReadonlyArray<TemplateName>`. Como `TEMPLATES` es
`Record<TemplateName, TemplateFn>`, todo elemento del array tiene entrada garantizada: el
bucle **nunca alcanzaba la rama que lanza**.

Y su comentario decía lo contrario de lo que hacía —afirmaba no enumerar a mano mientras
enumeraba un archivo más allá—. El mismo patrón del defecto de AUD: un comentario que
promete la garantía contraria a la que da el código, justo donde alguien iría a
comprobarla.

Se borró. En su lugar, un comentario que dice dónde vive cada protección:

- la cobertura del registro la garantiza **el tipo, al compilar** (mutación: quitar una
  entrada de `TEMPLATES` hace fallar el typecheck con `TS2741`)
- el caso que el tipo no ve —un nombre que llega como cadena desde Redis— vive en
  `mail-outbox.consumer.spec.ts` (mutación: romper la detección hace caer *«sends an
  unknown template straight to mail:dead»*)

Un test verde con un comentario falso es peor que no tenerlo: el próximo que audite lo lee
y se queda tranquilo.

---

## Decisiones de producto

**Qué muestra el aviso al titular** — versión recortada: dispositivo sin versiones, IP a dos
octetos, hora local. Un intento no es necesariamente un ataque; lo más común es un dedazo, y
entonces se le estaría mandando a un desconocido la IP exacta de alguien de buena fe. Con eso
el titular distingue «eso fui yo anoche» de «eso no es mío», que es lo único que necesita.

**Sin ubicación geográfica.** Evaluada y descartada: una base local son ~70 MB y un trabajo
de refresco; una API externa metería una llamada de red **dentro del consumidor del
outbox**, que es el componente que este change arregla.

**Los dos nombres.** TASE es el proyecto, GeoReporta es la aplicación. Registrado en
`openspec/ROADMAP.md`, junto con la trampa: «GeoReporta» ya aparece 11 veces en
`backend/src` refiriéndose al **sistema anterior**.

---

## Compuertas finales — ronda 3

| Compuerta | Resultado |
|---|---|
| backend tsc | exit 0 |
| backend lint | 0 errores, 24 warnings (línea base exacta) |
| backend build | exit 0 |
| backend unit | 111 suites / **1023** tests |
| backend e2e | **54 suites / 470 tests** |
| frontend unit | 60 suites / 415 tests |
| frontend build | exit 0 |
| frontend `tsc -b` | rojo **preexistente**, 3 archivos, ninguno nuevo — deuda con ticket pendiente |

Unit pasó de 1024 a 1023: exactamente el test tautológico borrado, ni uno más.

---

## Specs

`citizen-registration` pasa de **7 requisitos / 37 escenarios** a **14 / 70**. La fusión se
verificó comparando los 33 escenarios del delta contra el spec resultante uno por uno —
ninguno se perdió— antes de borrar el origen.

---

## Nota de método — el subconjunto de e2e

La suite son 54 archivos y **cada uno levanta su propio PostGIS y su propio Redis**
(`test-environment.ts`: «una instancia por archivo»), en serie (`maxWorkers: 1`).

Para las tres rondas se usó el subconjunto de los 6 archivos que tocan este change, y la
suite completa una sola vez al final:

```
subconjunto (6)     ~125 s
completa (54)       ~614 s        4,9×
```

**El subconjunto no dio un solo falso negativo** frente a la completa en ninguna de las tres
rondas. Sirve para iterar y mutar; la completa, una vez al cierre.

En CI se hizo lo contrario, y a propósito: la suite se **particiona** en cuatro, no se
recorta. Recortar en la compuerta de merge sería lo contrario de para lo que existe — es el
único sitio donde nadie va a mirar lo que se saltó. Las cuatro particiones juntas ejecutan
exactamente los mismos 54 archivos, verificado por conjuntos.

---

## Addendum — un defecto que el archivado no vio (2026-09-06, tras el PR)

El PR contra `develop` falló en CI con un test de este mismo change, después de que las
tres rondas de verify lo dieran por verde. Vale registrarlo porque **la causa es la tercera
aparición del mismo patrón** en este change: comportamiento que depende de dónde corre.

`formatAttemptTime` sumaba `date.getTimezoneOffset()` —el offset del **runtime**— antes de
aplicar el de Ecuador:

```
instante 19:33 UTC, que en Ecuador son las 14:33

runtime GMT-5 (la máquina del dev)   los dos términos se cancelan  →  19:33  ✗
runtime UTC   (CI)                                                 →  14:33  ✓
```

Y el test se escribió contra el resultado equivocado (`/19:33 \(GMT-5\)/`), con un
comentario que afirmaba *«la aserción no compara contra una hora exacta (depende del
timezone del runtime)»*. Comparaba contra una hora exacta, y esa dependencia era el
defecto: el comentario describía la garantía contraria a la del código, igual que en AUD y
que en el test de C.2.

**Los dos errores se cancelaban en local y se separaron en CI.** Las tres rondas de verify
corrieron en la máquina del dev, así que ninguna pudo verlo.

Arreglado: el helper ya no lee la zona del runtime —`getTime()` ya es epoch UTC, basta
restar el offset fijo de Ecuador— y el test asserta la hora correcta más un caso que cruza
el día (`02:15Z` del 7 → `21:15` del 6), que es el que delata un error de signo. Verificado
en `America/Guayaquil`, `UTC`, `Asia/Tokyo` y `Pacific/Kiritimati` (UTC+14): idéntico en
las cuatro. Suite completa con `TZ=UTC`: 111 suites / 1024 tests.

La lección quedó anotada en `openspec/ROADMAP.md`, sección «Lo que corre distinto en tu
máquina que en CI», con los tres casos y cómo detectarlos antes de que lo haga CI.

---

## Deuda conocida

1. **Los contenedores por archivo de spec.** El particionado reparte el trabajo pero no baja
   el coste: siguen siendo 54 arranques de PostGIS. Reutilizar un contenedor y dar una base
   por archivo (`CREATE DATABASE … TEMPLATE`, ~100 ms contra varios segundos) es lo que de
   verdad lo arregla. El propio `test-environment.ts` anota la deuda y fija su condición de
   revisión: *«no vale la complejidad para el puñado de archivos que añadirá la Fase 4 —
   revisar si ese supuesto deja de valer»*. Con 54, dejó de valer.
2. **El `tsc -b` del frontend en rojo**, 3 archivos preexistentes. Sin ticket.
3. **Las cuatro plantillas en inglés** (`incident.created`, `incident.assigned`,
   `incident.status_changed`, `comment.created`) en una aplicación en castellano. Otra
   superficie, con su propia revisión de texto.
4. **La marca del sidebar** (`assets/logo.svg` + «Tránsito Alerta») sigue con el nombre
   viejo. Lleva un activo gráfico nuevo, así que es trabajo de diseño: pertenece a F6.
5. **`APP_PORT=3004` publicado en el host.** Si todo el tráfico entra por nginx, cerrar ese
   puerto reduce la superficie que `trust proxy` tiene que defender. Es cambio de
   despliegue, no de código.

---

## Nota de despliegue

Ninguna migración. El cambio toma efecto al reiniciar el backend.

**`docker compose restart` no basta**: el compose usa `env_file: .env`, así que las
variables se fijan al crear el contenedor. Hay que recrearlo:

```bash
docker compose --profile staging up -d --force-recreate backend
```

Y comprobar que el proceso ve lo que debe, que es distinto de que el archivo esté editado:

```bash
docker compose exec -T backend printenv | grep -E 'NODE_ENV|FRONTEND_BASE_URL|SMTP_HOST|SMTP_FROM'
```

Para verificar la entrega de punta a punta, el veredicto está en Redis, no en la respuesta
HTTP: el alta responde 200 aunque el envío falle después, porque el encolado es asíncrono.

```bash
docker compose exec -T redis redis-cli XLEN mail:dead
```

Con `mail:dead` en 0 tras un alta, el correo salió hacia el proveedor.
