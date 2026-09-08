import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import { WeeklyDayPoint } from '../../../core/models/dashboard.model';

/**
 * Rendimiento semanal — mock 01-01 (F6 redesign).
 *
 * Gráfico de barras agrupadas (recibidas vs resueltas por día).
 * Decisión F6/D4: CSS, sin librería.
 *
 * La escala Y se calcula del máximo entre las dos series, con
 * un piso de 8 para que el gráfico no se vea aplastado cuando
 * casi no hay actividad. Los colores salen de tokens — `brand`
 * para recibidas, `green` (F0) para resueltas.
 */
@Component({
  selector: 'app-weekly-performance-chart',
  standalone: true,
  imports: [UiCardComponent],
  template: `
    <ui-card
      title="Rendimiento semanal"
      subtitle="Incidencias recibidas vs resueltas por día"
    >
      @if (isEmpty()) {
        <p class="empty-state">No hay datos para mostrar.</p>
      } @else {
        <div class="chart" role="img" aria-label="Gráfico de rendimiento semanal">
          <ul class="bars" role="list">
            @for (day of data(); track day.date) {
              <li class="day-col" role="listitem" [attr.aria-label]="day.label + ': ' + day.recibidas + ' recibidas, ' + day.resueltas + ' resueltas'">
                <div class="bar-pair">
                  <div
                    class="bar bar-received"
                    [style.height.%]="heightPct(day.recibidas)"
                    [attr.data-value]="day.recibidas"
                    title="{{ day.recibidas }} recibidas"
                  ></div>
                  <div
                    class="bar bar-resolved"
                    [style.height.%]="heightPct(day.resueltas)"
                    [attr.data-value]="day.resueltas"
                    title="{{ day.resueltas }} resueltas"
                  ></div>
                </div>
                <span class="day-label">{{ day.label }}</span>
              </li>
            }
          </ul>
        </div>
        <div class="legend" aria-hidden="true">
          <span class="legend-item">
            <span class="legend-swatch swatch-received"></span>
            Recibidas
          </span>
          <span class="legend-item">
            <span class="legend-swatch swatch-resolved"></span>
            Resueltas
          </span>
        </div>
      }
    </ui-card>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .empty-state {
        color: var(--color-slate-500, #64748b);
        text-align: center;
        padding: 1.5rem 0;
        font-size: 0.875rem;
      }
      .chart {
        height: 12rem;
        display: flex;
        align-items: flex-end;
        padding: 0.5rem 0;
      }
      .bars {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr));
        gap: 0.5rem;
        width: 100%;
        height: 100%;
        align-items: end;
      }
      .day-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .bar-pair {
        display: flex;
        align-items: flex-end;
        gap: 0.125rem;
        height: calc(100% - 1.25rem);
        width: 100%;
        justify-content: center;
      }
      .bar {
        width: 0.5rem;
        min-height: 2px;
        border-radius: 0.25rem 0.25rem 0 0;
        transition: height 0.3s ease;
      }
      .bar-received {
        background: var(--color-brand-primary, #6d28d9);
      }
      .bar-resolved {
        background: var(--color-success, #10b981);
      }
      .day-label {
        font-size: 0.75rem;
        color: var(--color-slate-500, #64748b);
        font-weight: 500;
      }
      .legend {
        display: flex;
        gap: 1rem;
        margin-top: 0.75rem;
        font-size: 0.75rem;
        color: var(--color-slate-600, #475569);
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
      }
      .legend-swatch {
        display: inline-block;
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 0.25rem;
      }
      .swatch-received {
        background: var(--color-brand-primary, #6d28d9);
      }
      .swatch-resolved {
        background: var(--color-success, #10b981);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeeklyPerformanceChartComponent {
  readonly data = input.required<ReadonlyArray<WeeklyDayPoint>>();

  /** Y máxima visible — techo duro de 8 para que el gráfico no
   *  se aplaste cuando hay poca actividad (mock 01-01 marca
   *  0-8 como escala). */
  readonly yMax = input<number>(8);

  readonly maxValue = computed(() => {
    const d = this.data();
    if (d.length === 0) return 0;
    const all = d.flatMap((day) => [day.recibidas, day.resueltas]);
    return Math.max(...all, this.yMax());
  });

  readonly isEmpty = computed(() => this.data().length === 0);

  heightPct(value: number): number {
    const max = this.maxValue();
    if (max <= 0) return 0;
    return Math.max(2, Math.round((value / max) * 100));
  }
}
