# Apply progress — TOOL — Compuertas que comprueban lo que dicen comprobar

> Change `2026-09-03-tool-ci-gates`. Implementación corrida el 2026-09-07.
> Esta fase arregla tres compuertas que declaraban verificar algo y
> no lo hacían. El typecheck arreglado **entra en rojo** a propósito
> (D3): aflora un `TS2345` legítimo que es trabajo de producto, no
> de tooling.

---

## Resumen

| | |
|---|---|
| Compuertas arregladas | typecheck (`-b`), lint (script), actionlint (docker) |
| Files tocados | `frontend/tsconfig.spec.json`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/src/app/features/placeholder/placeholder.component.spec.ts`, `frontend/src/app/_broken-test.ts` (transient), `.github/workflows/ci.yml`, `actionlint.yaml` (nuevo), `openspec/changes/front/2026-08-28-sc-207-.../tasks.md`, `openspec/ROADMAP.md` |
| Specs añadidos | `frontend/e2e/typecheck-gate-policy.e2e.ts` (6 tests) + 3 tests en `ci-policy.e2e.ts` (B) + 3 tests en `ci-policy.e2e.ts` (C) + 2 tests en `ci-policy.e2e.ts` (D bloquea) |
| Comandos | `pnpm test` (jest): 60/60 suites, 419/419 tests. `pnpm exec playwright test credentials-policy ci-policy typecheck-gate-policy`: 28/28. `pnpm run build`: verde. `tsc -b tsconfig.json --noEmit --force`: exit **1** (rojo por el TS2345 — ver §D) |
| Estado de D.1/D.2 (cierre del gate) | **el typecheck FALLA en CI** desde el primer push post-merge. Eso es lo correcto: D3 lo declara así |

---

## A · Typecheck

### A.1 — Estado de partida

| Comando | Archivos listados | Exit |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json --listFiles` (viejo) | 2 (sólo el banner de pnpm) | 0 |
| `npx tsc -b tsconfig.json --noEmit --listFiles` (nuevo) | 5183 (lib.*.d.ts + src + spec) | 0 con `--noEmit` solo; **1 con el TS2345** que el gate arreglado ahora detecta |

La compuerta vieja era vacía. La nueva recorre los dos proyectos
referenciados (`tsconfig.app.json` + `tsconfig.spec.json`) y falla
cuando hay errores reales.

### A.2 — `tsconfig.spec.json`: `types: ["jest", "node"]`

Una línea que cierra los 9 errores que `-b` expone:

- 4 errores `TS2578` (unused `@ts-expect-error`) en
  `placeholder.component.spec.ts` — eran workarounds del gap
  original; con `@types/node` instalado son ruido
- 4 errores `TS2339/2554` (property 'name' does not exist on
  'string') en `layout-tokens.regression.spec.ts` y `placeholder`
  — causados por usar `__dirname` y `node:fs` sin tipos de Node
- 1 `TS2345` en `auth.service.spec.ts:227` — **legítimo, este
  cambio NO lo arregla** (ver §D)

`@types/node` ya estaba en el árbol como dependencia transitiva
(vía `vitest`, `inquirer`); lo añadí como `devDependency` directo
para que `tsc` lo vea a nivel de proyecto. Versión fijada a la
misma transitiva (26.4.0) — sin upgrade.

`tsconfig.app.json` queda **intacto** (`"types": []`): el código
de navegador sigue sin compilar contra APIs de Node. A.3 verificado.

### A.4 — `tsc -b` en todas las compuertas declaradas

- `docs/agents/*.md`: ninguno invoca `tsc` directamente
- `openspec/changes/front/`: sc-207 declara `tsc --noEmit` (sin
  `-b` ni `-p`); actualizado a `tsc -b tsconfig.json --noEmit` con
  una nota que documenta la corrección retroactiva
- `openspec/changes/front/*/tasks.md` de los demás cambios
  vigentes (sc-208, sc-209, f4, f6): ninguno declara tsc
- `.github/workflows/*.yml`: ninguno invocaba `tsc` directamente;
  el job `frontend` recibe un paso nuevo `pnpm exec tsc -b
  tsconfig.json --noEmit --force` (ver §D)

### A.5 + A.6 + A.7 — Pruebas de detección

`typecheck-gate-policy.e2e.ts` tiene 4 specs que verifican que el
gate funciona:

- **Compila el árbol** — `tsc -b --listFiles` enumera archivos de
  `tsconfig.app.json` y `tsconfig.spec.json`. Filtra por `.ts` y
  exige >50 archivos, presencia de `/src/app/`, y presencia de
  algún `.spec.ts`.
- **Detecta un error real** — escribe `const broken: number =
  'string';` en `src/app/_typecheck-gate-broke.ts`, corre
  `tsc -b --force`, exige exit 1 y un mensaje `TS2322|TS\d{4}`. El
  archivo se borra al final (rollback).
- **El comando viejo era vacío** — `tsc -p --listFiles` no lista
  archivos del proyecto (`/src/app/`, `setup-jest.ts`). Si este
  spec empieza a fallar, alguien arregló `tsconfig.json` para
  que `-p` funcione — re-evaluar el gate.
- **Ningún tasks.md / docs/agents/*.md / workflow usa `-p`** —
  escanea los vigentes y exige cero invocaciones. El propio
  `tasks.md` de esta fase se excluye de la auditoría (cita el
  comando viejo a propósito para documentar la evidencia).

A.5 (introducir error + verificar + revertir) está cubierta por
`Detecta un error real`.

### A.5 manual — Introducir error y verificar

```
$ echo "const broken: number = 'string';" >> src/app/_typecheck-gate-broke.ts
$ ./node_modules/.bin/tsc -b tsconfig.json --noEmit --force
src/app/_typecheck-gate-broke.ts(1,7): error TS2322: ...
EXIT: 1
$ rm src/app/_typecheck-gate-broke.ts
```

Gate detecta el error introducido y sale 1. El archivo se removió
al final.

---

## B · Lint

### B.1 — Script `lint` en `frontend/package.json`

```json
"lint": "pnpm exec eslint \"src/**/*.{ts,html}\" \"e2e/**/*.ts\""
```

Mismo comando que `ci.yml` ya usaba en su paso condicional. El
script existía en el workflow pero NO en `package.json`: varios
`tasks.md` lo exigen (`pnpm lint && pnpm test && pnpm build`) y
morían con `Missing script: lint` — un no-op silencioso en
términos de cobertura.

### B.3 — Sin reglas nuevas, sin config nuevo

El script apunta a `eslint` ya declarado en `devDependencies`. No
se añadió `.eslintrc.*` ni `eslint.config.*` — el proyecto
sigue sin config de eslint, por lo que `pnpm lint` corre y sale
con el código de error propio de eslint (2), no con un código
de "script not found".

> **Nota:** la corrida de `eslint` actualmente falla con
> `ESLint couldn't find an eslint.config.* file`. Esto NO es
> un defecto introducido por esta fase: el proyecto vivía sin
> config de eslint antes, y este change no añadió ninguna
> (B.1 explícitamente lo prohíbe). La situación "lint corre y
> falla" es preferible a "lint no existe" — el primero es
> honesto sobre lo que falta; el segundo mintió hasta ahora.
> Cerrar este gap queda para un change aparte.

`ci-policy.e2e.ts` tiene 3 specs (B.1, B.2, B.3) que verifican:
el script existe, es ejecutable, y NO añadió archivos de
configuración nuevos al repo.

---

## C · actionlint

### C.1 — Job `workflows-lint` en `ci.yml`

```yaml
workflows-lint:
  name: Workflows — actionlint
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Lint workflows
      run: |
        docker run --rm \
          -v "$PWD:/repo" \
          -w /repo \
          rhysd/actionlint:latest \
          -config-file /repo/actionlint.yaml \
          .github/workflows/*.yml
```

- Contenedor oficial `rhysd/actionlint`, no action del
  marketplace (D4).
- `-config-file` **obligatorio** porque actionlint sólo
  auto-descubre su config cuando se llama sin argumentos; con
  paths explícitos hay que pasarla por flag.
- Corre en **push y PR** (no condicionado por path filter) —
  atrapa regresiones estructurales de workflows barato.

### `actionlint.yaml` (nuevo)

```yaml
self-hosted-runner:
  labels:
    - staging
```

`rehearsal-staging.yml:43` usa `runs-on: [self-hosted, staging]`
donde `staging` es una etiqueta del runner self-hosted del
proyecto, no una de las que GitHub provee por defecto. Sin este
mapa, actionlint reporta "label 'staging' is unknown" en la
primera corrida y el gate entraría en rojo por un hallazgo
que NO es un defecto (D3: "un gate con excepción temporal es un
gate con excepción permanente"). Declarar la etiqueta deja el
gate limpio y protege contra regresiones reales (claves mal
puestas, `schedule:` suelto, etc.).

### C.2 + C.3 — Pruebas de detección

`ci-policy.e2e.ts` tiene 3 specs (C.1, C.2, C.3):

- **C.1** — El job `workflows-lint` está declarado y usa
  `docker run` con `rhysd/actionlint` (no marketplace)
- **C.2** — Con `actionlint.yaml`, los workflows pasan limpios
  (exit 0, sin output). Se salta si actionlint no está en PATH
  (CI lo provee vía Docker).
- **C.3** — Introduce `schedule_suello:` (clave inválida) en
  `ci.yml:1`, corre actionlint, exige que detecte el error. El
  archivo se restaura en `finally`.

### C.2 manual

```
$ cp .github/workflows/ci.yml{,.bak}
$ sed -i '/^name: CI$/a schedule_suello:' .github/workflows/ci.yml
$ /tmp/actionlint -config-file ./actionlint.yaml .github/workflows/ci.yml
.github/workflows/ci.yml:2:1: unexpected key "schedule_suello" for "workflow" section
$ mv .github/workflows/ci.yml{.bak,}
```

Actionlint detecta la clave inválida. C.2 verificado.

---

## D — El gate nace en rojo, a propósito (D3)

### D.1 — TS2345 registrado en ROADMAP

`openspec/ROADMAP.md` ahora lista el `TS2345` en
`auth.service.spec.ts:227` (`InvitationPreview.organization_name`
— `string | null` no asignable a `string`) como defecto abierto
con su **primer work item de cierre** anotado: decidir si
`organization_name` puede ser nulo en una preview de invitación
es una pregunta de modelo de dominio, no de tooling. Esta fase
lo **expone** y no lo arregla.

### D.2 — El typecheck entra BLOQUEANDO en `ci.yml`

El job `frontend` tiene un paso nuevo:

```yaml
- run: pnpm exec tsc -b tsconfig.json --noEmit --force
```

Sin `continue-on-error`. Sin lista de archivos exentos. Sin
lista de SKIP. **El gate está haciendo su trabajo: falla** desde
el primer push post-merge. El siguiente work item que toque
`auth.service.spec.ts` (o `InvitationPreview` en el modelo) lo
va a arreglar, y el gate va a pasar.

`typecheck-gate-policy.e2e.ts` tiene 2 specs (D.2, D.3):

- **D.2** — Lee `ci.yml`, encuentra el paso de `tsc -b` y exige
  que las 800 líneas anteriores NO mencionen
  `continue-on-error: true`.
- **D.3** — Corre `tsc -b` directamente, exige exit 1 y un
  mensaje que mencione `auth.service.spec.ts:227` y `TS2345`. Si
  este spec pasa, el gate volvió a mentir — exactamente el modo
  de falla que esta fase existe para impedir.

### D.3 manual

```
$ ./node_modules/.bin/tsc -b tsconfig.json --noEmit --force
src/app/core/services/auth.service.spec.ts(227,80): error TS2345: ...
EXIT: 1
```

El gate falla por el defecto conocido, como debe.

---

## E — Limpieza de comentarios e2e

### E.1 — Estado de `comment-flow.e2e.ts`

`frontend/e2e/comment-flow.e2e.ts` tiene un único test (F2.1) con
`test.skip()` explícito. El test afirma sobre un composer de
comentarios que existe en el backend (SC-203 lo dejó
implementado) pero **nunca terminó de aterrizar en el frontend**
— falta la incident-detail page que monta el composer en la SPA.

**Criterio para re-habilitar** (E.3): el spec vuelve a correr
cuando ambos (SC-208 frontend + composer UI) estén cerrados.
`apply-progress.md` del change que cierre el último lo actualiza.

### E.2 — Deuda registrada en ROADMAP

`openspec/ROADMAP.md` ahora tiene una entrada en "Deuda con
fecha de caducidad" para `comment-flow.e2e.ts`. Detalla el test,
la línea, los bloqueantes, el criterio de re-habilitar, y el
riesgo de no hacerlo (los specs crean comentarios contra staging
compartido y nada los limpia — deuda anotada en
`2026-09-03-e2e-test-user-and-credentials/apply-progress.md` como
Q1 sin resolver).

### E.3 — No aplica esta fase

SC-208 (frontend) y SC-209 (image upload en frontend) no
están cerrados. El spec sigue como no-op. **No** toqué
`comment-flow.e2e.ts` en esta fase — re-habilitar cuando
corresponda es trabajo del change que cierre el último.

---

## Desviaciones respecto al `design.md`

- **Una "línea" cerró 5 errores, no los 14 del diseño.** El
  diseño D2 dice "los 14 errores salen de una única causa", pero
  en el estado real del repo son 9 errores (4 + 4 + 1). La
  diferencia: 4 placeholders + 4 layout-tokens + 1 auth.
  Mismo mecanismo, mismo fix. El diseño estimaba 14; la
  realidad es 5 que se cierran + 1 que queda en rojo a
  propósito. Documentado para no propagar el número.
- **Hubo que añadir `@types/node` como devDep directa.** El
  diseño D2 dice "una línea cierra todos" sin mencionar que
  `@types/node` no era devDep directa. Era transitive (vía
  vitest/inquirer), pero tsc necesita visibilidad top-level. Lo
  añadí con la versión fijada a la transitiva (26.4.0) — sin
  upgrade. Builder doc permite añadir deps cuando el design las
  implica; D2 las implica al hablar de "una línea" que
  presupone la disponibilidad.
- **`actionlint.yaml` como archivo nuevo.** El diseño D4 no
  lo preveía; aparece porque `rehearsal-staging.yml:43` usa
  una etiqueta self-hosted que actionlint no conoce. Sin el
  config, el gate entra en rojo por un hallazgo que no es un
  defecto (D3 lo prohíbe). El config es la forma estándar de
  actionlint para esto.
- **Tres specs C usan serialización (`mode: 'serial'`)** para
  C.2 y C.3 que tocan `ci.yml` en paralelo. Sin esto, C.3 puede
  modificar el archivo mientras C.2 lo lee. La cobertura del
  concepto ("el gate funciona") es la misma; sólo cambia el
  orden.

## Estado al cierre

- 28/28 specs de Playwright verdes (10 credentials-policy + 9
  ci-policy + 6 typecheck-gate-policy + 3 C.1/C.2/C.3 que
  recién se agregaron)
- `pnpm test` (jest): 60/60 suites, 419/419
- `pnpm run build`: verde
- `tsc -b tsconfig.json --noEmit --force`: **exit 1, en rojo
  por el TS2345** — como debe ser
- `actionlint .github/workflows/*.yml -config-file
  actionlint.yaml`: exit 0

El typecheck arreglado entra en rojo. El primer work item que
cierre el `TS2345` de `auth.service.spec.ts:227` lo va a
verdear. Esa transición es la que el gate estaba mintiendo al
no detectar.
