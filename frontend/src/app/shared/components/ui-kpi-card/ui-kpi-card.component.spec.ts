import { render, screen } from '@testing-library/angular';
import { UiKpiCardComponent } from './ui-kpi-card.component';

/**
 * CRITICAL-3 (D12): `ui-kpi-card` tiene el mismo defecto de raíz que
 * `ui-badge` antes del fix — emparejar `text-white` con tonos que no
 * llegan al 4.5:1. La auditoría midió los contrastes y los corrigió
 * así:
 *   - `cyan` y `green` pasan a `text-on-tint-graphite` (#1F2937).
 *   - `red` cambia el FONDO a `bg-prio-critical` (#B91C1C, 6.54:1 con
 *     blanco) porque el texto blanco sobre `bg-prio-high` (#EF4444) sólo
 *     llega a 3.76:1.
 *
 * R2.2 de `fixes-required.md`: `slate` y `amber` también usaban clases
 * stock de Tailwind (`bg-slate-700`, `bg-amber-500`, `text-slate-900`).
 * Migrados a tokens: `slate` → `bg-status-cerrada` (mismo gris oscuro
 * que usa el badge `cerrada` en `ui-badge`); `amber` → `bg-prio-medium`
 * con `text-on-tint-amber` (umbral `≥ 4.5 ✓` — ver R3.3 abajo).
 *
 * El spec afirma sobre el PAR resuelto (no sólo el fondo) y mantiene la
 * misma red allowed/forbidden que `ui-badge` para que un atajo a
 * cualquier clase de la paleta stock de Tailwind rompa el test.
 */

const ALL_TONES = ['brand', 'cyan', 'green', 'red', 'slate', 'amber', 'violet'] as const;

type Pair = readonly [bg: string, text: string, pair: 'light-text' | 'dark-text'];

/** Contrato D12 + R2.2 — el par fondo/texto exacto por tone. */
const CONTRACT: Record<(typeof ALL_TONES)[number], Pair> = {
  brand: ['bg-brand-primary', 'text-white', 'light-text'],
  cyan: ['bg-accent-cyan', 'text-on-tint-graphite', 'dark-text'],
  green: ['bg-accent-green', 'text-on-tint-graphite', 'dark-text'],
  // D12: `red` cambia el FONDO, no el texto.
  red: ['bg-prio-critical', 'text-white', 'light-text'],
  // R2.2: `slate` migra de `bg-slate-700` (stock) a `bg-status-cerrada`
  // (token con el mismo gris oscuro de la paleta).
  slate: ['bg-status-cerrada', 'text-white', 'light-text'],
  // R2.2: `amber` migra de `bg-amber-500 text-slate-900` (ambos stock)
  // a `bg-prio-medium text-on-tint-amber` (tokens de la paleta de
  // prioridad; umbral `≥ 4.5 ✓` — ver R3.3).
  amber: ['bg-prio-medium', 'text-on-tint-amber', 'dark-text'],
  violet: ['bg-brand-primary-hover', 'text-white', 'light-text'],
};

// Familias de clase autorizadas. Cualquier otra es regresión. Mismo
// criterio que en `ui-badge.component.spec.ts` — ver R2.1.
//
// ⚠️ R2.2: `slate` y `amber` ya no pueden aparecer — los tokens
// canónicos los reemplazan. `text-slate-` tampoco (lo hacía el antiguo
// `amber` tone).
const ALLOWED_CLASS_PREFIXES = [
  'bg-brand-',
  'bg-status-',
  'bg-prio-',
  'bg-accent-',
  'text-on-tint-',
  'text-white',
  'ui-', // host class de la Angular component (`ui-kpi-card`, `ui-button`, …)
];

// Tokens estructurales que el template o el host binding añaden y que
// no son clases de color. Si aparece algo que no matchea ni ALLOWED ni
// STRUCTURAL, es regresión.
//
// ⚠️ R3.2 de `fixes-required.md`: la versión anterior tenía `text-` como
// alternativa desnuda y `text-[a-z0-9-]+$` que matcheaban CUALQUIER
// `text-*`, incluyendo `text-purple-500`. Acotamos a las clases
// estructurales concretas que el template emite.
// El grupo `text-(...)` va anclado con `$`: son nombres de clase completos,
// no prefijos, y sin el ancla `text-xs-purple` pasaría. Los demás son
// prefijos a propósito (`rounded` cubre `rounded-full`, `items-` cubre
// `items-center`), así que el ancla va DENTRO del grupo de text-, no al
// final del regex.
const STRUCTURAL_PREFIX =
  /^(rounded|inline-flex|flex|items-|justify-|whitespace-|tracking-|font-|gap-|px-|py-|p-|m-|shadow-|w-|h-|min-w-|border-|text-(xs|sm|base|lg|xl|2xl|3xl|center|left|right|current|white|on-tint-[a-z]+)$)/;

// Familias explícitamente prohibidas. Si aparece una, ui-kpi-card está
// usando escalas stock de Tailwind en lugar de los tokens.
const FORBIDDEN_CLASS_PREFIXES = [
  'bg-slate-',
  'bg-red-',
  'bg-amber-',
  'bg-emerald-',
  'bg-indigo-',
  'bg-blue-',
  'bg-green-',
  'bg-yellow-',
  'bg-orange-',
  'text-slate-',
  'text-red-',
  'text-amber-',
  'text-emerald-',
  'text-green-',
  'text-blue-',
  'text-indigo-',
  'text-yellow-',
];

describe('UiKpiCardComponent', () => {
  it.each(ALL_TONES)(
    '%s: bg+text resueltos según D12 / R2.2 (CRITICAL-3)',
    async (tone) => {
      const [bg, text, pair] = CONTRACT[tone];
      await render(`<ui-kpi-card label="L" [value]="1" tone="${tone}" />`, {
        imports: [UiKpiCardComponent],
      });

      const wrapper = screen.getByText('1').closest('[data-tone]');
      expect(wrapper).toBeTruthy();
      expect(wrapper?.getAttribute('data-tone')).toBe(tone);
      expect(wrapper?.getAttribute('data-pair')).toBe(pair);
      // Fondo y texto son del token system, no de una escala stock.
      expect(wrapper?.className).toContain(bg);
      expect(wrapper?.className).toContain(text);
    },
  );

  it.each(ALL_TONES)(
    '%s: ninguna clase de la escala stock de Tailwind (R2.2)',
    async (tone) => {
      await render(`<ui-kpi-card label="L" [value]="1" tone="${tone}" />`, {
        imports: [UiKpiCardComponent],
      });
      const wrapper = screen.getByText('1').closest('[data-tone]');
      const classes = wrapper?.className ?? '';
      for (const forbidden of FORBIDDEN_CLASS_PREFIXES) {
        expect(classes).not.toContain(forbidden);
      }
    },
  );

  it.each(ALL_TONES)(
    '%s: todas las clases son tokens o escalas permitidas',
    async (tone) => {
      await render(`<ui-kpi-card label="L" [value]="1" tone="${tone}" />`, {
        imports: [UiKpiCardComponent],
      });
      const wrapper = screen.getByText('1').closest('[data-tone]');
      const classes = wrapper?.className ?? '';
      for (const cls of classes.split(/\s+/)) {
        if (!cls) continue;
        const ok =
          ALLOWED_CLASS_PREFIXES.some((p) => cls.startsWith(p)) ||
          STRUCTURAL_PREFIX.test(cls);
        if (!ok) {
          throw new Error(
            `tone "${tone}" emite una clase no autorizada: "${cls}". ` +
              `Agregala a ALLOWED_CLASS_PREFIXES o a STRUCTURAL_PREFIX con justificación.`,
          );
        }
      }
    },
  );

  it('renders the label and value', async () => {
    await render(`<ui-kpi-card label="Total" [value]="42" tone="brand" />`, {
      imports: [UiKpiCardComponent],
    });
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('omits the icon when iconName is not provided', async () => {
    const { container } = await render(
      `<ui-kpi-card label="L" [value]="1" tone="brand" />`,
      { imports: [UiKpiCardComponent] },
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the icon when iconName is provided', async () => {
    const { container } = await render(
      `<ui-kpi-card label="L" [value]="1" tone="brand" iconName="layers" />`,
      { imports: [UiKpiCardComponent] },
    );
    // El `ui-icon` resuelve como SVG inline (sin provider en el test, cae
    // al respaldo circle-dot; igual cuenta como svg).
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders the trend line when provided', async () => {
    await render(
      `<ui-kpi-card label="L" [value]="1" tone="brand" trend="+12% semana" />`,
      { imports: [UiKpiCardComponent] },
    );
    expect(screen.getByText('+12% semana')).toBeTruthy();
  });
});
