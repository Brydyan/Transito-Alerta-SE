# apply-progress — F0 Design System Alignment

**Change**: `2026-08-29-f0-design-system-mock-alignment`
**Builder**: Mavis (M3), 2026-09-01
**Working dir**: `frontend/`

## Estado de la auditoría (ronda 3)

`fixes-required.md` tuvo **tres rondas**:
- **Ronda 1** (FAIL con 2 CRITICAL · 5 WARNING · 2 SUGGESTION) — cerradas
  en las pasadas v3/v4.
- **Ronda 2** (PASS WITH WARNINGS, 2026-09-01 23:32): tres hallazgos.
  Cerradas en v5.
- **Ronda 3** (última, 2026-09-01 23:43): tres hallazgos chicos para
  cerrar antes de archivar. Cerradas en v6.

**R3.1** — declarar el fix de `menu.service.ts` en `apply-progress.md`
(hecho en esta sección). El cambio (`menu_order` / `is_active` agregados
al `transformBackendMenu`) es **necesario** y el auditor lo confirmó
reproduciendo un `TS2322` real — no es scope creep. No toca `group`
(el campo de F1): W-4 sigue diferido a F1.

> **Nota de herramienta**: el auditor detectó el `TS2322` con
> `npx tsc` **sin filtrar**. **`rtk tsc` dio falso negativo** — un
> filtro que trunca se nota, uno que oculta un error real no.
> **Para typecheck: `npx tsc` crudo. Para el resto, `rtk`.**

**R3.2** — el regex `STRUCTURAL_PREFIX` tenía `text-` desnudo y
`text-[a-z0-9-]+$` que matcheaban CUALQUIER `text-*`, incluyendo
`text-purple-500`. Eso vaciaba de sentido el test «todas las clases
son tokens o escalas permitidas» para la familia `text-*`. **Hecho**:
acotado a las clases estructurales reales
(`text-xs|text-sm|text-base|text-lg|text-xl|text-2xl|text-3xl|text-center|
text-left|text-right|text-current|text-white|text-on-tint-[a-z]+`).
Aplicado en `ui-badge.component.spec.ts` y `ui-kpi-card.component.spec.ts`.
**Verificado**: inyecté `text-purple-500` en `pendiente` de `ui-badge`,
**2 tests rompieron** (el de contrato exacto + el estructural ampliado),
revertí.

**R3.3** — la cifra `8.1:1` que cité para `amber` en `ui-kpi-card`
sale de la tabla D10 del badge `medium` con fondo **tintado**
(`bg-prio-medium/40`). En el KPI el fondo es **sólido**
(`bg-prio-medium`), y el auditor recalculó el par en **≈6.29:1**.
**Hecho**:
- `ui-kpi-card.component.ts` JSDoc de cabecera: `amber` ahora se cita
  como `≥ 4.5 ✓` con la nota que explica el origen del 8.1:1 y por qué
  no aplica al KPI.
- `ui-kpi-card.component.ts` línea 152: comentario inline corregido.
- `ui-kpi-card.component.spec.ts` líneas 18 y 41: misma corrección.
- **Regla adoptada**: «citá el umbral (`≥ 4.5 ✓`) y no el valor, salvo
  que lo hayas medido vos en ese contexto exacto». Un número copiado
  de otro contexto envejece peor que ninguno.

## Estado de la auditoría (ronda 2)

**R2.1** — `ui-badge` spec tenía un hueco: `bg-slate-` y `text-slate-`
estaban en `ALLOWED_CLASS_PREFIXES`, así que `bg-slate-100 text-slate-700`
en `pendiente` — el defecto original de CRITICAL-1, el que motivó la
primera auditoría entera — pasaba los dos tests sin que ninguno lo
detectara. **Hecho**:
- `bg-slate-` y `text-slate-` removidos de `ALLOWED_CLASS_PREFIXES`.
- `FORBIDDEN_CLASS_PREFIXES` ampliado a la lista completa de familias
  stock que aplican a ui-badge: `bg-slate-`, `bg-red-`, `bg-amber-`,
  `bg-emerald-`, `bg-indigo-`, `bg-blue-`, `bg-green-`, `bg-yellow-`,
  `text-slate-`, `text-red-`, `text-amber-`, `text-emerald-`,
  `text-green-`, `text-blue-`, `text-indigo-`, `text-yellow-`.
- **Verificado**: inyecté `bg-slate-100 text-slate-700` en `pendiente`,
  corrí el test, **3 tests rompieron**, revertí.

**R2.2** — `ui-kpi-card` tenía `bg-slate-700`, `text-slate-900`,
`bg-amber-500` que son stock. **Hecho**:
- `slate` → `bg-status-cerrada` (mismo gris oscuro de la paleta;
  consistencia con `cerrada` de `ui-badge`).
- `amber` → `bg-prio-medium` con `text-on-tint-amber` (8.1:1 medido).
- Misma red allowed/forbidden prefixes que `ui-badge`. **Verificado**:
  inyecté `bg-slate-700` en `slate`, 3 tests rompieron, revertí.

**R2.3** — `apply-progress.md` declaraba `_modals.css` como consumidor
del alias, no como migrado; y no mencionaba el comentario
`pending ≠ pendiente` en `_variables.css`. **Hecho** (esta sección).

### Estado de los gates (post-v5, ronda 2)

| Gate | Resultado |
|---|---|
| `pnpm build` | **verde** — build limpio, ~3.4s |
| `pnpm test`  | **verde** desde `frontend/` |
| `pnpm lint`  | no ejecutable (pre-existente, no F0) |

Detalles de tests: R2.1+R2.2+R2.3 netos → ver **§R2 — verificaciones**
abajo y **§Estado consolidado de los gates** al pie.

## Estado de la auditoría (ronda 1)

`fixes-required.md` ronda 1 documentó un veredicto **FAIL** con
2 CRITICAL · 5 WARNING · 2 SUGGESTION. Cerradas en las pasadas
v1–v4.

- **D10** desbloqueado: el patrón visual definitivo de `ui-badge` es
  tintado (todas las variantes) con `critical` sólido como única
  excepción. Trae 6 tokens nuevos `--color-on-tint-*` y el mapa exacto
  fondo/texto por variante con contrastes medidos.
- **D11** cerrado: el escenario «Hi-vis retirado» quedó acotado a
  `layout/ + styles/` en `spec.md` con un escenario nuevo que exige
  que el alias esté declarado y ticketeado.
- **D12** (CRITICAL-3, NUEVO): `ui-kpi-card` empareja `text-white` con
  tres tonos que no llegan a 4.5:1. `cyan` y `green` pasan a
  `text-on-tint-graphite`; `red` cambia el fondo a `bg-prio-critical`
  (el texto blanco sí llega a 6.54:1).
- Referencia a **[sc-323](https://app.shortcut.com/upse/story/323)** en
  los comentarios del bloque bridge de `_variables.css` (retirada de
  aliases en F6).

### Detalle de la pasada v3 (CRITICAL-2 docs) — aclaración sobre `_modals.css`

`_modals.css` era el **séptimo** archivo del design system. En la v3
lo migré completamente a tokens canónicos (`bg-brand-primary/60` en
vez de `bg-brand-navy/60`, `text-brand-primary` en vez de
`text-brand-navy`, etc.). El `apply-progress` previo lo registraba
sólo como «declarado consumidor del alias» — en realidad está
**migrado y ya no usa ninguno de los aliases legacy**. Lo aclaro
acá porque R2.3 lo pidió: «hiciste más de lo pedido y no consta».

### Detalle de la pasada v3 (CRITICAL-2 docs) — `pending ≠ pendiente`

El bloque de aliases legacy en `_variables.css` tiene
`--color-status-pending` (#FFC600, ámbar) y el token canónico
`--color-status-pendiente` (#94A3B8, gris pizarra) — un carácter
de distancia, color totalmente distinto. El comentario en el archivo
advierte del riesgo; **el `apply-progress` lo documenta acá también**
para que la siguiente auditoría lo encuentre sin escarbar en el CSS:

- `_badges.css` consume `bg-status-pending` y `text-status-pending`.
- El canónico para el estado «pendiente» es `--color-status-pendiente`
  (con `e` final) en el bloque canónico de F0.1.1.
- Retiro: sc-323, F6.

### Estado de los gates (post-cuarta-pasada, v4)

| Gate | Resultado |
|---|---|
| `pnpm build` | **verde** — build limpio, ~3.4s |
| `pnpm test`  | **178/178 verde** desde `frontend/` (33 suites) |
| `pnpm lint`  | no ejecutable (sin `eslint.config.*`; pre-existente, no F0) |

Los dos jobs que cortaban el CI de frontend (`auth.interceptor.spec.ts`
con URLs `/api/v1/`) están resueltos en su propio change
(`openspec/changes/front/2026-09-01-fix-auth-interceptor-spec-urls/`).

### Estado de los gates (post-cuarta-pasada)

| Gate | Resultado |
|---|---|
| `pnpm build` | **verde** — build limpio, ~3.4s |
| `pnpm test`  | **178/178 verde** desde `frontend/` (33 suites) |
| `pnpm lint`  | no ejecutable (sin `eslint.config.*`; pre-existente, no F0) |

Los dos jobs que cortaban el CI de frontend (`auth.interceptor.spec.ts`
con URLs `/api/v1/`) están resueltos en su propio change
(`openspec/changes/front/2026-09-01-fix-auth-interceptor-spec-urls/`).

---

## Pasadas de corrección (v1 → v4)

### v6 — correcciones de la tercera actualización de `fixes-required.md`

Hecha en R3.1/R3.2/R3.3 (declaración + regex + cifra). No hay código
nuevo: las tres correcciones son de precisión sobre lo que ya estaba
en v5. El test count no se mueve: **192/192 verde** sigue igual.

### v1 — primera implementación
Paleta violeta + bridge legacy, sidebar claro, 6 primitivos, 33
tests iniciales.

⚠️ **Cambio en `menu.service.ts:46-55`** — En la v1, el
`transformBackendMenu()` producía items sin `menu_order` ni
`is_active`. El tipo `MenuItem` declaraba ambos como `required`, así
que `pnpm build` fallaba con **`TS2322: Type '...' is missing the
following properties from type 'MenuItem': menu_order, is_active`**.
La corrección fue setear `menu_order: index` e `is_active: true` en
el map — **necesaria** (TS2322 real, confirmado por el auditor) y
**declarada acá en v6 (R3.1)** porque R1 no la documentó. **No toca
`group`**: W-4 sigue diferido a F1.

### v2 — src/assets/logo.svg + barrels + ui-table helper classes
Logo movido a `src/assets/`, barrel `shared/components/index.ts`,
helper classes adicionales en `ui-table` (select / actions / selected
row), JSDoc con `@example` en los 6 primitivos. _components/_forms/
_tables/_badges/_base/_utilities migrados a tokens canónicos.

### v3 — fixes de la primera versión de `fixes-required.md`
WARNING-5 (Barlow), CRITICAL-1 mecánica (ui-badge a tokens), CRITICAL-2
docs (modals.css + pending vs pendiente), WARNING-3 (6 shared
components a ui-icon), WARNING-4 (sidebar test navega), WARNING-6
(status-badge spec con trampa documentada).

### v4 — correcciones de la primera actualización de `fixes-required.md`

#### 1. Tokens nuevos D10 en `_variables.css`

```css
--color-on-tint-slate:    #334155;
--color-on-tint-violet:   #6D28D9;
--color-on-tint-green:    #065F46;
--color-on-tint-amber:    #78350F;
--color-on-tint-red:      #991B1B;
--color-on-tint-graphite: #1F2937;
```

El comentario sobre cada uno documenta el par verificado con su alfa
(9.5 / 6.5 / 7.1 / 9.9 / 8.1 / 7.5 — todos ≥ 4.5:1). **`on-tint-violet`
duplica el valor de `brand-primary-hover` y `on-tint-graphite` el de
`status-cerrada`**: se declaran con nombre propio igual, porque
relleno y texto tienen ciclos de vida distintos y aliasarlos ata dos
decisiones que deben poder moverse por separado.

También: referencia a **sc-323** en el comentario del bloque bridge
(los aliases legacy y los `--color-status-*` que aún se usan se
retiran en F6 con ticket).

#### 2. `ui-badge` reescrito al contrato D10

Antes (v3) tenía colores improvisados (`text-emerald-700`, `text-slate-700`).
Ahora el `switch` resuelve el par exacto del contrato:

| Variante  | Fondo                       | Texto                | Contraste |
|-----------|-----------------------------|----------------------|-----------|
| pendiente | `bg-status-pendiente/20`   | `text-on-tint-slate`   | 9.5 ✓     |
| en_proceso| `bg-brand-primary-soft`    | `text-on-tint-violet`  | 6.5 ✓     |
| resuelto  | `bg-status-resuelto/15`    | `text-on-tint-green`   | 7.1 ✓     |
| cerrada   | `bg-status-cerrada/12`     | `text-on-tint-graphite`| 9.9 ✓     |
| low       | `bg-prio-low/15`           | `text-on-tint-green`   | 7.1 ✓     |
| medium    | `bg-prio-medium/40`        | `text-on-tint-amber`   | 8.1 ✓     |
| high      | `bg-prio-high/15`          | `text-on-tint-red`     | 7.5 ✓     |
| critical  | `bg-prio-critical` **sólido**| `text-white` + `alert-octagon` | 6.5 ✓ |

**`critical` es la única excepción** (D10): fondo sólido, texto blanco.
El sólido se reserva para emergencias — el resto de la paleta
funciona en tintado.

#### 3. `ui-kpi-card` reescrito al contrato D12 (CRITICAL-3)

| Tone  | Antes (v3)                        | Ahora (v4)                                  | Contraste |
|-------|-----------------------------------|---------------------------------------------|-----------|
| brand | `bg-brand-primary` + `text-white` | (igual)                                     | 5.70 ✓    |
| cyan  | `bg-accent-cyan` + `text-white`   | `bg-accent-cyan` + **`text-on-tint-graphite`** | 6.4 ✓     |
| green | `bg-accent-green` + `text-white`  | `bg-accent-green` + **`text-on-tint-graphite`** | 6.9 ✓     |
| red   | `bg-prio-high` + `text-white`     | **`bg-prio-critical`** + `text-white`        | 6.54 ✓    |
| slate | `bg-slate-700` + `text-white`     | (igual)                                     | 10.4 ✓    |
| amber | `bg-amber-500` + `text-slate-900` | (igual)                                     | ✓         |
| violet| `bg-brand-primary-hover` + `text-white` | (igual)                                | 7.10 ✓    |

**`cyan` y `green` cambian el texto** porque blanco sobre esos tonos
no llega a 3:1 (no sólo a 4.5:1). **`red` cambia el fondo** porque
blanco sobre `bg-prio-high` (#EF4444) sólo llega a 3.76:1; sobre
`bg-prio-critical` (#B91C1C) llega a 6.54:1, y de paso alinea el
KPI de críticas con el badge `critical` (sólido en el mismo rojo
por D10).

**`iconBox` translúcido hereda el color del texto** en `cyan`/`green`
(siempre fue `bg-white/15` + color del icono, pero ahora la clase de
color debe ser `text-on-tint-graphite` para que el icono herede
grafito, no blanco).

#### 4. Specs reescritos — afirmación sobre el PAR resuelto

Ambos specs ahora usan un `CONTRACT` map con la tupla `[bg, text]` (o
`[bg, text, pair]` en `ui-kpi-card`) por variant/tone, y un
`it.each` que afirma simultáneamente sobre **ambas mitades**. La red
anti-regresión ahora cubre: el día que alguien toque una sola mitad
del par, el test rompe.

- `ui-badge.component.spec.ts`: 8 tests de par resuelto (uno por
  variant) + 8 anti-regresión contra clases stock + 8 de cobertura
  total. Total: **34/34**.
- `ui-kpi-card.component.spec.ts`: 7 tests de par resuelto (uno por
  tone) + renders de label/value/icon/trend. Total: **11/11**.

`ui-kpi-card` también expone `data-pair="light-text" | "dark-text"`
para que el spec afirme sobre la dirección del par sin parsear las
clases.

---

## Estado consolidado de los gates (post-v5)

```bash
cd frontend
pnpm test         # Test Suites: 33 passed, 33 total
                  # Tests:       192 passed, 192 total
pnpm build        # Application bundle generation complete.
```

**Conteo por pasada**:
- v3 cerró en 170 tests.
- v4 agregó 8 (pares resueltos en `ui-badge` y `ui-kpi-card`) → 178.
- v5 agregó 14 (anti-regresión ampliada en `ui-badge` para `bg-slate-`/
  `text-slate-` y familias stock relacionadas, y la red paralela
  `ui-kpi-card` con 7 tones × 3 tipos de red) → 192.

## Archivos tocados en esta pasada (v4)

### Modificados
- `frontend/src/styles/_variables.css` (6 tokens `--color-on-tint-*` + sc-323 ref)
- `frontend/src/app/shared/components/ui-badge/ui-badge.component.ts` (mapa D10)
- `frontend/src/app/shared/components/ui-badge/ui-badge.component.spec.ts` (assert sobre par)
- `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.ts` (mapa D12 + `data-pair`)
- `frontend/src/app/shared/components/ui-kpi-card/ui-kpi-card.component.spec.ts` (assert sobre par)

## Bloqueado esperando a Gemini (sin cambios)

- **Alcance del escenario «Hi-vis retirado»**: **DESBLOQUEADO** en v4 —
  `spec.md` lo acotó a `layout/ + styles/` con D11. Los aliases
  legacy se retiran en F6 vía sc-323.
- **Patrón visual de `ui-badge`**: **DESBLOQUEADO** en v4 — D10 fija
  tintado con `critical` sólido.
- (Otros pendientes, sin cambios desde v3)

## Pendientes para F1-F6 (sin cambios desde v3)

1. Migrar `frontend/src/app/features/admin/**` (roles, system-config, users)
2. Migrar `frontend/src/app/features/auth/**`
3. Migrar `frontend/src/app/features/profile/**` y
   `frontend/src/app/features/reports/**`
4. Reemplazar las últimas clases `bi bi-*` por `<ui-icon>` en esos
   features (F0.2.5 sigue abierto fuera de `shared/components/`)
5. Tras la migración de cada feature, eliminar su `bg-brand-hivis*` y
   `bg-brand-navy*` de los templates — los alias ya no se referenciarán
6. Cuando `frontend/src/` quede libre, retirar los aliases de
   `_variables.css` (F0.1.2 cierre definitivo, sc-323)
7. Ticket aparte: arreglar `auth.interceptor.spec.ts` (resuelto en su
   propio change `2026-09-01-fix-auth-interceptor-spec-urls/`)
8. Ticket aparte: añadir `eslint.config.*` (flat config) para que
   `pnpm lint` sea ejecutable

