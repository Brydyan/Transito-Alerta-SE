import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import {
  AssignmentService,
  AvailableOperatorForIncident,
} from '../../../core/services/assignment.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * AssignDialogComponent — modal de despacho de F7 emergency-dispatch.
 *
 * 2026-10-17-F7-dispatch-ui — se abre cuando el admin_org hace click
 * en "Asignar" sobre un incidente. Flujos soportados:
 *
 *  - happy path: lista operadores disponibles, el admin selecciona
 *    uno, llama `POST /assignments`.
 *  - override (design D3): si el operador seleccionado está saturado
 *    (`activeClaimCount === maxActive`) Y la prioridad del incidente
 *    es `critical`, se habilita un form de override que requiere
 *    `overrideReason` (texto libre, ≥1 char). El backend valida
 *    `CAP_OVERRIDE_REASON_REQUIRED` si llega sin razón.
 *  - reasignar: si el incidente ya tiene una asignación activa
 *    (`existingAssignmentId !== null`), el submit usa
 *    `PATCH /assignments/:id` en vez de `POST /assignments`. La
 *    reasignación respeta los mismos override fields.
 *  - errores mapeados:
 *      - 409: ya hay asignación activa → toast y mantiene dialog
 *      - 429: cap-reached (override no enviado) → mensaje específico
 *      - 422 override: reason requerida → toast
 *      - 403 WRONG_ORGANIZATION: operador de otra org → toast
 *
 * Diseño visual: lista de operadores con badges "N de M" (M =
 * `maxActive`, N = `activeClaimCount`). El operador saturado se
 * renderiza igual, no se filtra — el admin decide si quiere override.
 */
@Component({
  selector: 'app-assign-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open()) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Despachar operador'"
        (click)="onBackdropClick($event)"
        data-testid="assign-dialog"
      >
        <div class="modal-card" (click)="$event.stopPropagation()">
          <header class="modal-header">
            <h2 class="modal-title">Despachar operador</h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Cerrar"
              (click)="cancel()"
              data-testid="btn-close"
            >
              ✕
            </button>
          </header>

          <div class="modal-body">
            @if (loading()) {
              <p class="text-sm text-slate-500">Cargando operadores…</p>
            } @else if (availableOperators().length === 0) {
              <p class="text-sm text-slate-500" data-testid="empty-state">
                No hay operadores disponibles en esta organización.
              </p>
            } @else {
              <ul class="space-y-2" data-testid="operator-list">
                @for (op of availableOperators(); track op.id) {
                  <li>
                    <button
                      type="button"
                      class="operator-row"
                      [class.selected]="selectedOperatorId() === op.id"
                      [class.disabled]="!op.available && !canOverrideForPriority()"
                      [attr.data-testid]="'op-row-' + op.id"
                      (click)="selectOperator(op)"
                    >
                      <span class="font-medium">{{ op.name }}</span>
                      @if (op.email) {
                        <span class="text-xs text-slate-500">· {{ op.email }}</span>
                      }
                      <span
                        class="ml-auto text-xs px-2 py-0.5 rounded-full"
                        [class.bg-emerald-100]="op.available"
                        [class.text-emerald-700]="op.available"
                        [class.bg-slate-200]="!op.available"
                        [class.text-slate-700]="!op.available"
                        [attr.data-testid]="'op-load-' + op.id"
                      >
                        {{ op.activeClaimCount }} de {{ op.maxActive }}
                      </span>
                    </button>
                  </li>
                }
              </ul>

              @if (overrideMode()) {
                <div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded" data-testid="override-block">
                  <label class="form-label" for="override-reason">Motivo del override (requerido)</label>
                  <textarea
                    id="override-reason"
                    class="form-control"
                    rows="2"
                    placeholder="Ej: emergencia nacional activa, incidente crítico sin cobertura"
                    [ngModel]="overrideReason()"
                    (ngModelChange)="overrideReason.set($event)"
                    data-testid="input-override-reason"
                  ></textarea>
                  <p class="text-xs text-amber-700 mt-1">
                    El operador recibirá el motivo por Telegram.
                  </p>
                </div>
              }
            }
          </div>

          <footer class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="cancel()"
              [disabled]="submitting()"
              data-testid="btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary"
              (click)="submit()"
              [disabled]="!canSubmit() || submitting()"
              data-testid="btn-submit"
            >
              @if (submitting()) {
                Despachando…
              } @else {
                Despachar
              }
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: contents; }
      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(15,23,42,0.55);
        z-index: 1100; display: flex; align-items: center; justify-content: center;
        padding: 1rem; animation: fadeIn 0.15s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .modal-card {
        background: var(--color-bg-secondary, #fff); border-radius: 0.75rem;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25); width: 100%; max-width: 32rem;
        max-height: calc(100vh - 2rem); overflow: auto;
      }
      .modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1.25rem; border-bottom: 1px solid #e2e8f0;
      }
      .modal-title { margin: 0; font-size: 1.125rem; font-weight: 600; color: #1e293b; }
      .modal-close {
        background: transparent; border: 0; width: 2rem; height: 2rem;
        color: #64748b; cursor: pointer; font-size: 1.1rem;
      }
      .modal-body { padding: 1.25rem; }
      .modal-footer {
        display: flex; justify-content: flex-end; gap: 0.5rem;
        padding: 1rem 1.25rem; border-top: 1px solid #e2e8f0;
      }
      .btn {
        padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500;
        border-radius: 0.5rem; cursor: pointer; border: 1px solid transparent;
      }
      .btn-primary { background: #7C3AED; color: #fff; }
      .btn-secondary { background: #fff; color: #334155; border-color: #e2e8f0; }
      .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
      .operator-row {
        width: 100%; display: flex; align-items: center; gap: 0.5rem;
        padding: 0.625rem 0.75rem; border-radius: 0.5rem; cursor: pointer;
        background: #fff; border: 1px solid #e2e8f0; transition: background-color 0.15s;
      }
      .operator-row:hover:not(.disabled) { background: #f8fafc; }
      .operator-row.selected { background: #ede9fe; border-color: #7C3AED; }
      .operator-row.disabled { opacity: 0.6; cursor: not-allowed; }
      .form-label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; }
      .form-control {
        width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem;
        border: 1px solid #cbd5e1; border-radius: 0.5rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignDialogComponent {
  private readonly assignmentsService = inject(AssignmentService);
  private readonly toast = inject(ToastService);

  /** Inputs del componente — el padre los setea antes de abrir. */
  readonly incidentId = input.required<string>();
  readonly incidentPriority = input<'low' | 'medium' | 'high' | 'critical'>('medium');
  /**
   * Si el incidente ya tiene una asignación activa, el submit usa
   * `PATCH /assignments/:id` (reasignar) en vez de `POST /assignments`.
   * Si `null` → asignación nueva.
   */
  readonly existingAssignmentId = input<string | null>(null);

  /** Open/close: el padre controla vía `[open]` (binding one-way). */
  readonly open = input<boolean>(false);

  /**
   * Output: el dialog emite `closed` después de un submit exitoso
   * O un cancel. El padre escucha y setea `open = false` desde fuera.
   * Mantenemos el control del lifecycle en el padre para que el
   * spec del componente pueda testear sin depender de un padre.
   */
  readonly closed = output<void>();

  // ── Estado interno ──
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly availableOperators = signal<AvailableOperatorForIncident[]>([]);
  readonly selectedOperatorId = signal<string | null>(null);
  readonly overrideReason = signal<string>('');

  /**
   * Override mode se activa cuando el operador seleccionado está
   * saturado Y la prioridad es `critical`. Si la prioridad no es
   * critical, no se permite override (el botón del operador saturado
   * está disabled).
   */
  readonly overrideMode = signal(false);

  /** Override permitido por la prioridad del incidente. */
  readonly canOverrideForPriority = computed(
    () => this.incidentPriority() === 'critical',
  );

  /** Operador actualmente seleccionado (objeto completo). */
  readonly selectedOperator = computed(() => {
    const id = this.selectedOperatorId();
    return this.availableOperators().find((op) => op.id === id) ?? null;
  });

  /**
   * `canSubmit` decide si el botón "Despachar" se habilita.
   * Reglas:
   *  - debe haber un operador seleccionado
   *  - si está en override mode, overrideReason.trim() no debe estar vacío
   *  - el operador seleccionado debe estar disponible O el override debe estar activo
   */
  readonly canSubmit = computed(() => {
    const op = this.selectedOperator();
    if (!op) return false;
    if (op.available) return true;
    // saturated
    if (!this.canOverrideForPriority()) return false;
    return this.overrideReason().trim().length > 0;
  });

  constructor() {
    // Cargar la lista cuando el dialog se abre.
    effect(() => {
      if (this.open()) {
        this.loadOperators();
      } else {
        this.resetState();
      }
    });
  }

  /**
   * Carga `GET /incidents/:id/available-operators`. La lista incluye
   * TODOS los operadores (incluso saturados) — el filtrado y override
   * son client-side.
   */
  private loadOperators(): void {
    this.loading.set(true);
    this.assignmentsService
      .getAvailableOperatorsForIncident(this.incidentId())
      .subscribe({
        next: (ops) => {
          this.availableOperators.set(ops);
          this.loading.set(false);
        },
        error: () => {
          this.availableOperators.set([]);
          this.loading.set(false);
        },
      });
  }

  /**
   * Maneja el click en una fila de operador. Habilita override mode
   * cuando hace falta; el `canSubmit` decide si el botón de submit se
   * activa (con o sin override_reason).
   */
  selectOperator(op: AvailableOperatorForIncident): void {
    // Si el operador está saturado y NO se permite override
    // (prioridad ≠ critical), el click no hace nada — el botón
    // está visualmente disabled pero la lógica defensiva lo
    // refuerza.
    if (!op.available && !this.canOverrideForPriority()) {
      return;
    }
    this.selectedOperatorId.set(op.id);
    this.overrideMode.set(!op.available);
    if (op.available) {
      // Reset override reason cuando se vuelve a un operador
      // disponible.
      this.overrideReason.set('');
    }
  }

  /**
   * Submit principal — dispatcha POST o PATCH según haya
   * `existingAssignmentId`. Maneja los 4 errores específicos del
   * backend con toasts dedicados (ver tabla arriba).
   */
  submit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    const op = this.selectedOperator();
    if (!op) return;

    const opts = this.overrideMode()
      ? {
          overrideCap: true as const,
          overrideReason: this.overrideReason().trim(),
        }
      : { overrideCap: undefined, overrideReason: undefined };

    this.submitting.set(true);
    const op$ = this.existingAssignmentId()
      ? this.assignmentsService.reassign(this.existingAssignmentId()!, op.id, opts)
      : this.assignmentsService.assign(this.incidentId(), op.id, opts);

    op$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit();
        this.toast.success('Operador despachado correctamente.');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.handleError(err);
      },
    });
  }

  cancel(): void {
    // Reset explícito: si esperamos al `effect()` que observa
    // `open()`, el reset sólo corre en el próximo `detectChanges`
    // — el caller suele chequear `open()` inmediatamente y vería
    // estado inconsistente. Llamamos `resetState()` directo.
    this.resetState();
    this.closed.emit();
  }

  /** Click fuera del card (en el backdrop) cierra el dialog. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  private handleError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      const backendMessage =
        (err.error as { message?: string } | null)?.message ?? null;
      switch (err.status) {
        case 409:
          // Ya hay asignación activa (caso de reasignación vía
          // PATCH concurrente, o POST a incidente recién tomado).
          this.toast.error(
            backendMessage ?? 'Este incidente ya fue asignado a otro operador.',
            'Conflicto',
          );
          return;
        case 429:
          // Cap reached — el backend devolvió 429 porque no se
          // incluyó override_cap. Si el admin tiene permisos y el
          // incidente es critical, debería re-intentar con override.
          this.toast.error(
            backendMessage ??
              'El operador está en su tope. Si es critical, usá override.',
            'Tope alcanzado',
          );
          return;
        case 422:
          this.toast.error(
            backendMessage ??
              'Datos inválidos (override requiere motivo).',
            'Error',
          );
          return;
        case 403:
          this.toast.error(
            backendMessage ??
              'No tenés permiso para asignar este incidente.',
            'Sin permiso',
          );
          return;
      }
    }
    this.toast.error('No se pudo despachar al operador.', 'Error');
  }

  private resetState(): void {
    this.availableOperators.set([]);
    this.selectedOperatorId.set(null);
    this.overrideMode.set(false);
    this.overrideReason.set('');
    this.submitting.set(false);
  }
}