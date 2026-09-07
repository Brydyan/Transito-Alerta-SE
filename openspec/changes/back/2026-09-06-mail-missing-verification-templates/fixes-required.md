# Fixes Required: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda de verify**: 2
**Fuente**: `verify-report.md` de esta misma ronda

**Estado: 1 CRITICAL nuevo bloquea el archivado.** El CRITICAL-1 original (SMTP_HOST) y el
WARNING-A de la ronda 1 están resueltos y confirmados con ejecución real + mutación. El
particionado de CI que se agregó para acelerar el e2e tiene un defecto que le impide
ejecutar un solo test en el pipeline real.

---

## CRITICAL-CI — `pnpm run test:e2e -- --shard=N/4` no ejecuta ningún test en CI

**Síntoma reproducido**: `ci.yml:226` corre
`pnpm run test:e2e -- --shard=${{ matrix.shard }}/4`. Ejecutado tal cual (mismo pnpm
11.20.0 que fija `packageManager` y que `pnpm/action-setup@v4` instala en CI):

```
$ pnpm run test:e2e -- --shard=1/4
> jest --config ./test/jest-e2e.json -- --shard=1/4
No tests found, exiting with code 1
Pattern: --shard=1/4 - 0 matches
[ELIFECYCLE] Command failed with exit code 1.
```

Las cuatro particiones (`1/4` a `4/4`) fallan igual: 0 tests ejecutados, exit 1.

**Causa raíz**: pnpm reenvía el `--` literal al comando subyacente en vez de quitarlo (a
diferencia de `npm run`, verificado en paralelo: `npm run test:e2e -- --shard=1/4
--listTests` sí funciona). El `--` extra queda como primer argumento posicional para el
parser de jest (yargs), que a partir de ahí deja de reconocer `--shard=N/4` como opción y
lo trata como patrón de ruta de test literal — de ahí `Pattern: --shard=1/4 - 0 matches`.

**Confirmado que la partición en sí es correcta**: `npx jest --config
./test/jest-e2e.json --shard=N/4 --listTests` (sin pasar por `pnpm run`) da 14/14/13/13
archivos cuya unión es exactamente el conjunto completo de 54, sin solapamiento. El
problema es específicamente el paso por `pnpm run -- ...`.

**Confirmado que quitar el `--` arregla el paso de la bandera**: `pnpm run test:e2e
--shard=1/4 --listTests` (sin el separador `--`) da los mismos 14 archivos que el jest
directo.

**Confirmado que `integration-gate` no queda en falso verde**: su lógica
(`success|skipped` → exit 0, cualquier otra cosa → exit 1) es correcta — con el bug de
arriba, reportaría `failure` (correcto, no silencioso), pero eso significa que el gate de
integración quedaría permanentemente rojo en cada push a `main`/`develop` y cada PR con
cambios en paths de integración, bloqueando merges sin que se ejecute un solo test e2e
real. No es un hueco de seguridad, es una regresión operativa severa.

**Fix propuesto** (no aplicado — sólo diagnóstico, según las reglas de esta ronda):
en `.github/workflows/ci.yml:226`, quitar el separador `--`:

```yaml
- run: pnpm run test:e2e --shard=${{ matrix.shard }}/4
```

**Verificación de cierre**: correr, para cada N en 1..4,
`pnpm run test:e2e --shard=N/4 --listTests` y confirmar que la unión de las cuatro listas
es exactamente el conjunto de 54 archivos que da `npx jest --config
./test/jest-e2e.json --listTests`; después correr al menos una partición completa (sin
`--listTests`) y confirmar que ejecuta tests de verdad (no "No tests found"). Idealmente,
confirmar en un run real de CI (Actions), no sólo en local, dado que ya hubo un caso en
este mismo change de comportamiento distinto entre local y CI (CRITICAL-1 de la ronda 1).

---

## CRITICAL-1 (SMTP_HOST) — ✅ RESUELTO, confirmado en ronda 2

`test-environment.ts` fuerza `process.env.SMTP_HOST = ''` antes de
`createNestApplication()`. Confirmado sin overrides manuales: 6/6 suites del subconjunto,
27/27 tests, y en el e2e completo 54/54 suites, 470/470 tests. Mutación de la ronda 2
(quitar la línea): cayeron exactamente los mismos 2 tests de C.4 que en la ronda 1.
Confirmado en código que `'' || undefined` evalúa `undefined` y que
`if (!mailConfig.smtpHost)` toma la rama log-only. No re-abrir sin nueva evidencia.

---

## WARNING-A (C.2 tautológico) — ✅ RESUELTO, sin commitear

El árbol de trabajo (sin commitear al momento de esta ronda) ya implementa la opción 1 de
la ronda 1: `ENQUEUED_TEMPLATE_NAMES` y el `describe` de C.2 fueron borrados de
`mail-templates.ts` / `mail-templates.spec.ts`, con un comentario que documenta que la
cobertura la garantiza `Record<TemplateName, TemplateFn>` al compilar, y que el caso
runtime (nombre que llega como cadena desde Redis) está cubierto por
`mail-outbox.consumer.spec.ts`. Confirmado con mutación en la ronda 2: romper la detección
de nombre desconocido en el consumidor (`startsWith('Unknown mail template')`) hace caer
exactamente `sends an unknown template straight to mail:dead (data defect)`.

**Pendiente, no CRITICAL**: este cambio, junto con el ajuste de redacción de G.5 en
`tasks.md`, está sin commitear. Alguien debe decidir comitearlo como parte de este change
(recomendado — ya está verificado) o descartarlo explícitamente antes de archivar.

---

## Qué NO hace falta rehacer

Todo lo verificado en rondas anteriores con evidencia de ejecución real + mutación sigue
en pie sin cambios: B.1/B.2, D.1, E.1-E.6, F.1-F.3, G.1-G.4/G.6, H.1-H.7. La mutación de
IPv4-mapped IPv6 en `proxy-trust.ts` (commit `9581104`) se auditó por separado esta ronda y
tiene red real: cae `IPv4-mapped IPv6 (::ffff:127.0.0.1) SÍ es de confianza (G.4)` al
quitar el strip del prefijo.

Nota de método, otra vez confirmada: el subconjunto de 6 e2e (~125s) predijo correctamente
el resultado de la suite completa (~614s) sin ningún falso negativo. Seguir usándolo para
iterar; la suite completa, una sola vez al final.
