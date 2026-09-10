import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import { TopCategory } from '../../../core/models/dashboard.model';

/**
 * Top 5 categorías — mock 01-01 (F6 redesign).
 *
 * Gráfico de barras horizontales. Decisión de diseño (F6/D4):
 * **no se introduce una librería de gráficos** — el proyecto ya
 * rechazó otra en D4 (F0). CSS basta: cada categoría es una fila
 * con etiqueta + barra cuya `width` es proporcional al máximo.
 *
 * Colores derivados de tokens: el fondo de la barra usa la
 * variable CSS `--color-brand-primary` (definida en F0) en lugar
 * de un literal hexadecimal.
 *
 * Vacío: si `data` está vacío, muestra el componente `EmptyState`
 * de F0 — distinguible de un fallo de carga.
 */
@Component({
  selector: 'app-top-categories-chart',
  standalone: true,
  imports: [UiCardComponent],
  template: `
    <ui-card title="Top Categorías" subtitle="Incidencias por categoría">
      @if (isEmpty()) {
        <p class="empty-state">No hay datos para mostrar.</p>
      } @else {
        <ul class="bars" role="list">
          @for (cat of ranked(); track cat.name) {
            <li class="bar-row" role="listitem">
              <span class="bar-label" [title]="cat.name">{{ cat.name }}</span>
              <div
                class="bar-track"
                role="progressbar"
                [attr.aria-valuenow]="cat.total"
                [attr.aria-valuemin]="0"
                [attr.aria-valuemax]="maxTotal()"
                [attr.aria-label]="cat.name + ': ' + cat.total + ' incidencias'"
              >
                <div class="bar-fill" [style.width.%]="widthPct(cat.total)">
                  <span class="bar-value">{{ cat.total }}</span>
                </div>
              </div>
            </li>
          }
        </ul>
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
      .bars {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .bar-row {
        display: grid;
        grid-template-columns: minmax(7rem, 12rem) 1fr;
        align-items: center;
        gap: 0.75rem;
      }
      .bar-label {
        font-size: 0.875rem;
        color: var(--color-slate-700, #334155);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar-track {
        height: 1.5rem;
        background: var(--color-bg-soft, #f1f5f9);
        border-radius: 0.5rem;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        background: var(--color-brand-primary, #6d28d9);
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 0.5rem;
        transition: width 0.3s ease;
      }
      .bar-value {
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopCategoriesChartComponent {
  readonly data = input.required<ReadonlyArray<TopCategory>>();
  /** `slice(0, 5)` se aplica en el dashboard para mantener este
   *  componente agnóstico al límite del mock. */
  readonly maxItems = input<number>(5);

  readonly ranked = computed(() => {
    return [...this.data()].sort((a, b) => b.total - a.total).slice(0, this.maxItems());
  });

  readonly maxTotal = computed(() => {
    const r = this.ranked();
    return r.length === 0 ? 0 : Math.max(...r.map((c) => c.total));
  });

  readonly isEmpty = computed(() => this.ranked().length === 0);

  widthPct(value: number): number {
    const max = this.maxTotal();
    if (max <= 0) return 0;
    return Math.max(2, Math.round((value / max) * 100));
  }
}
