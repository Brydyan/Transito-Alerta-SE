import { render, screen } from '@testing-library/angular';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, AlertOctagon } from 'lucide-angular';
import { UiBadgeComponent } from './ui-badge.component';

const ICONS = { AlertOctagon };

/**
 * El mapa completo de par fondo/texto está fijado por D10 (ver
 * `specs/design-system/spec.md`). Estos tests **affirman sobre el par
 * resuelto** (no sobre el hex ni sobre una clase de la escala stock de
 * Tailwind), de modo que un cambio accidental en una sola mitad del par
 * rompe la prueba.
 *
 * Si F1-F6 cambia el `@theme` en `_variables.css` y rompe la regla "ese
 * color DEBE ser el único origen de verdad para badges", estos tests
 * siguen pasando — lo que blinda es la CONEXIÓN al sistema de tokens, no
 * el hex concreto.
 */

const ALL_VARIANTS = [
  'pendiente',
  'en_proceso',
  'resuelto',
  'cerrada',
  'low',
  'medium',
  'high',
  'critical',
] as const;

type Pair = readonly [bg: string, text: string];

/** Contrato D10 — el par fondo/texto exacto por variant. */
const CONTRACT: Record<(typeof ALL_VARIANTS)[number], Pair> = {
  pendiente: ['bg-status-pendiente/20', 'text-on-tint-slate'],
  en_proceso: ['bg-brand-primary-soft', 'text-on-tint-violet'],
  resuelto: ['bg-status-resuelto/15', 'text-on-tint-green'],
  cerrada: ['bg-status-cerrada/12', 'text-on-tint-graphite'],
  low: ['bg-prio-low/15', 'text-on-tint-green'],
  medium: ['bg-prio-medium/40', 'text-on-tint-amber'],
  high: ['bg-prio-high/15', 'text-on-tint-red'],
  // `critical` es la única excepción: fondo sólido (sin alfa) y texto
  // blanco. D9 — la carga semántica de la emergencia requiere la excepción.
  critical: ['bg-prio-critical', 'text-white'],
};

// Familias de clase que el `switch` de `ui-badge` está autorizado a usar.
// Cualquier otra es regresión.
//
// ⚠️ R2.1 de `fixes-required.md`: NO incluir `bg-slate-` ni `text-slate-`. El
// defecto original de CRITICAL-1 era `bg-slate-100 text-slate-700` en
// `pendiente`; mientras esos prefijos estén acá, reintroducir el bug pasa
// el test. Las clases de texto hoy son `text-on-tint-*` y `text-white` (sólo
// `critical`). No se necesita slate en ningún variant.
// Cada entrada debe estar viva: `bg-slate-`/`text-slate-` abrieron el hueco de
// R2.1 justamente por ser entradas muertas que nadie revisó. Si una variante
// deja de usar un prefijo, se saca de acá — una lista de permitidos con basura
// es una lista que no se está leyendo.
const ALLOWED_CLASS_PREFIXES = [
  'bg-status-',
  'bg-prio-',
  'bg-brand-', // `en_proceso` usa `bg-brand-primary-soft`
  'text-on-tint-', // D10 — todo el texto tintado sale de acá
  'text-white', // sólo `critical` lo usa (D9)
];

// Familias explícitamente prohibidas. Si aparece una de éstas en `style().classes`,
// ui-badge está usando escalas stock de Tailwind en lugar de los tokens.
//
// La lista incluye CUALQUIER prefijo de la paleta stock de Tailwind que
// podría usarse como atajo. Está completo por construcción: el día que
// alguien agregue un prefijo nuevo, debe decidir si va a ALLOWED (con
// token correspondiente) o a FORBIDDEN (con un comentario de por qué no
// aplica al dominio de ui-badge).
const FORBIDDEN_CLASS_PREFIXES = [
  'bg-slate-',
  'bg-red-',
  'bg-amber-',
  'bg-emerald-',
  'bg-indigo-',
  'bg-blue-',
  'bg-green-',
  'bg-yellow-',
  'text-slate-',
  'text-red-',
  'text-amber-',
  'text-emerald-',
  'text-green-',
  'text-blue-',
  'text-indigo-',
  'text-yellow-',
];

// Tokens estructurales que el template emite junto a los de color
// (rounded-full, inline-flex, text-xs, etc.) y que no son clases de badge.
//
// ⚠️ R3.2 de `fixes-required.md`: la versión anterior tenía `text-` como
// alternativa desnuda y `text-[a-z0-9-]+$` que matcheaban CUALQUIER
// `text-*`, incluyendo `text-purple-500`. Eso vaciaba de sentido el
// test de "todas las clases son tokens o escalas permitidas" para
// toda la familia text-*. Acotamos a las clases estructurales
// concretas que el template emite.
// El grupo `text-(...)` va anclado con `$`: son nombres de clase completos,
// no prefijos, y sin el ancla `text-xs-purple` pasaría. Los demás son
// prefijos a propósito (`rounded` cubre `rounded-full`, `items-` cubre
// `items-center`), así que el ancla va DENTRO del grupo de text-, no al
// final del regex.
const STRUCTURAL_PREFIX =
  /^(rounded|inline-flex|flex|items-|justify-|whitespace-|tracking-|font-|gap-|px-|py-|p-|m-|shadow-|w-|h-|min-w-|border-|text-(xs|sm|base|lg|xl|2xl|3xl|center|left|right|current|white|on-tint-[a-z]+)$)/;

function classesOf(variant: string): string {
  const label = variant === 'en_proceso' ? 'en proceso' : variant;
  const wrapper = screen.getByText(label).closest('[data-variant]');
  if (!wrapper) throw new Error(`no wrapper for variant ${variant}`);
  return wrapper.className;
}

describe('UiBadgeComponent', () => {
  it('resuelve el variant attribute y el label por defecto', async () => {
    await render(`<ui-badge variant="en_proceso" />`, { imports: [UiBadgeComponent] });
    const wrapper = screen.getByText('en proceso').closest('[data-variant]');
    expect(wrapper?.getAttribute('data-variant')).toBe('en_proceso');
  });

  it('respeta un label explícito sobre el default', async () => {
    await render(`<ui-badge variant="en_proceso" label="En curso" />`, {
      imports: [UiBadgeComponent],
    });
    expect(screen.getByText('En curso')).toBeTruthy();
  });

  // El par fondo/texto resuelto DEBE coincidir con el contrato D10. Si
  // alguien toca sólo una mitad, este test rompe.
  it.each(ALL_VARIANTS)('%s: bg+text resueltos según D10', async (variant) => {
    const [bg, text] = CONTRACT[variant];
    await render(`<ui-badge variant="${variant}" />`, { imports: [UiBadgeComponent] });
    const classes = classesOf(variant);
    expect(classes).toContain(bg);
    expect(classes).toContain(text);
  });

  it('critical lleva un icono además del color (D9)', async () => {
    const { container } = await render(`<ui-badge variant="critical" />`, {
      imports: [UiBadgeComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(ICONS))],
    });
    const wrapper = screen.getByText('critical').closest('[data-variant]');
    expect(wrapper?.className).toContain('bg-prio-critical');
    // El icono se renderiza como SVG inline por `ui-icon`.
    expect(container.querySelector('svg')).toBeTruthy();
  });

  // Red anti-regresión: un test por variant. Si alguien re-introduce una
  // clase stock (Tailwind palette) en el `switch` de `ui-badge`, el test
  // correspondiente rompe.
  it.each(ALL_VARIANTS)(
    '%s no emite ninguna clase de la escala stock de Tailwind',
    async (variant) => {
      await render(`<ui-badge variant="${variant}" />`, { imports: [UiBadgeComponent] });
      const classes = classesOf(variant);
      for (const forbidden of FORBIDDEN_CLASS_PREFIXES) {
        expect(classes).not.toContain(forbidden);
      }
    },
  );

  // Las clases que emite ui-badge deben estar todas dentro de la lista
  // autorizada o ser tokens estructurales del template. Un test por variant.
  it.each(ALL_VARIANTS)(
    '%s: todas las clases son tokens o escalas permitidas',
    async (variant) => {
      await render(`<ui-badge variant="${variant}" />`, { imports: [UiBadgeComponent] });
      const classes = classesOf(variant);
      for (const cls of classes.split(/\s+/)) {
        if (!cls) continue;
        const ok =
          ALLOWED_CLASS_PREFIXES.some((p) => cls.startsWith(p)) ||
          STRUCTURAL_PREFIX.test(cls);
        if (!ok) {
          throw new Error(
            `variant "${variant}" emite una clase no autorizada: "${cls}". ` +
              `Agregala a ALLOWED_CLASS_PREFIXES o a STRUCTURAL_PREFIX con justificación.`,
          );
        }
      }
    },
  );

  // Verifica que el resto de variantes (no critical) NO llevan icono cuando
  // se renderiza con dot=true. Un test por variant, todos en paralelo para
  // no configurar TestBed dos veces en el mismo `it`.
  it.each(
    ALL_VARIANTS.filter((v) => v !== 'critical') as readonly Exclude<
      (typeof ALL_VARIANTS)[number],
      'critical'
    >[],
  )('%s: lleva dot pero NO icono', async (variant) => {
    const { container } = await render(
      `<ui-badge variant="${variant}" [dot]="true" />`,
      { imports: [UiBadgeComponent] },
    );
    const wrapper = classesOf(variant);
    expect(wrapper).toBeTruthy();
    // dot activo, icono ausente.
    expect(container.querySelector('svg')).toBeNull();
  });
});
