import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

export type UiKpiTone =
  | 'brand'
  | 'cyan'
  | 'green'
  | 'red'
  | 'slate'
  | 'amber'
  | 'violet';

interface KpiStyle {
  /** Clases del bloque de color. */
  readonly wrapper: string;
  /** Clases del icono translúcido (mismo color que el texto). */
  readonly iconBox: string;
  /** Color sólido de fondo — necesario para `data-tone` y para
   *  contrastar con la regla de F0.4.5 que exige bloque de color sólido. */
  readonly solidBg: string;
  /** Etiqueta semántica de la combinación fondo/texto resuelta
   *  — la usa el spec para afirmar sobre la accesibilidad. */
  readonly pair: 'light-text' | 'dark-text';
}

/**
 * Tarjeta KPI de color sólido — F0.4.5 (mock 01-01) con corrección D12.
 *
 * Bloque de color sólido con texto blanco (o grafito, según par accesible).
 * Valor grande, etiqueta, icono en cuadro translúcido, pie de tendencia
 * en versalitas. `tone` elige el color base.
 *
 * Tones y pares accesibles (D12, ver `specs/design-system/spec.md`):
 *
 * | Tone   | Fondo                   | Texto                     | Umbral    |
 * |--------|-------------------------|---------------------------|-----------|
 * | brand  | bg-brand-primary        | text-white                | ≥ 4.5 ✓   |
 * | cyan   | bg-accent-cyan          | **text-on-tint-graphite** | ≥ 4.5 ✓   |
 * | green  | bg-accent-green         | **text-on-tint-graphite** | ≥ 4.5 ✓   |
 * | red    | **bg-prio-critical**    | text-white                | ≥ 4.5 ✓   |
 * | slate  | **bg-status-cerrada**   | text-white                | ≥ 4.5 ✓   |
 * | amber  | **bg-prio-medium**      | **text-on-tint-amber**    | ≥ 4.5 ✓   |
 * | violet | bg-brand-primary-hover  | text-white                | ≥ 4.5 ✓   |
 *
 * **Se cita el umbral, no el valor.** El valor exacto se recalcula en cada
 * corrida desde los tokens — vive en la verificación ejecutable:
 * `frontend/src/app/shared/components/contrast.regression.spec.ts`.
 * Históricamente citar el número envejeció mal: en F0 varias cifras
 * documentadas fallaron al recálculo, en parte por estimar el blend de alfa
 * en vez de calcularlo.
 *
 * Por qué los pares cambiaron: `cyan` (#06B6D4) y `green` (#22C55E) con
 * blanco no alcanzaban el umbral; pasan a texto grafito. `red` (#EF4444)
 * con blanco tampoco llegaba; cambia el fondo a `bg-prio-critical`
 * (#B91C1C), que de paso alinea el KPI de críticas con el badge `critical`
 * (sólido en ese mismo rojo por D10).
 *
 * @example
 *   <ui-kpi-card label="Total" [value]="42" tone="brand" iconName="layers" />
 *   <ui-kpi-card label="En proceso" [value]="7" tone="cyan" trend="+2 hoy" />
 *   <ui-kpi-card label="Críticas" [value]="1" tone="red" iconName="alert-octagon" />
 */
@Component({
  selector: 'ui-kpi-card',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <div
      class="ui-kpi-card rounded-2xl px-5 py-5 flex flex-col gap-3 shadow-sm"
      [class]="style().wrapper"
      [attr.data-tone]="tone()"
      [attr.data-pair]="style().pair"
    >
      <div class="flex items-start justify-between">
        <p class="text-[0.7rem] font-semibold tracking-[0.12em] uppercase opacity-90">
          {{ label() }}
        </p>
        @if (iconName()) {
          <span
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15"
            [class]="style().iconBox"
          >
            <ui-icon [name]="iconName()!" [size]="18" [strokeWidth]="2" />
          </span>
        }
      </div>
      <p class="text-3xl font-bold leading-none tabular-nums">{{ value() }}</p>
      @if (trend()) {
        <p
          class="text-[0.7rem] font-semibold tracking-[0.12em] uppercase opacity-90"
        >
          {{ trend() }}
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiKpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly iconName = input<string>('');
  readonly tone = input<UiKpiTone>('brand');
  readonly trend = input<string>('');

  readonly style = computed<KpiStyle>(() => {
    const map: Record<UiKpiTone, KpiStyle> = {
      // Violeta del brand — texto blanco. Verificación en contrast.regression.spec.ts.
      brand: {
        wrapper: 'bg-brand-primary text-white',
        iconBox: 'text-white',
        solidBg: '#7C3AED',
        pair: 'light-text',
      },
      // Cyan (#06B6D4) y green (#22C55E) sobre blanco NO llegan al umbral.
      // D12: texto grafito, el icono hereda el mismo color.
      cyan: {
        wrapper: 'bg-accent-cyan text-on-tint-graphite',
        iconBox: 'text-on-tint-graphite',
        solidBg: '#06B6D4',
        pair: 'dark-text',
      },
      green: {
        wrapper: 'bg-accent-green text-on-tint-graphite',
        iconBox: 'text-on-tint-graphite',
        solidBg: '#22C55E',
        pair: 'dark-text',
      },
      // `red` cambia el fondo a `bg-prio-critical` (#B91C1C) para llegar al
      // umbral con texto blanco. Antes era `bg-prio-high` (#EF4444), que no
      // llegaba. Verificación en contrast.regression.spec.ts.
      red: {
        wrapper: 'bg-prio-critical text-white',
        iconBox: 'text-white',
        solidBg: '#B91C1C',
        pair: 'light-text',
      },
      // Slate — R2.2: `bg-slate-700` es stock; uso `bg-status-cerrada` que
      // es el mismo gris oscuro de la paleta de tokens y el que usa
      // `cerrada` en `ui-badge` (consistencia entre primitivos).
      slate: {
        wrapper: 'bg-status-cerrada text-white',
        iconBox: 'text-white',
        solidBg: '#1F2937',
        pair: 'light-text',
      },
      // Amber — R2.2: `bg-amber-500` y `text-slate-900` son stock. Uso
      // `bg-prio-medium` (la prioridad media del sistema) con el token de
      // texto `text-on-tint-amber`. El valor exacto se recalcula en
      // contrast.regression.spec.ts; acá se cita sólo el umbral.
      amber: {
        wrapper: 'bg-prio-medium text-on-tint-amber',
        iconBox: 'text-on-tint-amber',
        solidBg: '#FCD34D',
        pair: 'dark-text',
      },
      // Violet (hover del brand) — texto blanco.
      violet: {
        wrapper: 'bg-brand-primary-hover text-white',
        iconBox: 'text-white',
        solidBg: '#6D28D9',
        pair: 'light-text',
      },
    };
    return map[this.tone()];
  });
}
