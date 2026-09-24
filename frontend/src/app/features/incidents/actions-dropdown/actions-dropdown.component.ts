import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * ActionsDropdownComponent — Phase 4 of incidents-assignment feature.
 *
 * Three-dot row action menu for the incident-list table. Design decision D2:
 * inline buttons would crowd the table columns — a dropdown keeps the table
 * clean and consistent with the admin/users pattern.
 *
 * Actions:
 *   - "Ver"         — navigate to incident detail
 *   - "Asignar"     — open assignment modal (only when hasAssignPermission)
 *   - "Seguimiento" — open tracking panel
 *   - "Eliminar"    — placeholder (deferred)
 *
 * RBAC: "Asignar" is shown only when the parent provides `hasAssignPermission=true`.
 * The backend still enforces the permission; this is a UI convenience guard.
 *
 * Interaction: click outside closes the dropdown (HostListener on document click).
 */
@Component({
  selector: 'app-actions-dropdown',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dropdown-wrapper">
      <!-- Three-dot trigger -->
      <button
        type="button"
        class="dropdown-trigger"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="menu"
        [attr.aria-label]="'Acciones para incidencia'"
        data-testid="actions-trigger"
        (click)="toggle(); $event.stopPropagation()"
      >
        <ui-icon name="more-vertical" [size]="16" [strokeWidth]="2" />
      </button>

      <!-- Dropdown menu -->
      @if (isOpen()) {
        <ul
          class="dropdown-menu"
          role="menu"
          (click)="$event.stopPropagation()"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="dropdown-item"
              data-testid="action-ver"
              (click)="onView()"
            >
              <ui-icon name="eye" [size]="14" />
              Ver
            </button>
          </li>

          @if (hasAssignPermission) {
            <li role="none">
              <button
                type="button"
                role="menuitem"
                class="dropdown-item"
                data-testid="action-asignar"
                (click)="onAssign()"
              >
                <ui-icon name="user-plus" [size]="14" />
                Asignar
              </button>
            </li>
          }

          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="dropdown-item"
              data-testid="action-seguimiento"
              (click)="onTracking()"
            >
              <ui-icon name="activity" [size]="14" />
              Seguimiento
            </button>
          </li>

          <li role="none" class="dropdown-divider" aria-hidden="true"></li>

          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="dropdown-item dropdown-item--danger"
              data-testid="action-eliminar"
              (click)="onDelete()"
              disabled
              title="Funcionalidad próximamente disponible"
            >
              <ui-icon name="trash-2" [size]="14" />
              Eliminar
            </button>
          </li>
        </ul>
      }
    </div>
  `,
  styles: [
    `
      :host { display: contents; }

      .dropdown-wrapper {
        position: relative;
        display: inline-block;
      }

      .dropdown-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 0.375rem;
        cursor: pointer;
        color: var(--color-slate-500, #64748b);
        transition: background 0.1s, border-color 0.1s;
      }
      .dropdown-trigger:hover,
      .dropdown-trigger[aria-expanded="true"] {
        background: var(--color-bg-primary, #f1f5f9);
        border-color: var(--color-border-subtle, #e2e8f0);
        color: var(--color-slate-700, #334155);
      }

      .dropdown-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 0.25rem);
        z-index: 200;
        background: var(--color-bg-secondary, #fff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
        min-width: 10rem;
        list-style: none;
        margin: 0;
        padding: 0.25rem;
        animation: menuIn 0.1s ease;
      }
      @keyframes menuIn {
        from { opacity: 0; transform: translateY(-0.25rem); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--color-slate-700, #334155);
        background: transparent;
        border: 0;
        border-radius: 0.375rem;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        transition: background 0.1s;
      }
      .dropdown-item:hover:not(:disabled) {
        background: var(--color-bg-primary, #f1f5f9);
      }
      .dropdown-item:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .dropdown-item--danger { color: var(--color-red-600, #dc2626); }
      .dropdown-item--danger:hover:not(:disabled) {
        background: var(--color-red-50, #fef2f2);
      }

      .dropdown-divider {
        height: 1px;
        background: var(--color-border-subtle, #e2e8f0);
        margin: 0.25rem 0;
      }
    `,
  ],
})
export class ActionsDropdownComponent {
  /** ID of the incident this dropdown belongs to. */
  @Input() incidentId = '';

  /**
   * Whether the current user has the ASSIGN permission.
   * Controls visibility of the "Asignar" menu item.
   */
  @Input() hasAssignPermission = false;

  // ── Events ──────────────────────────────────────────────────────────
  @Output() readonly view = new EventEmitter<string>();
  @Output() readonly assign = new EventEmitter<string>();
  @Output() readonly tracking = new EventEmitter<string>();
  @Output() readonly delete = new EventEmitter<string>();

  // ── State ────────────────────────────────────────────────────────────
  readonly isOpen = signal<boolean>(false);

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  onView(): void {
    this.close();
    this.view.emit(this.incidentId);
  }

  onAssign(): void {
    this.close();
    this.assign.emit(this.incidentId);
  }

  onTracking(): void {
    this.close();
    this.tracking.emit(this.incidentId);
  }

  onDelete(): void {
    this.close();
    this.delete.emit(this.incidentId);
  }

  /**
   * Close on any document click that is not inside this host.
   * HostListener on document:click prevents the dropdown from
   * staying open when the user clicks elsewhere on the page.
   */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.isOpen()) {
      this.close();
    }
  }
}
