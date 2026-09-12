import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * ViewActionBtn — acción de fila simplificada (solo «ver»).
 *
 * Complemento minimalista de `ActionMenuComponent` (F6): mientras el
 * menú de F6 expone siempre Ver + Editar + Eliminar, este botón
 * muestra únicamente el ojo (`eye`) para listados cuya única acción
 * de fila es abrir el detalle (diseño F3/F4 — tabla de incidencias).
 *
 * - `ariaLabel` describible por el consumidor («Ver detalle de X»).
 * - `view` emite sin payload: el consumidor ya conoce la fila en el
 *   contexto del `@for` y no necesita un id opaco.
 * - `stopPropagation` para convivir con filas clickeables (`(click)`
 *   en `<tr>` o en la celda) sin disparar la navegación dos veces.
 */
@Component({
  selector: 'app-view-action-btn',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <button
      type="button"
      class="icon-btn"
      [attr.aria-label]="ariaLabel()"
      title="Ver detalle"
      (click)="onView($event)"
    >
      <ui-icon name="eye" [size]="18" [strokeWidth]="2" />
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewActionBtnComponent {
  readonly ariaLabel = input('Ver detalle');

  readonly view = output<void>();

  onView(event: MouseEvent): void {
    event.stopPropagation();
    this.view.emit();
  }
}