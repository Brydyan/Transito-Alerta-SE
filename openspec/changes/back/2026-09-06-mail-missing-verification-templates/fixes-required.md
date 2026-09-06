# Fixes Required: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda de verify**: 1
**Fuente**: `verify-report.md` de esta misma ronda

**Estado: el único CRITICAL está resuelto.** Queda WARNING-A, que no bloquea el archivado
pero sí conviene cerrar antes, porque deja un test que no puede fallar con un comentario
que afirma lo contrario.

> **Corrección sobre el reporte original de la ronda 1.** El agente de verify marcó C.2
> como un segundo CRITICAL y propuso derivar el array de `Object.keys(TEMPLATES)`. Se
> revisó y **se rebaja a WARNING**: la protección que C.2 debía dar ya existe, y el arreglo
> propuesto era circular (derivar de `TEMPLATES` para después comprobar que esas claves
> están en `TEMPLATES`). El análisis corregido está abajo, en WARNING-A. No implementar la
> versión original.

---

## CRITICAL-1 — Los e2e C.4 fallan en ejecución real (SMTP_HOST ambiental) — ✅ RESUELTO

> **Cerrado el 2026-09-06.** `test-environment.ts` fuerza `process.env.SMTP_HOST = ''`
> junto al resto de overrides de infraestructura, y los tres comentarios de
> `mail.e2e-spec.ts` que afirmaban «SMTP_HOST is unset in this harness» ahora dicen lo que
> de verdad ocurre: que el arnés lo fuerza.
>
> Comprobado sin ningún override manual:
> `npx jest --config ./test/jest-e2e.json --testPathPattern='mail\.e2e-spec'` → **6 passed,
> 6 total**, incluidos los dos de C.4 que fallaban.
>
> **Lo que este defecto enseñó, y vale más que el arreglo**: `backend/.env` está en
> `.gitignore`, así que en CI no existe. El resultado era **rojo en local y verde en CI**,
> con CI del lado permisivo. Es la misma ceguera que la compuerta de migraciones (ver el
> archive-report de ANON): el comportamiento difería entre los dos lados y el que decidía
> era el que no veía el problema. Una compuerta que sólo es verde porque le falta un
> archivo no es una compuerta.

### Diagnóstico original

**Síntoma**: `backend/test/e2e/mail.e2e-spec.ts`, los dos tests `C.4: ... se procesa y NO termina en mail:dead` fallan con `Expected: 0, Received: 1` en `deadCount()`.

**Causa raíz**: `backend/.env` trae `SMTP_HOST=localhost` / `SMTP_PORT=1025` (para un catcher tipo MailHog que no está en `compose.yaml` ni se levanta en el harness). `core.module.ts:83` carga ese `.env` incondicionalmente (`envFilePath: ['.env']`). `test-environment.ts` sobreescribe explícitamente el resto de variables de infraestructura (DB, Redis, JWT, rate limit, etc.) pero **no** `SMTP_HOST`, así que el valor del `.env` real queda activo también en el harness. Con `SMTP_HOST` verdadero, `deliverViaSmtp` intenta conectar por nodemailer a `localhost:1025`, que no responde (`ECONNREFUSED`), y tras agotar reintentos la entrada cae en `mail:dead` — exactamente el escenario que C.4 dice que no debería ocurrir.

**Reproducción**:
```bash
cd backend
npm run test:e2e -- --testPathPattern='mail\.e2e-spec' --silent
# → 2 failed, 4 passed

SMTP_HOST= npm run test:e2e -- --testPathPattern='mail\.e2e-spec' --silent
# → 6 passed (confirma la causa raíz)
```

**Fix propuesto**: en `backend/test/support/test-environment.ts`, junto al resto de overrides de infraestructura (cerca de las líneas 136-190), agregar:
```ts
process.env.SMTP_HOST = '';
```
para forzar el camino `log-only` de `deliverViaSmtp` de forma determinista, independiente de lo que traiga el `.env` ambiental. Actualizar también el comentario de `mail.e2e-spec.ts` (líneas 24 y 108), que hoy afirma "SMTP_HOST is unset in this harness" como si fuera garantizado por el harness — con el fix, sí lo será.

**Verificación de cierre**: correr `npm run test:e2e -- --testPathPattern='mail\.e2e-spec'` sin ningún override manual de `SMTP_HOST` y confirmar 6/6 verdes; repetir en la suite completa.

---

## WARNING-A — C.2 es un test que no puede fallar, y su comentario afirma lo contrario

**Rebajado de CRITICAL.** No es un hueco de protección: es peso muerto con una etiqueta
falsa.

**Por qué no es un hueco.** Lo que arregló el defecto original fue el bloque B, no C.2:

```
TEMPLATES: Record<TemplateName, TemplateFn>   ← cobertura total, garantizada al compilar
sin `as never`                                ← un nombre inventado no compila
```

Y el caso que el compilador **no** puede ver —una entrada que llega desde Redis con un
nombre que ya no existe— **ya está cubierto**:
`mail-outbox.consumer.spec.ts:133`, *«sends an unknown template straight to mail:dead
(data defect)»*. Ése es el punto donde el nombre entra como dato (`map.template as
TemplateName`) y donde la comprobación en tiempo de ejecución sirve de algo.

**Por qué igual hay que tocarlo.** El test no puede ponerse en rojo:

```ts
ENQUEUED_TEMPLATE_NAMES: ReadonlyArray<TemplateName>   // cada elemento es un TemplateName válido
TEMPLATES: Record<TemplateName, TemplateFn>            // todo TemplateName tiene entrada
```

De ahí se sigue que `renderMailTemplate(name)` nunca alcanza su rama `if (!fn) throw` para
ningún elemento del array. El bucle es una tautología.

Y el comentario del test **dice lo contrario de lo que hace**:

```ts
// El test NO enumera los nombres a mano:
// eso volvería a partir la costura en dos
for (const name of ENQUEUED_TEMPLATE_NAMES) {   // los enumera, un archivo más allá
```

Es el mismo patrón que el defecto de AUD: un comentario que afirma la garantía contraria a
la que da el código, justo en el punto donde alguien iría a comprobarla. Un test verde con
un comentario así es peor que no tenerlo — el próximo que audite esto lo lee y se queda
tranquilo.

**Fix**: elegir una, no las dos.

1. **Borrarlo** — quitar `ENQUEUED_TEMPLATE_NAMES` de `mail-templates.ts` y el bloque
   `describe` de C.2. En su lugar, un comentario en `mail-templates.ts` diciendo que la
   cobertura total la garantiza `Record<TemplateName, TemplateFn>` al compilar, y que el
   respaldo en ejecución vive en `mail-outbox.consumer.spec.ts`. Es la opción honesta.

2. **Conservarlo como prueba de humo de renderizado**, con nombre y comentario que digan
   eso y nada más: que las ocho plantillas renderizan sin lanzar con datos mínimos. Sin
   afirmar que «recorre la costura».

**Lo que NO hay que hacer**: derivar el array de `Object.keys(TEMPLATES)`. Deriva de
`TEMPLATES` para después comprobar que esas claves están en `TEMPLATES` — más circular que
lo que hay hoy.

**Actualizar también `tasks.md` (C.2/C.3) y `design.md` (D3)**, que describen una costura
que en este diseño no existe: con `Record<TemplateName, …>` y sin los casts, los dos lados
son el mismo tipo. La costura que sí existe está en el consumidor, donde el nombre llega
como cadena.

---

## WARNING (no bloquean, pero deberían registrarse)

- **G.5**: `tasks.md` pide que la mutación de quitar `app.set('trust proxy', ...)` haga caer G.2 y G.4. G.2 (`proxy-trust.spec.ts`) prueba la función pura `isTrustedProxyAddress` sin pasar por `app.set`, así que no puede caer por esa mutación — confirmado en esta ronda (14/14 pasan igual). Ajustar el texto de la tarea para pedir sólo G.4, o agregar un test de bootstrap que dependa del cableado real.
- **Frontend `npx tsc -b --noEmit`**: sigue en rojo por 3 specs preexistentes no tocados por este change (confirmado con `git log`). No bloquea esta fase pero la compuerta declarada en `tasks.md` no se cumple; ya está anotado como deuda en `apply-progress.md`, falta ticket propio.

---

## Qué NO hace falta rehacer

Todo lo demás verificado en esta ronda está correcto y probado con evidencia de ejecución real + mutación: B.1/B.2 (casts fuera), D.1 (`MAXLEN ~ 1000`), E.1-E.6 (confirmación de correo, validador de grupo, campo que no viaja), F.1-F.3 (mensaje único), G.1-G.4/G.6 (trust proxy por dirección), H.1-H.7 (GeoReporta, sin literales sueltos). No re-tocar estos bloques al resolver CRITICAL-1.

Las mutaciones que sí cayeron, con el nombre del test, para que no haya que repetirlas:

| Mutación | Cayó |
|---|---|
| Quitar el validador de grupo (E.2) | `E.5: dos correos distintos → inválido` y `E.5: editar tras confirmar → inválido` |
| Quitar el `app.set('trust proxy')` (G) | G.4, en `trust-proxy-rate-limit.e2e-spec.ts` (429 en vez de 200) |
| Escribir el nombre del producto a mano en una plantilla (H.5) | `mail-templates-no-literals.spec.ts` |

Y una nota de método para la próxima ronda: **el subconjunto de 6 e2e tardó ~125 s frente a
~687 s la suite completa de 50**, y no dio ni un falso negativo frente a ella. Usar el
subconjunto para iterar y mutar; la completa, una vez al final.
