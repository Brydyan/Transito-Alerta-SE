# Archive Report — F1 · Navegación (sc-303)

**Change**: `2026-08-29-f1-menu-routing-alignment`
**Archivada**: 2026-09-02
**Veredicto**: PASS en la tercera pasada de `sdd-verify` — 0 CRITICAL, 0 WARNING, 3 SUGGESTION
**Commit del código**: `d55efdb`

---

## Qué entregó

Las 5 entradas del sidebar apuntaban a rutas inexistentes en `app.routes.ts` y caían al
wildcard 404. `MENU_MAP` se reescribe en español con `group` y `order` (10 entradas), se
registran 7 rutas placeholder para los destinos de F2–F4, y se engancha el huérfano
`citizen-report`.

El entregable de fondo no son las rutas arregladas sino **`menu-map.spec.ts`**: el test
que falla si menú y rutas vuelven a divergir. Lee `frontend/src/app/app.routes.ts` desde
disco y compara contra `MENU_MAP`, cruzando la frontera backend↔frontend que es
exactamente donde nace la divergencia.

Spec consolidado en `openspec/specs/admin-panel-backend/spec.md` (Grupo 0, requisitos
F1-01 a F1-05). Los Grupos 1–7 preexistentes quedaron intactos: las únicas líneas
eliminadas fueron el título y la metadata de cabecera, reescritos para cubrir los dos
changes.

## Deudas cerradas

| Deuda | Origen | Evidencia |
|---|---|---|
| `transformBackendMenu()` no popula `group`; el backend tampoco lo envía | F0 | Verificada de punta a punta: `menu-map.ts` → `menus.service.ts` → `menu.service.ts` → `sidebar.component.ts:76-91` |
| Sidebar cae al 404 | Defecto abierto | Las 10 entradas resuelven; las 6 placeholder renderizan |

---

## Tres pasadas: qué atrapó cada una

| Pasada | Resultado | Hallazgos |
|---|---|---|
| 1 | FAIL | 6 de 10 destinos reventaban con `NG0950`; el test D6 nunca leía `app.routes.ts` |
| 2 | FAIL | El test ya leía el archivo real, pero `KNOWN_APP_ROUTES` seguía siendo un bypass sin condicionar |
| 3 | PASS | Lista eliminada; probado en ambas direcciones |

**Las tres veces el mecanismo fue el mismo: una regla correcta con una excepción más
ancha que su justificación.** La exención de la pasada 2 estaba escrita «para rutas
parametrizadas» y se aplicaba a todas, mientras el filtro de la línea siguiente
(`!s.startsWith(':')`) ya excluía los segmentos con `:`. Borrar la lista salió más simple
que condicionarla.

Es el patrón que el ROADMAP documenta como recurrente, esta vez **dentro del test
construido para impedirlo**.

Regla operativa que deja para las fases siguientes: cuando aparezca una exención en un
gate, la pregunta útil no es *¿la exención es razonable?* sino **¿la guarda comprueba la
condición que la justifica?**

---

## Deuda que sobrevive al archivado

### SUGGESTION 1 — el parser valida por segmentos, no por jerarquía · **con fecha de caducidad**

`menu-map.spec.ts` comprueba que cada segmento de una ruta de `MENU_MAP` exista en
`app.routes.ts`, pero **no** que la jerarquía coincida: `/app/categorias` y
`/app/admin/categorias` le resultan indistinguibles.

Hoy no es alcanzable — el `MENU_MAP` tiene 10 entradas y sólo 2 rutas multi-segmento,
ambas reales. **Se vuelve alcanzable a medida que el menú crezca**, y F2, F3 y F4 añaden
destinos.

No es una nota al pie: es deuda con vencimiento. **Dueño natural: F5**, que sustituye
`MENU_MAP` por 4 tablas en BD y rehace este test de todos modos.

### SUGGESTION 2 — `frontend/package.json` sin script `lint`
`tasks.md:64` exige `pnpm lint` y el script no existe.

### SUGGESTION 3 — hueco compartido de `@types/node`
Cinco specs de regresión del frontend usan `node:fs`, `node:path` y `__dirname` sin los
tipos: `layout-tokens.regression`, `contrast.regression`, `sidebar`,
`auth.interceptor.regression` y el patrón general. Produce 14 errores en
`npx tsc -b tsconfig.json --noEmit`, **ninguno atribuible a F1**.

---

## Recomendación: un change propio de tooling

Las dos últimas SUGGESTION, más el defecto ya registrado en «Defectos abiertos» del
ROADMAP, son la misma clase de problema:

| Síntoma | Efecto |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` compila **cero** archivos (`files: []`) y sale 0 siempre | Toda verificación de tipos del frontend es un no-op |
| `@types/node` ausente en 5 specs de regresión | 14 errores permanentes que normalizan el rojo |
| `frontend/package.json` sin script `lint` | Un gate declarado en tasks que no existe |

**Los tres son compuertas que no comprueban lo que dicen comprobar** — la misma clase de
defecto que costó tres pasadas en F1, sólo que en la capa de herramientas. Un gate que no
corre se lee igual que un gate que pasa.

Conviene un change dedicado que los cierre junto, y que deje `actionlint` como gate de CI
(ambos workflows ya pasan limpios). **No se crea acá**: queda propuesto.

---

## Nota sobre este archivado

La copia automática al archivo resultó **lossy** y se corrigió a mano:

- `verify-report.md` llegó con **144 líneas frente a 431**: faltaban las pasadas 1 y 2,
  justo el registro de por qué este change necesitó tres. Restaurado desde el origen.
- `apply-progress.md` traía una alteración silenciosa de contenido (`SQL/JS` → `SQL/js`).
  Restaurado.
- `archive-report.md` no se había escrito. Es este archivo.

El origen se eliminó **después** de comprobar con `diff -rq` que la copia era idéntica.
Conviene recordarlo la próxima vez: verificar antes de borrar no es ceremonia.
