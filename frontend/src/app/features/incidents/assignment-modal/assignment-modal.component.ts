import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { AssignmentService, AvailableOperator, OperatorWorkload } from '../../../core/services/assignment.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * AssignmentModalComponent — Phase 3 of incidents-assignment feature.
 *
 * Two-panel modal layout (Design Decision D1):
 *   LEFT  — Operator list with workload counts
 *   RIGHT — Unassigned incidents to pick from (handled by parent/host)
 *
 * Opening modes:
 *   - Toolbar "Asignar" button: no pre-selected incident
 *   - Row "Asignar" dropdown action: incident pre-selected via `preSelectIncident()`
 *
 * State:
 *   - selectedOperatorId — chosen operator (null until user picks one)
 *   - selectedIncidentId — chosen incident (null until user picks one)
 *   - operatorList       — fetched from GET /operators/locations
 *   - workloads          — map<operatorId, count> populated lazily
 *   - isAssigning        — prevents double-submit
 *
 * RBAC: shown only when the host (incident-list) confirms 'ASSIGN' permission.
 * The backend also enforces it, but the guard is in the host component.
 */
@Component({
  selector: 'app-assignment-modal',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Asignar incidencia a operador"
      (click)="onBackdropClick($event)"
    >
      <div class="modal-card" (click)="$event.stopPropagation()">
        <!-- Header -->
        <header class="modal-header">
          <h2 class="modal-title">Asignar Incidencia</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Cerrar"
            (click)="close()"
          >
            <ui-icon name="x" [size]="18" [strokeWidth]="2" />
          </button>
        </header>

        <!-- Two-panel body (D1) -->
        <div class="modal-body modal-body--two-panel">
          <!-- LEFT: Operator list -->
          <section class="panel panel--operators" aria-label="Operadores disponibles">
            <h3 class="panel-title">Operadores</h3>

            @if (loadingOperators()) {
              <div class="panel-loading">Cargando operadores...</div>
            } @else if (operatorList().length === 0) {
              <div class="panel-empty">No hay operadores disponibles.</div>
            } @else {
              <ul class="operator-list" role="listbox" aria-label="Lista de operadores">
                @for (op of operatorList(); track op.user_id) {
                  <li
                    class="operator-item"
                    role="option"
                    [attr.aria-selected]="selectedOperatorId() === op.user_id"
                    [class.operator-item--selected]="selectedOperatorId() === op.user_id"
                    (click)="selectOperator(op.user_id)"
                    [attr.data-testid]="'operator-' + op.user_id"
                  >
                    <span class="operator-name">
                      {{ op.operator_name || op.user_id }}
                    </span>
                    <span class="operator-workload">
                      {{ workloads().get(op.user_id) ?? '—' }} asign.
                    </span>
                  </li>
                }
              </ul>
            }
          </section>

          <!-- RIGHT: Incident selector slot — host projects incidents here -->
          <section class="panel panel--incidents" aria-label="Incidencia seleccionada">
            <h3 class="panel-title">Incidencia</h3>

            @if (selectedIncidentId()) {
              <div class="incident-selected" [attr.data-testid]="'selected-incident-' + selectedIncidentId()">
                <ui-icon name="check-circle" [size]="16" class="incident-selected__icon" />
                <span class="incident-selected__label">Incidencia seleccionada</span>
                <span class="incident-selected__id">{{ selectedIncidentId() }}</span>
                <button
                  type="button"
                  class="incident-clear"
                  aria-label="Quitar selección de incidencia"
                  (click)="selectIncident(null)"
                >
                  <ui-icon name="x" [size]="14" />
                </button>
              </div>
            } @else {
              <div class="incident-placeholder">
                Selecciona una incidencia desde la lista para asignar.
              </div>
            }
          </section>
        </div>

        <!-- Footer -->
        <footer class="modal-footer">
          <button
            type="button"
            class="btn btn--secondary"
            (click)="close()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn--primary"
            [disabled]="!canAssign() || isAssigning()"
            (click)="submit()"
            data-testid="assign-submit"
          >
            @if (isAssigning()) {
              Asignando...
            } @else {
              Asignar
            }
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: contents; }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: fadeIn 0.15s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      .modal-card {
        background: var(--color-bg-secondary, #fff);
        border-radius: 0.75rem;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
        width: 100%;
        max-width: 52rem;
        max-height: calc(100vh - 2rem);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.2s ease;
      }
      @keyframes slideUp {
        from { transform: translateY(0.5rem); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
        flex-shrink: 0;
      }
      .modal-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-slate-800, #1e293b);
      }
      .modal-close {
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
      .modal-close:hover { background: var(--color-bg-primary, #f1f5f9); }

      .modal-body { overflow-y: auto; flex: 1; }
      .modal-body--two-panel {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
      }

      .panel {
        padding: 1rem 1.25rem;
        overflow-y: auto;
      }
      .panel--operators {
        border-right: 1px solid var(--color-border-subtle, #e2e8f0);
      }
      .panel-title {
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-slate-500, #64748b);
        margin: 0 0 0.75rem;
      }
      .panel-loading, .panel-empty {
        font-size: 0.875rem;
        color: var(--color-slate-500, #64748b);
        padding: 0.5rem 0;
      }

      .operator-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .operator-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.625rem 0.75rem;
        border-radius: 0.5rem;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.1s, border-color 0.1s;
      }
      .operator-item:hover {
        background: var(--color-bg-primary, #f1f5f9);
      }
      .operator-item--selected {
        background: var(--color-blue-50, #eff6ff);
        border-color: var(--color-blue-300, #93c5fd);
      }
      .operator-name {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-slate-800, #1e293b);
      }
      .operator-workload {
        font-size: 0.75rem;
        color: var(--color-slate-500, #64748b);
        background: var(--color-slate-100, #f1f5f9);
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
      }

      .incident-selected {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.625rem 0.75rem;
        border-radius: 0.5rem;
        background: var(--color-green-50, #f0fdf4);
        border: 1px solid var(--color-green-300, #86efac);
      }
      .incident-selected__icon { color: var(--color-green-600, #16a34a); }
      .incident-selected__label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-slate-700, #334155);
      }
      .incident-selected__id {
        font-size: 0.75rem;
        color: var(--color-slate-500, #64748b);
        font-family: monospace;
      }
      .incident-clear {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        color: var(--color-slate-500, #64748b);
        padding: 0.125rem;
        border-radius: 0.25rem;
      }
      .incident-clear:hover { color: var(--color-slate-700, #334155); }
      .incident-placeholder {
        font-size: 0.875rem;
        color: var(--color-slate-500, #64748b);
        padding: 0.5rem 0;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 1rem 1.25rem;
        border-top: 1px solid var(--color-border-subtle, #e2e8f0);
        flex-shrink: 0;
      }
      .btn {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 0.5rem;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.15s, opacity 0.15s;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn--secondary {
        background: var(--color-bg-secondary, #fff);
        color: var(--color-slate-700, #334155);
        border-color: var(--color-border-subtle, #e2e8f0);
      }
      .btn--secondary:hover:not(:disabled) { background: var(--color-bg-primary, #f1f5f9); }
      .btn--primary {
        background: var(--color-blue-600, #2563eb);
        color: #fff;
      }
      .btn--primary:hover:not(:disabled) { background: var(--color-blue-700, #1d4ed8); }
    `,
  ],
})
export class AssignmentModalComponent implements OnInit {
  private readonly assignmentService = inject(AssignmentService);
  private readonly toastService = inject(ToastService);

  /**
   * Pre-selected incident ID from row "Asignar" action.
   * If set, the modal will auto-fill this incident on init.
   * If null, the user must select an incident manually.
   */
  @Input() preSelectedIncidentId: string | null = null;

  // ── State signals (design.md — State Management) ────────────────────
  readonly selectedOperatorId = signal<string | null>(null);
  readonly selectedIncidentId = signal<string | null>(null);
  readonly operatorList = signal<AvailableOperator[]>([]);
  readonly workloads = signal<Map<string, number>>(new Map());
  readonly isAssigning = signal<boolean>(false);
  readonly loadingOperators = signal<boolean>(true);

  // ── Derived ─────────────────────────────────────────────────────────
  /** True only when both an operator AND an incident are selected. */
  readonly canAssign = computed(
    () => this.selectedOperatorId() !== null && this.selectedIncidentId() !== null,
  );

  /** Emitted when the modal is closed (success or cancel). */
  @Output() readonly closed = new EventEmitter<void>();

  /** Emitted on successful assignment; parent can refresh incident list. */
  @Output() readonly assigned = new EventEmitter<{ incidentId: string; operatorId: string }>();

  ngOnInit(): void {
    // If a pre-selected incident was passed in (row "Asignar" action),
    // auto-fill it in the modal (Design D1: row-level pre-selection).
    if (this.preSelectedIncidentId) {
      this.selectedIncidentId.set(this.preSelectedIncidentId);
    }
    this.loadOperators();
  }

  // ── Operator selection ──────────────────────────────────────────────

  selectOperator(operatorId: string | null): void {
    this.selectedOperatorId.set(operatorId);
  }

  // ── Incident selection ──────────────────────────────────────────────

  selectIncident(incidentId: string | null): void {
    this.selectedIncidentId.set(incidentId);
  }

  /** Pre-fills the incident (called from row "Asignar" action). */
  preSelectIncident(incidentId: string): void {
    this.selectedIncidentId.set(incidentId);
  }

  // ── Submission ──────────────────────────────────────────────────────

  /**
   * Calls the backend to create the assignment.
   *
   * On success: emits `assigned`, shows success toast, closes modal.
   * On 409: shows conflict toast, resets isAssigning (modal stays open
   * so the supervisor can pick a different incident).
   * On other error: shows generic error toast.
   */
  submit(): void {
    const operatorId = this.selectedOperatorId();
    const incidentId = this.selectedIncidentId();
    if (!operatorId || !incidentId) return;

    this.isAssigning.set(true);
    this.assignmentService.assign(incidentId, operatorId).subscribe({
      next: () => {
        this.isAssigning.set(false);
        this.toastService.success('Incidencia asignada correctamente');
        this.assigned.emit({ incidentId, operatorId });
        this.close();
      },
      error: (err: HttpErrorResponse) => {
        this.isAssigning.set(false);
        if (err.status === 409) {
          this.toastService.error(
            'Este incidente ya fue asignado',
            'Conflicto',
          );
        } else {
          this.toastService.error(
            'Error al asignar la incidencia. Intente nuevamente.',
            'Error',
          );
        }
      },
    });
  }

  // ── Close ───────────────────────────────────────────────────────────

  close(): void {
    this.selectedOperatorId.set(null);
    this.selectedIncidentId.set(null);
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private loadOperators(): void {
    this.loadingOperators.set(true);
    this.assignmentService.getAvailableOperators().subscribe({
      next: (operators) => {
        this.operatorList.set(operators);
        this.loadingOperators.set(false);
        // Load workload counts for each operator concurrently (D4)
        operators.forEach((op) => this.loadWorkload(op.user_id));
      },
      error: () => {
        this.operatorList.set([]);
        this.loadingOperators.set(false);
      },
    });
  }

  private loadWorkload(operatorId: string): void {
    this.assignmentService.getOperatorWorkload(operatorId).subscribe({
      next: (wl) => {
        const next = new Map(this.workloads());
        next.set(operatorId, wl.count);
        this.workloads.set(next);
      },
      error: () => {
        // Non-fatal: workload count stays as '—' if fetch fails
      },
    });
  }
}
