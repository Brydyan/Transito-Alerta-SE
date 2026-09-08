import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  HostListener,
} from '@angular/core';

import { UiIconComponent } from '../../../../../shared/components/ui-icon/ui-icon.component';

/**
 * ActionMenu — F6 (`2026-09-08-f6-usuarios-redesign`).
 *
 * Dos acciones por fila:
 *  - `eye` (ver detalle) — siempre visible
 *  - `three-dot` (menú: editar, eliminar) — sólo cuando el menú
 *    está abierto
 *
 * El menú se cierra al hacer click fuera (HostListener sobre
 * `document:click` con `contains(target)` para distinguir
 * «fuera del menú» de «dentro del trigger»). La razón de
 * dejarlo acá y no en el contenedor es que la lógica es del
 * control, no de la pantalla.
 *
 * D7: NO `*hasPermission`. El botón se muestra para todos y el
 * backend rechaza con 403 — el toast lo explica (F6 design
 * «operador_org ve botones pero obtiene 403 on click»).
 */
@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <div class="actions">
      <button
        type="button"
        class="icon-btn"
        [attr.aria-label]="'Ver usuario ' + userId()"
        (click)="onView($event)"
      >
        <ui-icon name="eye" [size]="18" [strokeWidth]="2" />
      </button>
      <button
        type="button"
        class="icon-btn"
        [attr.aria-label]="'Más acciones para usuario ' + userId()"
        [attr.aria-expanded]="open()"
        (click)="toggle($event)"
      >
        <ui-icon name="more-vertical" [size]="18" [strokeWidth]="2" />
      </button>
      @if (open()) {
        <ul class="menu" role="menu" (click)="$event.stopPropagation()">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="menu-item"
              (click)="onEdit()"
            >
              <ui-icon name="edit-2" [size]="16" [strokeWidth]="2" />
              Editar
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="menu-item menu-item-danger"
              (click)="onDelete()"
            >
              <ui-icon name="trash-2" [size]="16" [strokeWidth]="2" />
              Eliminar
            </button>
          </li>
        </ul>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
        position: relative;
      }
      .actions {
        display: inline-flex;
        gap: 0.25rem;
        position: relative;
      }
      .icon-btn {
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
        transition: background-color 0.15s ease;
      }
      .icon-btn:hover {
        background: var(--color-bg-primary, #f1f5f9);
        color: var(--color-slate-700, #334155);
      }
      .menu {
        position: absolute;
        top: calc(100% + 0.25rem);
        right: 0;
        z-index: 20;
        min-width: 9rem;
        background: var(--color-bg-secondary, #fff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
        list-style: none;
        margin: 0;
        padding: 0.25rem;
      }
      .menu-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        background: transparent;
        border: 0;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        color: var(--color-slate-700, #334155);
        text-align: left;
        cursor: pointer;
      }
      .menu-item:hover {
        background: var(--color-bg-primary, #f1f5f9);
      }
      .menu-item-danger {
        color: var(--color-prio-critical, #b91c1c);
      }
      .menu-item-danger:hover {
        background: var(--color-status-pendiente, #fef3c7);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionMenuComponent {
  readonly userId = input.required<string | number>();

  readonly view = output<string | number>();
  readonly edit = output<string | number>();
  readonly delete = output<string | number>();

  protected readonly open = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly _hasMenu = computed(() => this.open());

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update((v) => !v);
  }

  onView(event: MouseEvent): void {
    event.stopPropagation();
    this.open.set(false);
    this.view.emit(this.userId());
  }

  onEdit(): void {
    this.open.set(false);
    this.edit.emit(this.userId());
  }

  onDelete(): void {
    this.open.set(false);
    this.delete.emit(this.userId());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.open.set(false);
  }
}
