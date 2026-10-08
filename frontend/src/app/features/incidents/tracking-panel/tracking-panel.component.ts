import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { AssignmentService, Assignment } from '../../../core/services/assignment.service';
import { IncidentService } from '../../../core/services/incident.service';
import { Incident, IncidentPriority, IncidentStatus } from '../../../core/models/incident.model';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * TrackingPanelComponent — Phase 5 of incidents-assignment feature.
 *
 * Side panel that shows an incident summary + operator info + elapsed timers.
 *
 * Design Decision D3 — Live client-side timers (setInterval):
 *   - No backend polling needed; timestamps already in incident/assignment
 *   - `setInterval` ticks every second to update `elapsedSinceCreation` and
 *     `elapsedSinceAssignment` signals
 *   - ngOnDestroy clears the interval to prevent memory leaks
 *
 * Opens from the "Seguimiento" row action in ActionsDropdownComponent.
 */
@Component({
  selector: 'app-tracking-panel',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="tracking-panel"
      role="complementary"
      aria-label="Panel de seguimiento de incidencia"
    >
      <!-- Panel header -->
      <header class="panel-header">
        <div class="panel-header__content">
          <ui-icon name="activity" [size]="18" class="panel-header__icon" />
          <h2 class="panel-header__title">Seguimiento</h2>
        </div>
        <button
          type="button"
          class="panel-close"
          aria-label="Cerrar panel de seguimiento"
          (click)="close()"
        >
          <ui-icon name="x" [size]="18" [strokeWidth]="2" />
        </button>
      </header>

      <!-- Loading state -->
      @if (loading()) {
        <div class="panel-loading" aria-live="polite">Cargando...</div>
      }

      <!-- Incident summary card -->
      @if (!loading() && incidentData(); as incident) {
        <section class="summary-card" data-testid="incident-summary">
          <div class="summary-card__header">
            <span class="summary-badge summary-badge--{{ incident.status }}">
              {{ statusLabel(incident.status) }}
            </span>
            <span class="summary-badge summary-badge--priority-{{ incident.priority }}">
              {{ priorityLabel(incident.priority) }}
            </span>
          </div>

          <h3 class="summary-card__title">{{ incident.title }}</h3>

          @if (incident.description) {
            <p class="summary-card__desc">{{ incident.description }}</p>
          }

          <!-- Operator assignment info -->
          <div class="assignment-info">
            @if (latestAssignment(); as assignment) {
              <div class="assignment-info__row">
                <ui-icon name="user-check" [size]="14" />
                <span class="assignment-info__label">Operador:</span>
                <span class="assignment-info__value">
                  {{ assignment.operator_name || assignment.operator_id }}
                </span>
              </div>
            } @else {
              <div class="assignment-info__row assignment-info__row--unassigned">
                <ui-icon name="user-x" [size]="14" />
                <span>Sin asignación</span>
              </div>
            }
          </div>
        </section>

        <!-- Elapsed timers section (D3) -->
        <section class="timers-section" data-testid="elapsed-timers">
          <h4 class="timers-title">Tiempos transcurridos</h4>

          <div class="timer-item">
            <div class="timer-item__label">
              <ui-icon name="clock" [size]="14" />
              Desde creación
            </div>
            <div class="timer-item__value" data-testid="elapsed-creation">
              {{ elapsedSinceCreation() }}
            </div>
          </div>

          @if (latestAssignment()) {
            <div class="timer-item">
              <div class="timer-item__label">
                <ui-icon name="user-check" [size]="14" />
                Desde asignación
              </div>
              <div class="timer-item__value" data-testid="elapsed-assignment">
                {{ elapsedSinceAssignment() }}
              </div>
            </div>
          }
        </section>
      }

      <!-- No data fallback -->
      @if (!loading() && !incidentData()) {
        <div class="panel-empty">No se encontró información para esta incidencia.</div>
      }
    </aside>
  `,
  styles: [
    `
      :host { display: contents; }

      .tracking-panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 22rem;
        background: var(--color-bg-secondary, #fff);
        border-left: 1px solid var(--color-border-subtle, #e2e8f0);
        box-shadow: -4px 0 16px rgb(0 0 0 / 0.08);
        z-index: 900;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        animation: slideLeft 0.2s ease;
      }
      @keyframes slideLeft {
        from { transform: translateX(1rem); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
        flex-shrink: 0;
      }
      .panel-header__content {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .panel-header__icon { color: var(--color-blue-600, #2563eb); }
      .panel-header__title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-slate-800, #1e293b);
      }
      .panel-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        color: var(--color-slate-500, #64748b);
        background: transparent;
        border: 0;
        border-radius: 0.375rem;
        cursor: pointer;
      }
      .panel-close:hover { background: var(--color-bg-primary, #f1f5f9); }

      .panel-loading, .panel-empty {
        padding: 1.5rem;
        font-size: 0.875rem;
        color: var(--color-slate-500, #64748b);
        text-align: center;
      }

      .summary-card {
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
      }
      .summary-card__header {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
      }
      .summary-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.125rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        border-radius: 9999px;
        background: var(--color-slate-100, #f1f5f9);
        color: var(--color-slate-700, #334155);
      }
      .summary-badge--pending { background: #fef3c7; color: #92400e; }
      .summary-badge--in_progress { background: #dbeafe; color: #1e40af; }
      .summary-badge--resolved { background: #dcfce7; color: #14532d; }
      .summary-badge--closed { background: #f1f5f9; color: #475569; }
      .summary-badge--priority-low { background: #f0fdf4; color: #14532d; }
      .summary-badge--priority-medium { background: #fef9c3; color: #713f12; }
      .summary-badge--priority-high { background: #ffedd5; color: #9a3412; }
      .summary-badge--priority-critical { background: #fee2e2; color: #7f1d1d; }

      .summary-card__title {
        margin: 0 0 0.5rem;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--color-slate-800, #1e293b);
        line-height: 1.4;
      }
      .summary-card__desc {
        margin: 0 0 0.75rem;
        font-size: 0.8125rem;
        color: var(--color-slate-600, #475569);
        line-height: 1.5;
      }

      .assignment-info__row {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        color: var(--color-slate-700, #334155);
        padding: 0.375rem 0;
      }
      .assignment-info__row--unassigned { color: var(--color-slate-500, #64748b); }
      .assignment-info__label { color: var(--color-slate-500, #64748b); }
      .assignment-info__value { font-weight: 500; }

      .timers-section { padding: 1rem 1.25rem; }
      .timers-title {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-slate-500, #64748b);
        margin: 0 0 0.75rem;
      }

      .timer-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
      }
      .timer-item:last-child { border-bottom: 0; }
      .timer-item__label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        color: var(--color-slate-600, #475569);
      }
      .timer-item__value {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-slate-800, #1e293b);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class TrackingPanelComponent implements OnInit, OnDestroy {
  private readonly assignmentService = inject(AssignmentService);
  private readonly incidentService = inject(IncidentService);

  /** ID of the incident to track. Set by the host (incident-list). */
  @Input() incidentId = '';

  @Output() readonly closed = new EventEmitter<void>();

  // ── State signals ────────────────────────────────────────────────────
  readonly loading = signal<boolean>(true);
  readonly incidentData = signal<Incident | null>(null);
  readonly latestAssignment = signal<Assignment | null>(null);
  readonly elapsedSinceCreation = signal<string>('—');
  readonly elapsedSinceAssignment = signal<string>('—');

  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.load();
  }

  /**
   * OnDestroy cleanup — CRITICAL to prevent memory leaks.
   * Design D3: timers live only while this panel is mounted.
   */
  ngOnDestroy(): void {
    this.stopTimer();
  }

  close(): void {
    this.closed.emit();
  }

  /** Human-readable status label (Spanish). */
  statusLabel(status: IncidentStatus): string {
    const labels: Record<IncidentStatus, string> = {
      pending: 'Pendiente',
      in_progress: 'En proceso',
      resolved: 'Resuelto',
      closed: 'Cerrado',
    };
    return labels[status] ?? status;
  }

  /** Human-readable priority label (Spanish). */
  priorityLabel(priority: IncidentPriority): string {
    const labels: Record<IncidentPriority, string> = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      critical: 'Crítica',
    };
    return labels[priority] ?? priority;
  }

  private load(): void {
    this.loading.set(true);

    this.incidentService.getIncident(this.incidentId).subscribe({
      next: (incident) => {
        this.incidentData.set(incident);
        this.loading.set(false);
        this.startTimer();
      },
      error: () => {
        this.incidentData.set(null);
        this.loading.set(false);
      },
    });

    this.assignmentService.getLatestAssignment(this.incidentId).subscribe({
      next: (assignment) => {
        this.latestAssignment.set(assignment);
        this.updateElapsedTimes();
      },
      error: () => {
        this.latestAssignment.set(null);
      },
    });
  }

  /**
   * Starts the 1-second tick that updates elapsed time signals.
   * Design D3: setInterval is sufficient for "2 h 15 min" precision.
   */
  private startTimer(): void {
    this.stopTimer(); // clear any existing interval
    this.updateElapsedTimes();
    this.intervalId = setInterval(() => {
      this.updateElapsedTimes();
    }, 1_000);
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private updateElapsedTimes(): void {
    const incident = this.incidentData();
    if (incident?.created_at) {
      this.elapsedSinceCreation.set(formatElapsed(incident.created_at));
    }

    const assignment = this.latestAssignment();
    if (assignment?.created_at) {
      this.elapsedSinceAssignment.set(formatElapsed(assignment.created_at));
    }
  }
}

/**
 * Formats the elapsed time from a past date to now.
 * Output: "2 h 15 min", "45 min", "30 s"
 *
 * Precision is intentionally coarse (minutes) to match the
 * design spec ("2 hours 15 min"). Seconds are only shown for
 * very recent events (< 1 minute).
 */
function formatElapsed(from: Date): string {
  const diffMs = Date.now() - new Date(from).getTime();
  if (diffMs < 0) return '—';

  const totalSeconds = Math.floor(diffMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}
