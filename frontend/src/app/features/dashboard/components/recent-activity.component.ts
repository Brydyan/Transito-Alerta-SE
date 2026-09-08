import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import {
  UiBadgeComponent,
  UiBadgeStatus,
  UiBadgePriority,
} from '../../../shared/components/ui-badge/ui-badge.component';
import { ActivityRow } from '../../../core/models/dashboard.model';
import { toIncidentBadgeTone, toPriorityBadgeTone } from '../dashboard.tokens';

/**
 * Actividad reciente — mock 01-01 (F6 redesign).
 *
 * Tabla sin cabecera, 4-5 filas, con badge de estado y prioridad.
 * El footer tiene un enlace "Ver historial completo" que navega
 * al listado de incidencias (F3) — la convención de "ir al lugar
 * canónico del dominio" en lugar de duplicar el filtro acá.
 */
@Component({
  selector: 'app-recent-activity',
  standalone: true,
  imports: [UiCardComponent, UiBadgeComponent, RouterLink],
  template: `
    <ui-card
      title="Actividad reciente"
      subtitle="Últimas actualizaciones del sistema"
    >
      @if (isEmpty()) {
        <p class="empty-state">No hay actividad reciente.</p>
      } @else {
        <ul class="activity" role="list">
          @for (row of rows(); track row.id) {
            <li class="row" role="listitem">
              <span class="category" [title]="row.category">{{ row.category }}</span>
              <ui-badge [variant]="statusTone(row.status)">
                {{ humanize(row.status) }}
              </ui-badge>
              <ui-badge [variant]="priorityTone(row.priority)">
                {{ humanize(row.priority) }}
              </ui-badge>
              <time class="time" [attr.datetime]="row.createdAt" [title]="row.createdAt">
                {{ formatTime(row.createdAt) }}
              </time>
            </li>
          }
        </ul>
        <a
          class="footer-link"
          [routerLink]="['/app/incidencias']"
          fragment="recientes"
        >
          Ver historial completo
        </a>
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
      .activity {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .row {
        display: grid;
        grid-template-columns: 1fr auto auto auto;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
        font-size: 0.875rem;
      }
      .row:last-child {
        border-bottom: none;
      }
      .category {
        color: var(--color-slate-700, #334155);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .time {
        color: var(--color-slate-500, #64748b);
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
      }
      .footer-link {
        display: inline-block;
        margin-top: 0.75rem;
        color: var(--color-brand-primary, #6d28d9);
        font-size: 0.875rem;
        font-weight: 500;
        text-decoration: none;
      }
      .footer-link:hover {
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentActivityComponent {
  private readonly router = inject(Router);

  readonly rows = input.required<ReadonlyArray<ActivityRow>>();

  readonly isEmpty = computed(() => this.rows().length === 0);

  statusTone(status: string): UiBadgeStatus {
    return toIncidentBadgeTone(status);
  }
  priorityTone(priority: string): UiBadgePriority {
    return toPriorityBadgeTone(priority);
  }
  humanize(value: string): string {
    if (!value) return '—';
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
  formatTime(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-EC', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
