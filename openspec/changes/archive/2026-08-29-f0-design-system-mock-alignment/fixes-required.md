# Correcciones requeridas — F0 Design System Alignment

---

# ▶ RONDA 3 — 2026-09-01 (última; leé esto primero)

**La ronda 2 quedó cerrada. Veredicto: PASS WITH WARNINGS, 0 CRITICAL.**
`rtk jest` da **192/192 verde** (subió de 178), build verde, cero cambios bajo `backend/`
ni en `app.routes.ts`.

R2.1 se verificó **rompiéndolo**: el auditor inyectó `bg-slate-100 text-slate-700` en
`pendiente`, tres tests rompieron, revirtió y confirmó el árbol limpio. Eso es lo que
convierte una lista editada en una red que atrapa — buen trabajo.

También se revisó uno por uno el alcance que quedaba en duda (`app.config.ts`,
`menu.model.ts`, `menu.service.ts`, `header.*`, `system-config.component.html`,
`angular.json`, `setup-jest.ts`): **todos en alcance o necesarios. Cero scope creep.**

Quedan tres ítems chicos. Ninguno bloquea, pero se cierran antes de archivar para no
dejar documentación equivocada en un change cerrado.

## R3.1 — Declarar el fix de `menu.service.ts` en `apply-progress.md`

El cambio en `menu.service.ts` (`menu_order` / `is_active`) **es necesario**: el auditor
lo revirtió y confirmó un `TS2322` real. No es alcance que se fue.

Pero no está declarado. **Un cambio necesario y no declarado es indistinguible de uno
colado**, hasta que alguien lo revierte para averiguarlo — que es lo que hubo que hacer.

Agregalo a `apply-progress.md` con el motivo (el error de tipos concreto) y dejá
constancia de que **no toca `group`**: W-4 sigue diferido a F1, y conviene que se lea.

> **Nota de herramienta**: el auditor detectó ese `TS2322` con `npx tsc` **sin filtrar**.
> `rtk tsc` dio **falso negativo**. Es el modo de fallo opuesto al del truncado de flags
> de Jest, y peor: un filtro que trunca se nota, uno que oculta un error real no.
> **Para typecheck usá `npx tsc` crudo.** Para el resto seguí con `rtk`.

## R3.2 — El regex `STRUCTURAL_PREFIX` deja vacío el test estructural para `text-*`

En **ambos** specs — `ui-badge.component.spec.ts` y `ui-kpi-card.component.spec.ts` — el
regex `STRUCTURAL_PREFIX` tiene una alternativa `text-` **desnuda**, que matchea
cualquier clase `text-*`. El test de allowed/structural queda vacío para toda esa
familia.

El auditor lo probó con `text-purple-500`: lo atrapó el test de contrato exacto, **no
éste**. Hay otra capa que cubre, así que no es explotable hoy — pero es defensa vacía, y
es exactamente la clase de defecto que motivó R2.1.

Acotá la alternativa a las clases estructurales reales (`text-xs`, `text-sm`,
`text-white`, …) en vez del prefijo pelado. **Y probalo como probaste R2.1**: meté
`text-purple-500`, confirmá que *este* test lo agarra, revertí.

## R3.3 — La cifra `8.1:1` de `amber` es del badge, no del KPI

El `8.1` sale de la tabla de D10, donde corresponde al badge `medium` con fondo
**tintado** (`bg-prio-medium/40`). En `ui-kpi-card` el fondo es **sólido**
(`bg-prio-medium`), que es otro par: el auditor lo recalculó en **≈6.29:1**.

Pasa 4.5 con margen — el color está bien, la cifra citada no. Corregí en:

- `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts:47` y `:146`
- `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.spec.ts:18`
- `apply-progress.md:33`

Es la segunda vez que una cifra de contraste no sobrevive al recálculo. **Regla para
adelante: citá el umbral («≥ 4.5 ✓») y no el valor**, salvo que lo hayas medido vos en
ese contexto exacto. Un número copiado de otro contexto envejece peor que ninguno.

## Fuera de tu alcance

- **`tasks.md:39`** citaba el mapeo previo a D10. Ya corregido por el arquitecto.

## Gates

```
rtk jest && rtk npm run build     # desde frontend/
```
192/192 debe seguir en verde. Actualizá `apply-progress.md` y avisá.
**Después de esta ronda, F0 va a `sdd-archive`.**

---
---

# Ronda 2 — 2026-09-01 (cerrada, contexto histórico)

**La ronda 1 quedó cerrada.** Los tres CRITICAL están resueltos y verificados con
ejecución real: build verde, **178/178 tests**, contraste recalculado de forma
independiente por el auditor (los ocho pares dan entre 6.47 y 11.65). El change del
interceptor también quedó bien — con un `auth.interceptor.regression.spec.ts` que no
estaba pedido. Buen trabajo.

Veredicto: **PASS WITH WARNINGS**. Queda **un** ítem tuyo antes de archivar, más dos de
prioridad baja. Todo lo de abajo (ronda 1) ya está hecho: consultalo sólo como contexto.

## R2.1 — El test anti-regresión de `ui-badge` no cubre el defecto que motivó todo

**Archivo**: `frontend/src/app/shared/components/ui-badge/ui-badge.component.spec.ts:50-76`
**Prioridad**: hacer antes de archivar

```ts
const ALLOWED_CLASS_PREFIXES = [
  'bg-status-', 'bg-prio-', 'bg-brand-',
  'bg-slate-',      // ← hueco
  'text-status-', 'text-prio-', 'text-brand-',
  'text-slate-',    // ← hueco
  'text-on-tint-', 'text-white',
];

const FORBIDDEN_CLASS_PREFIXES = [
  'bg-red-', 'bg-amber-', 'bg-emerald-', 'bg-indigo-', 'bg-blue-',
  'bg-green-', 'bg-yellow-', 'text-red-', 'text-amber-', 'text-emerald-',
];
```

`bg-slate-` y `text-slate-` están **permitidos** y **no prohibidos**. Resultado:
`bg-slate-100 text-slate-700` en `pendiente` —el defecto exacto de CRITICAL-1, el que
motivó la primera auditoría entera— **pasa los dos tests sin que ninguno lo detecte.**

Además son entradas muertas: la implementación actual usa `text-on-tint-slate`, que
matchea el prefijo `text-on-tint-`. Ninguna variante necesita `bg-slate-` ni
`text-slate-`.

**Corrección**:
1. Quitar `'bg-slate-'` y `'text-slate-'` de `ALLOWED_CLASS_PREFIXES`.
2. Añadirlos a `FORBIDDEN_CLASS_PREFIXES`, junto con las familias stock que faltan:
   `text-green-`, `text-blue-`, `text-indigo-`, `text-yellow-`, `text-slate-`,
   `bg-slate-`.
3. **Verificá que el test falla de verdad**: poné `bg-slate-100 text-slate-700` en el
   caso `pendiente`, corré el test, confirmá que rompe, y revertí. Un test anti-regresión
   que nunca se vio fallar no está verificado — es lo que pasó con la versión actual.

## R2.2 — `ui-kpi-card` conserva clases stock en dos tonos

**Archivo**: `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts:136-148`
**Prioridad**: baja — sin consumidores hoy

Los tonos `slate` y `amber` usan `bg-slate-700`, `text-slate-900`, `bg-amber-500`.
Contradice el escenario «Sin color fuera de los tokens» de `spec.md`, que cubre
**cualquier** primitivo de F0.

`slate` → usá `--color-on-tint-graphite` o `--color-status-cerrada` según corresponda al
rol. `amber` → `--color-prio-medium`. Si el tono necesita un valor que no existe en la
paleta, **decilo en vez de improvisar**: es un token que falta, no una excepción.

Conviene que `ui-kpi-card.component.spec.ts` tenga la misma red de
allowed/forbidden prefixes que `ui-badge`. Mismo defecto, mismo blindaje.

## R2.3 — `apply-progress.md` incompleto

**Prioridad**: baja

Falta declarar `_modals.css` como consumidor del alias, y el comentario
`pending ≠ pendiente`. El comentario técnico está en `_variables.css`, que es donde hace
falta — pero `apply-progress.md` es lo que lee la siguiente auditoría.

Registrá también que `_modals.css` terminó **migrado a tokens canónicos**, no sólo
declarado. Hiciste más de lo pedido y no consta.

## Fuera de tu alcance — no lo toques

- **`spec.md:97-98`** (contradicción «texto blanco» vs D12): ya corregido por el
  arquitecto. Era un defecto del contrato, no tuyo.
- **`menu.service.ts:45-55`** — `transformBackendMenu()` no popula `group` y el backend
  tampoco lo envía, así que el sidebar agrupado sólo funciona con el mock de
  `sidebar.spec.ts`. **Es F1**, ya trasladado a ese change. No lo arregles acá.

## Gates

```
pnpm test && pnpm build     # desde frontend/
```
178/178 debe seguir en verde. Actualizá `apply-progress.md` y avisá para re-verificar.

---
---

# Ronda 1 — 2026-09-01 (cerrada, contexto histórico)

**Change**: `2026-08-29-f0-design-system-mock-alignment`
**Origen**: `verify-report.md` (veredicto **FAIL** — 2 CRITICAL · 5 WARNING · 2 SUGGESTION)
**Para**: Minimax (builder)
**Fecha**: 2026-09-01
**Working dir**: `frontend/`

---

## Antes de empezar — leé esto

1. **No re-audites.** Los hallazgos ya están verificados con ejecución real. Este
   archivo te da archivo, línea y corrección. Si algo no cuadra con lo que ves en el
   código, **paralo y escalá** en vez de improvisar — significa que el código cambió
   desde la auditoría.
2. **F0 sigue siendo F0.** No arregles cosas de otras fases aunque las veas rotas.
   Hay una lista explícita de «no tocar» abajo.
3. **Strict TDD activo.** Cada corrección de comportamiento va con su test en rojo
   primero. Varias de las correcciones de acá SON tests — en esos casos el test es el
   entregable.
4. Lo bueno primero: **build verde, iconografía Lucide correcta, logo migrado, sidebar
   agrupado y testeado, 5 de 6 primitivos usando bien los tokens.** El grueso de F0
   está bien. Lo que sigue son dos defectos reales y unos huecos de cobertura.

---

## Estado de los gates (ejecutados de verdad, no reportados)

| Gate | Resultado | Lectura |
|---|---|---|
| `pnpm build` | ✅ verde — 467.88 kB, 3.3s | — |
| `pnpm test` | ⚠️ 100/102 | Las 2 fallas son **pre-existentes**, confirmado: diff cero en `auth.interceptor.spec.ts`. **No son tuyas y no las arregles acá** |
| `pnpm lint` | ➖ no existe | No hay script `lint` en `package.json` ni `eslint.config.*`. **El CI también lo saltea a propósito** ([ci.yml:377-382](../../../../.github/workflows/ci.yml)). No es una desviación de F0 — no hagas nada |
| `pnpm-lock.yaml` | ✅ sincronizado | `lucide-angular` presente, `--frozen-lockfile` pasa. F0.2.1 bien hecho |

### Dato de contexto: el job de frontend del CI está en rojo

El orden del job es `install` → `test` → `build` → `lint`, y `pnpm test` no tiene
`continue-on-error`. Las 2 fallas heredadas del interceptor **cortan el job antes del
build**. Cualquier PR que toque `frontend/` está rojo hoy, desde antes de F0.

**Es un ticket aparte** (mismatch `/api/v1/auth/refresh` vs `/api/auth/refresh` — defecto
de contrato de backend, no de design system). Lo digo sólo para que no te sorprenda ver
el CI rojo después de corregir todo lo de acá, y para que **no lo metas dentro de F0**.

---

## CRITICAL-1 — `ui-badge` no consume los tokens de F0

**Archivo**: `frontend/src/app/shared/components/ui-badge/ui-badge.component.ts:72-91`
**Spec violado**: `specs/design-system/spec.md` → *"ese color DEBE ser el único origen de
verdad para badges, tarjetas KPI y marcadores"*

### El defecto

El `switch` de `style()` devuelve clases stock de Tailwind sin relación con los tokens:

```ts
case 'pendiente':  return { classes: 'bg-slate-100 text-slate-700', ... };
case 'resuelto':   return { classes: 'bg-emerald-50 text-emerald-700', ... };
case 'medium':     return { classes: 'bg-amber-200 text-slate-900', ... };
case 'high':       return { classes: 'bg-red-50 text-red-600', ... };
case 'critical':   return { classes: 'bg-red-100 text-red-800', ... };
```

Mientras `_variables.css:37-46` define los tokens que deberían mandar:

```css
--color-status-pendiente: #94A3B8;  --color-status-proceso:  #7C3AED;
--color-status-resuelto:  #10B981;  --color-status-cerrada:  #1F2937;
--color-prio-low: #10B981;  --color-prio-medium: #FCD34D;
--color-prio-high: #EF4444; --color-prio-critical: #B91C1C;
```

Sólo `en_proceso` está bien (`bg-brand-primary-soft text-brand-primary`).

**Por qué importa**: `ui-kpi-card` **sí** usa los tokens (`bg-brand-primary`,
`bg-prio-high`, `bg-accent-cyan`). Dos primitivos que deben compartir la misma paleta
usan dos sistemas desacoplados. Si mañana se ajusta `--color-prio-critical` por
accesibilidad, `ui-badge` sigue mostrando `bg-red-100` sin enterarse.

Tailwind v4 genera las utilidades desde `@theme` automáticamente: `--color-prio-high`
→ `bg-prio-high`, `text-prio-high`, `border-prio-high`. No hay que configurar nada.

### Antes de corregir: hay una decisión de diseño que NO es tuya

El spec pide dos cosas que, con estos hex exactos, **no se cumplen a la vez**:

- Escenario de mapeo: fondos sólidos `#94A3B8 / #7C3AED / #10B981 / #1F2937` y
  `#10B981 / #FCD34D / #EF4444 / #B91C1C`
- Requisito de contraste: **≥ 4.5:1**

Medí el contraste de cada token como fondo sólido (WCAG 2.1, texto normal — el badge
usa `text-xs` = 12px, así que aplica el umbral de 4.5, no el de texto grande):

| Variante | Token | Fondo sólido + texto blanco | Fondo sólido + texto casi negro |
|---|---|---|---|
| `pendiente` | `#94A3B8` | **2.56 ✗** | 8.19 ✓ |
| `en_proceso` | `#7C3AED` | 5.70 ✓ | 3.7 ✗ |
| `resuelto` | `#10B981` | **2.56 ✗** | 8.19 ✓ |
| `cerrada` | `#1F2937` | 13.5 ✓ | ✗ |
| `low` | `#10B981` | **2.56 ✗** | 8.19 ✓ |
| `medium` | `#FCD34D` | **1.7 ✗** | 12.1 ✓ |
| `high` | `#EF4444` | **3.76 ✗** | 4.34 **✗** |
| `critical` | `#B91C1C` | 6.54 ✓ | ✗ |

Dos conclusiones:

1. «Sólido con texto blanco» uniforme (lo que dibuja el mock `02-01`) **falla AA en 5 de
   8 variantes**. El mock no es implementable tal cual.
2. **`high` (`#EF4444`) no llega a 4.5:1 con NINGÚN color de texto** — ni blanco (3.76)
   ni casi negro (4.34). Como fondo sólido es inviable, punto.

Esto significa que tu elección original del patrón «soft» **tenía fundamento**. El
defecto no es el patrón — es que las clases no salen de los tokens.

### ✅ DESBLOQUEADO 2026-09-01 — la decisión ya está tomada

El patrón definitivo es **D10** en `design.md`, y `spec.md` ya está actualizado. **No
queda nada esperando a arquitectura en este hallazgo.**

Resumen: **tintado para todas las variantes, `critical` sólido como única excepción.**
El sólido se reserva para `ui-kpi-card`. Tu elección original del patrón soft tenía
fundamento y se absorbió en el contrato en vez de revertirse.

**Primero: seis tokens nuevos en `_variables.css`**, dentro del bloque `@theme`. La
paleta define rellenos pero no tonos de texto — ésa es la causa de fondo por la que
tuviste que improvisar `text-emerald-700`:

```css
--color-on-tint-slate:    #334155;
--color-on-tint-violet:   #6D28D9;
--color-on-tint-green:    #065F46;
--color-on-tint-amber:    #78350F;
--color-on-tint-red:      #991B1B;
--color-on-tint-graphite: #1F2937;
```

Dos duplican un valor que ya existe (`violet` = `brand-primary-hover`, `graphite` =
`status-cerrada`). Se declaran igual con nombre propio: relleno y texto tienen ciclos de
vida distintos y aliasarlos ata dos decisiones que deben poder moverse por separado.

**Después: el mapa del `switch`.** Esto es el contrato, implementalo tal cual:

| Variante | Fondo | Texto | Contraste |
|---|---|---|---|
| `pendiente` | `bg-status-pendiente/20` | `text-on-tint-slate` | 9.5 ✓ |
| `en_proceso` | `bg-brand-primary-soft` | `text-on-tint-violet` | 6.5 ✓ |
| `resuelto` | `bg-status-resuelto/15` | `text-on-tint-green` | 7.1 ✓ |
| `cerrada` | `bg-status-cerrada/12` | `text-on-tint-graphite` | 9.9 ✓ |
| `low` | `bg-prio-low/15` | `text-on-tint-green` | 7.1 ✓ |
| `medium` | `bg-prio-medium/40` | `text-on-tint-amber` | 8.1 ✓ |
| `high` | `bg-prio-high/15` | `text-on-tint-red` | 7.5 ✓ |
| `critical` | `bg-prio-critical` **sólido** | `text-white` + icono `alert-octagon` | 6.5 ✓ |

Los alfas son el punto de partida verificado. Moverlos ±5 no rompe el contraste;
**cambiar el token de texto sí** — si necesitás tocar uno, avisá en vez de sustituirlo.

Ninguna clase de escala stock puede sobrevivir en el componente.

### El test hay que reescribirlo

`ui-badge.component.spec.ts:22,23,33,34,46` afirma sobre los literales equivocados:

```ts
expect(wrapper?.className).toContain('bg-amber-200');
expect(wrapper?.className).toContain('bg-red-100');
expect(wrapper?.className).toContain('bg-emerald-50');
```

Este test **blinda el defecto**: se escribió para pasar con la implementación, no para
verificar el contrato. Es el caso de libro de «test que valida lo que hay en vez de lo
que se pidió».

Reescribilo para afirmar sobre **la clase de token resuelta** (`bg-status-pendiente`,
`bg-prio-critical`, …), no sobre el hex ni sobre la escala stock. Agregá un test que
falle si aparece cualquier clase de escala stock en el `switch` — es la red que impide
la reincidencia.

---

## CRITICAL-2 — `brand-hivis` sigue vivo · **la mayor parte NO es tuya**

**Archivo**: `frontend/src/styles/_variables.css:27-29`

Tu justificación **se sostiene, y se comprobó empíricamente**: el auditor quitó el
bloque de alias, corrió `pnpm build`, y rompe de verdad con
`Cannot apply unknown utility class 'bg-brand-navy/60'` en `role-editor.component.css`,
`system-config.component.css`, `user-form.component.css`, `profile.component.css`,
`clients-list.css` y `styles.css`. Tailwind v4 falla duro en `@apply` sobre utilidades
desconocidas. Después revirtió y confirmó build verde y archivo byte-idéntico.

**No quites los alias.** Romperías el build.

Lo que falta es de declaración, y se reparte así:

### Tuyo (dos cosas chicas)

1. **Declarar `_modals.css` en `apply-progress.md`.** Tu sección §Desviaciones lista
   como consumidores del alias sólo `features/admin`, `auth`, `profile`, `reports`.
   Falta `frontend/src/styles/_modals.css`, que usa `@apply bg-brand-navy/60`,
   `text-brand-navy`, `border-brand-navy` en reglas reales.

   Importa porque `_modals.css` **es design system**, no una pantalla de feature: se
   importa globalmente desde `styles.css:12`. Tu afirmación «los archivos del design
   system ya están migrados» es cierta para los seis que nombrás, pero omite el séptimo.
   Corregí la frase para que diga 6 de 7 y nombre el que falta.

2. **Los alias `--color-status-*` de `_variables.css:55-58` también van declarados.**
   Este no salió en la auditoría, lo encontré revisando el archivo. Mirá:

   ```css
   --color-status-pendiente: #94A3B8;   /* canónico, línea 37 */
   --color-status-pending:   #FFC600;   /* bridge,   línea 56 */
   ```

   **Dos tokens con nombres a un carácter de distancia y colores distintos** — gris
   pizarra vs ámbar. Un dev de F1-F6 escribe `bg-status-pending` creyendo que es el
   estado «pendiente» y obtiene ámbar. Sin error de compilación, sin test que lo agarre.

   No los borres — `_badges.css` los consume. Pero agregá un comentario en el bloque
   que diga explícitamente que `pending ≠ pendiente` y que el canónico es el segundo.
   La retirada de ambos bloques de puente está ticketeada en
   [sc-323](https://app.shortcut.com/upse/story/323), asignada a F6; referencialo en el
   comentario para que quien lo lea sepa que tiene fecha.

### ✅ Resuelto 2026-09-01 — la parte de arquitectura ya está hecha

- El escenario «Hi-vis retirado» quedó **acotado a `layout/` + `styles/`** en
  `spec.md`, con un escenario nuevo que exige que el alias esté declarado y ticketeado
  (D11 en `design.md`).
- Se corrigió de paso la afirmación de D1 («se elimina, no se deja huérfano»): sigue
  siendo el destino, pero no en F0. Un alias con dueño y fase no es un token muerto.

Te quedan las dos tareas de declaración de arriba. Nada más.

---

## CRITICAL-3 — `ui-kpi-card` empareja `text-white` con tres tonos ilegibles

> **Añadido 2026-09-01.** No salió en la auditoría: revisando la paleta para decidir
> D10 apareció que el componente de al lado tiene el mismo defecto de raíz.

**Archivo**: `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts:82-107`

La auditoría dio `ui-kpi-card` por bueno **porque usa los tokens correctamente** — y es
cierto. Pero usarlos bien y emparejarlos bien son cosas distintas:

| Tono | Fondo | Texto | Contraste |
|---|---|---|---|
| `cyan` | `bg-accent-cyan` `#06B6D4` | `text-white` | **2.44 ✗** |
| `green` | `bg-accent-green` `#22C55E` | `text-white` | **2.28 ✗** |
| `red` | `bg-prio-high` `#EF4444` | `text-white` | **3.76 ✗** |
| `brand` | `#7C3AED` | `text-white` | 5.70 ✓ |
| `violet` | `#6D28D9` | `text-white` | 7.10 ✓ |
| `slate` | `#334155` | `text-white` | 10.4 ✓ |

La etiqueta y el pie de tendencia van en versalitas pequeñas → umbral 4.5. `cyan` y
`green` no alcanzan **ni el 3:1** de texto grande, así que el valor grande tampoco se
salva. Son los KPI de «En proceso» y «Resueltas» del mock 01-01: dos de los cuatro
bloques de la pantalla principal.

### La corrección (D12, ya en `spec.md`)

| Tono | Cambio | Contraste |
|---|---|---|
| `cyan` | `text-white` → `text-on-tint-graphite` | 6.4 ✓ |
| `green` | `text-white` → `text-on-tint-graphite` | 6.9 ✓ |
| `red` | **fondo** `bg-prio-high` → `bg-prio-critical`, texto sigue blanco | 6.5 ✓ |

En `red` se cambia el fondo y no el texto: `#EF4444` con grafito da 4.34, sigue por
debajo. `#B91C1C` con blanco da 6.54 y de paso alinea el KPI de críticas con el badge
`critical`, que por D10 es sólido en ese mismo rojo.

Acordate del `iconBox` translúcido: si el texto pasa a grafito, el icono también.

### Por qué entra en F0 y no en un change aparte

Es el mismo defecto de raíz que CRITICAL-1 —paleta de rellenos emparejada con blanco por
defecto— en el componente de al lado. Arreglar `ui-badge` y dejar `ui-kpi-card` roto
reproduce el patrón **«regla implementada a medias»** que `openspec/ROADMAP.md` fija
como trampa conocida: aplicada donde entró la funcionalidad, ausente en el vecino.

Actualizá también `ui-kpi-card.component.spec.ts` para que afirme sobre el par
fondo/texto resuelto, no sólo sobre el fondo.

---

## WARNING-3 — 17 archivos fuera de `layout/` sin iconos

Como F0.2.5 sacó Material Symbols y Bootstrap Icons del `index.html`, estos archivos
hoy renderizan **tofu / hueco**, no «paleta vieja»:

```
shared/components/breadcrumb/breadcrumb.component.html
shared/components/date-picker/date-picker.component.html
shared/components/toast/toast.component.html
shared/components/pagination/pagination.component.html
shared/components/confirm-dialog/confirm-dialog.component.html
shared/components/empty-state/empty-state.component.ts
features/auth/{forgot-password,verify-email,reset-password}/…
features/admin/{users/user-form,system-config,roles,roles/role-editor,users/user-management}/…
features/profile/profile.component.html
features/dashboard/dashboard.component.html
features/reports/clients-list/clients-list.html
```

**Seis de esos son `shared/components/`.** Ese es el punto: no es una regresión acotada
a admin/auth/profile/reports, se propaga a **cualquier pantalla** que use un breadcrumb,
un toast, una paginación o un diálogo de confirmación. F1 los va a consumir apenas
arranque.

### Qué hacés

1. **Corregí el número en `apply-progress.md`**: 17 archivos, 6 de ellos compartidos, y
   que el efecto es icono ausente, no icono con estilo viejo.
2. **Migrá los 6 de `shared/components/` a `<ui-icon>` dentro de F0.** Sí, amplía el
   alcance — pero son primitivos compartidos, que es exactamente lo que F0 entrega, y
   dejarlos rotos le traslada el problema a F1. Los 11 de `features/` sí quedan para
   F1-F6: son pantallas que esas fases rediseñan igual.

Si al migrarlos aparece algún icono de Bootstrap sin equivalente claro en Lucide,
anotalo en `apply-progress.md` con el nombre que elegiste. No inventes en silencio.

---

## WARNING-5 — Falta `Barlow` en el test de regresión

**Archivo**: `frontend/src/app/layout/layout-tokens.regression.spec.ts:17`

```js
const BANNED = ['#CCFF00', 'brand-hivis', 'material-symbols-outlined', 'bi bi-'];
```

El DoD de `tasks.md` promete **cinco** patrones; el test cubre cuatro. Hoy no hay
ninguna coincidencia de `Barlow` bajo `layout/`, así que no hay falla activa — pero la
red de seguridad que el DoD promete no existe para ese patrón.

Agregá `'Barlow'` al array. Una línea.

---

## WARNING-6 — `status-badge` sin ningún test

**Archivo**: `frontend/src/app/shared/components/status-badge/status-badge.component.ts`

Lo refactorizaste para envolver `ui-badge` (F0.4.7) con una tabla `TONE_TO_VARIANT` y
matching de 20+ strings de estado. **No existe `status-badge.component.spec.ts`** — y se
confirmó que nunca existió en el historial de git.

Bajo Strict TDD, lógica de traducción no trivial sin ningún test es un vacío real.
Escribí el spec: API pública preservada (`status`, `customLabel`, `customTone`, `dot`),
más el mapeo de estados a variantes.

**Y revisá esto al escribirlo**: `TONE_TO_VARIANT['danger'] = 'cerrada'`. El tono legacy
`danger` — semánticamente rojo/error — resuelve hoy a la variante `cerrada`, que es
gris oscuro (`bg-slate-800`). Sin relación con rojo.

No hay consumidores activos de `customTone` (`grep -rn customTone src/app` sólo
encuentra el propio componente), así que no es una regresión visible. Pero es una trampa
para el primer consumidor de F1-F6 que pase `customTone="danger"` esperando rojo.
`critical` o `high` parecen el destino correcto — **preguntá antes de cambiarlo**, es
semántica de dominio, no refactor.

---

## WARNING-4 — El test del sidebar no verifica la clase resuelta

**Archivo**: `frontend/src/app/layout/sidebar/sidebar.spec.ts`, tercer `it`

Hoy verifica (1) que el link tiene el atributo `routerLinkActive`, y (2) por separado,
que `_layout.css` **como texto** contiene la regla `.nav-link-custom.active`.

Ninguna de las dos navega. Un typo (`routerLinkActive="actve"`) o una divergencia entre
la clase que Angular aplica y la que el CSS selecciona **pasa este test**.

Agregá un test que navegue de verdad — `RouterTestingHarness` o
`Router.navigateByUrl('/app/users')` — y después afirme
`link.classList.contains('active')` sobre el DOM.

Dejá el match del CSS: jsdom no carga Tailwind y esa parte sigue siendo la única forma
de verificar el color. Lo que falta es la mitad del DOM, no reemplazar lo que hay.

---

## SUGGESTION — opcionales, decidí vos

- **`ui-table` no encapsula** (`ui-table.component.ts:57-117`). Los estilos de
  `.ui-table th/td` no alcanzan el contenido proyectado por `<ng-content>` — es
  comportamiento estándar de Angular con encapsulación Emulated, y tu JSDoc lo documenta
  honestamente. Pero F1-F6 deben memorizar las helper classes en cada tabla o perder el
  look **en silencio**, sin error de compilación. Alternativa: mover esas reglas a
  `_tables.css` (que ya existe y ya está migrado a tokens canónicos). Tu llamada.
- **Contraste sin test automatizado.** Si arreglás CRITICAL-1, aprovechá y agregá un
  test de contraste sobre los pares finales. La tabla de arriba te da los números
  medidos; el cálculo WCAG son ~15 líneas.

---

## No toques (fuera del alcance de F0)

| Qué | Por qué |
|---|---|
| `auth.interceptor.spec.ts` (2 fallas) | Defecto de contrato de backend, ticket aparte |
| `eslint.config.*` / script `lint` | El CI lo saltea a propósito; es un change aparte |
| `app.routes.ts` y `menu-map.ts` | Es F1 |
| Los 11 archivos de `features/` con `bi bi-` | F1-F6 los rediseñan |
| Cualquier cosa bajo `backend/` | El DoD lo prohíbe explícitamente |
| `specs/design-system/spec.md` | Contrato de Gemini |

---

## Orden sugerido

> Actualizado 2026-09-01. **Ya no hay nada bloqueado**: las decisiones de arquitectura
> (D10, D11, D12) están tomadas y el `spec.md` refleja el contrato definitivo.

1. WARNING-5 — una línea, cero riesgo
2. **Los seis tokens `--color-on-tint-*`** en `_variables.css` — habilitan 3 y 4
3. CRITICAL-1 — mapa de `ui-badge` según la tabla de D10 + reescribir su spec
4. CRITICAL-3 — pares de `ui-kpi-card` + su spec
5. WARNING-6 — spec de `status-badge` (+ consultar lo de `danger`)
6. WARNING-4 — test de navegación del sidebar
7. WARNING-3 — migrar los 6 primitivos compartidos a `<ui-icon>`
8. CRITICAL-2 parte tuya — declarar `_modals.css` y comentar `pending` vs `pendiente`
9. Actualizar `apply-progress.md` con todo lo anterior
10. Correr `pnpm test && pnpm build` desde `frontend/`

El paso 2 va antes que 3 y 4 a propósito: sin los tokens de texto, ambos hallazgos se
corrigen improvisando colores y volvemos al punto de partida.

Para el subset de F0 usá **`npx jest --testPathPatterns='...'` directo**, no
`rtk pnpm test --`: el wrapper trunca mal el passthrough de flags de Jest y reportó
8/29 donde había 9/33 (WARNING-7 — defecto de tooling, no de F0).

Cuando termines, avisá para re-verificar. **Nada queda bloqueado**: D10, D11 y D12 están
resueltas en `design.md` y el `spec.md` ya refleja el contrato definitivo. Si algo del
contrato te parece equivocado, escribí la objeción en `apply-progress.md` con el
fundamento técnico — no la absorbas en silencio.
