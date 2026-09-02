import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Encabezado de página — F0.4.4.
 *
 * Kicker en versalitas atenuadas (p. ej. "GESTIÓN / LISTADO") + título
 * grande (p. ej. "Incidencias"). Slot a la derecha para acciones.
 *
 * Patrón mock 02-01: `GESTIÓN / LISTADO` sobre `Incidencias`.
 *
 * @example
 *   <ui-page-header kicker="GESTIÓN / LISTADO" title="Incidencias">
 *     <button page-header-actions uiButton>Filtros</button>
 *     <button page-header-actions uiButton variant="primary">Crear</button>
 *   </ui-page-header>
 */
@Component({
  selector: 'ui-page-header',
  standalone: true,
  template: `
    <div
      class="ui-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6"
    >
      <div class="min-w-0">
        @if (kicker()) {
          <p
            class="text-[0.7rem] font-semibold tracking-[0.12em] uppercase text-slate-500"
          >
            {{ kicker() }}
          </p>
        }
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mt-1">
          {{ title() }}
        </h1>
        @if (subtitle()) {
          <p class="text-sm text-slate-500 mt-1">{{ subtitle() }}</p>
        }
      </div>
      @if (showActions()) {
        <div class="flex items-center gap-2 shrink-0">
          <ng-content select="[page-header-actions]" />
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPageHeaderComponent {
  readonly kicker = input<string>('');
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly showActions = input<boolean>(true);
}
