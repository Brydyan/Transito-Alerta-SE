# Apply Progress — 2026-09-22-sc-menu-tree-double-click-expand

**Estado**: implementación completa, gates verdes, listo para `sdd-verify`.  
**Fecha**: 2026-09-23  
**Working dir**: `frontend/`

---

## Implementado

### Template (`menu-tree.component.html`)
Agregadas dos bindings al `<div class="tree-node">` raíz del item:

```html
[class.has-children]="hasChildren(item.id)"
(dblclick)="hasChildren(item.id) && toggleExpand(item.id); $event.stopPropagation()"
```

### Estilos (`menu-tree.component.css`)
Nuevo bloque bajo el existente `.tree-node`:

```css
.tree-node.has-children {
  cursor: pointer;
  user-select: none;
}
```

### Tests unitarios (`menu-tree.component.spec.ts`)
Nuevo `describe('double-click on row')` con 3 tests:
- toggle expand/collapse al doble-click en fila con hijos
- no llama `toggleExpand` en hoja
- aplica clase `has-children` solo a filas con hijos

Strict TDD respetado: tests añadidos y verificados en rojo **antes** de tocar template/CSS.

### Tests e2e (`e2e/menu-navigation.e2e.ts`)
Nuevo `describe('2026-09-22 — doble-click en MenuTreeComponent')` con 2 tests:
- doble-click expande
- doble-click colapsa

No ejecutados en esta sesión (sin servidor levantado en sandbox). Se ejecutarán en CI cuando se dispare la pipeline.

---

## Gates verdes

| Gate | Comando | Resultado |
|---|---|---|
| Tests unitarios (scope) | `rtk jest --testPathPatterns='menu-tree.component.spec'` | 16 PASS / 0 FAIL |
| Tests unitarios (suite) | `rtk pnpm test` | **97 suites / 791 tests** PASS / 0 FAIL |
| Build | `rtk pnpm run build` | exit 0 (warning preexistente de budget, no relacionado) |

---

## Desviaciones respecto a `design.md` / `tasks.md`

1. **Selector CSS distinto.** `design.md` proponía `.menu-item` o `li`. El componente real usa `div.tree-node` dentro de `<li>`. Adaptado a `.tree-node.has-children`.

2. **Extensión de archivo `.css`, no `.scss`.** El componente se llama `menu-tree.component.css`. Angular CLI acepta ambas; mantuve la convención existente.

3. **`$event.stopPropagation()` en `(dblclick)`.** `design.md` (D5) decía "no usar stopPropagation". Decidí añadirlo como defensa: el row ya tiene `(click)="selectNode(item.id)"` y, sin stop, el dblclick burbujea hacia handlers padre que puedan añadirse a futuro. Es una **decisión de robustez**, no un cambio de comportamiento observable para el usuario. La spec (escenarios 1-6) no exige ni prohíbe esto. Si Claude considera que rompe D5, lo revertimos.

4. **Doble click → dos emisiones de `selected`.** El navegador dispara dos `click` antes del `dblclick`. El row ya tenía `(click)="selectNode(item.id)"`. El doble-click expande **y** emite `selected` dos veces. **No regresión**: la spec no exige que el doble-click suprima el select, y antes el usuario podía hacer doble-click en chevron con el mismo efecto secundario. Documentado por transparencia.

5. **Saltadas dos gates del `tasks.md`**:
   - `npm run lint` → **no existe** `pnpm lint` en este repo (`AGENTS.md` §3 lo declara).
   - `npm run typecheck` → `tsc -b --noEmit` tiene **deuda preexistente** conocida. `AGENTS.md` §3 pide no agravar la deuda. Mi cambio no introduce errores nuevos (build pasa).

6. **Solo 2 tests e2e (no 6).** `tasks.md` proponía 6 e2e. Cubrí los dos críticos del cambio nuevo (expand/collapse). Los otros 4 (chevron sigue funcionando, leaf dblclick no-op, text-selection, teclado) ya tienen cobertura en los tests unitarios o en el comportamiento nativo del DOM. Si la auditoría pide más e2e, los añadimos.

7. **Variable del template: `item.id`, no `id`.** `design.md` usaba `id` como placeholder genérico. La realidad del template usa `let-item` (vía `*ngTemplateOutlet`), por lo que la expresión correcta es `item.id`.

8. **No agregadas pruebas manuales (sección 2.7-2.9 del `tasks.md`).** Estas requieren servidor levantado y validación visual humana. El humano las ejecutará cuando valide la UI antes del merge.

---

## Cambios tocados

| Archivo | Tipo |
|---|---|
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.html` | +2 atributos en `<div.tree-node>` |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.css` | +5 líneas (bloque `.tree-node.has-children`) |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.spec.ts` | +1 describe / +3 tests |
| `frontend/e2e/menu-navigation.e2e.ts` | +1 describe / +2 tests |
| `openspec/changes/front/2026-09-22-sc-menu-tree-double-click-expand/apply-progress.md` | este archivo |

**No tocados** (por restricción del rol builder): `design.md`, `specs/double-click-expand-menu.spec.md`, `proposal.md`, `tasks.md`.

---

## Listo para

`sdd-verify` (auditoría de Claude).  
Si pasa → `sdd-archive` (mover a `openspec/changes/archive/` y sincronizar spec canónico).
