import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Envoltorio de tabla con encabezado en versalitas espaciadas y atenuadas
 * (F0.4.6). Aporta un conjunto de clases helper que el consumidor aplica
 * a sus celdas para mantener el look del mock 02-01:
 *
 * - `table.ui-table`              — el contenedor; el wrapping de overflow
 * - `ui-table-title`              — celda de título (font-semibold, slate-900)
 * - `ui-table-subtitle`           — subtítulo atenuado debajo del título
 * - `ui-table-cell-select`        — celda de checkbox (ancho fijo, centrada)
 * - `ui-table-cell-actions`       — celda de acciones (alineada a la derecha)
 * - `ui-table-row-selected`       — fila con fondo violeta suave (item activo)
 *
 * @example
 *   <ui-table>
 *     <thead>
 *       <tr>
 *         <th class="ui-table-cell-select"><input type="checkbox" /></th>
 *         <th>Incidencia</th>
 *         <th>Estado</th>
 *         <th class="ui-table-cell-actions">Acciones</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       @for (row of rows; track row.id) {
 *         <tr [class.ui-table-row-selected]="row.id === selectedId">
 *           <td class="ui-table-cell-select"><input type="checkbox" /></td>
 *           <td>
 *             <div class="ui-table-title">{{ row.title }}</div>
 *             <div class="ui-table-subtitle">{{ row.address }}</div>
 *           </td>
 *           <td><ui-badge [variant]="row.status" /></td>
 *           <td class="ui-table-cell-actions">
 *             <button uiButton variant="ghost">…</button>
 *           </td>
 *         </tr>
 *       }
 *     </tbody>
 *   </ui-table>
 */
@Component({
  selector: 'ui-table',
  standalone: true,
  template: `
    <div class="ui-table-wrapper w-full overflow-x-auto">
      <table class="ui-table w-full border-separate border-spacing-0">
        @if (caption()) {
          <caption class="caption-top text-left text-sm text-slate-500 pb-2">
            {{ caption() }}
          </caption>
        }
        <ng-content />
      </table>
    </div>
  `,
  styles: [
    `
      .ui-table th {
        background-color: var(--color-bg-primary);
        color: #475569;
        border-bottom: 2px solid var(--color-border-subtle);
        padding: 0.875rem 1.25rem;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: left;
        vertical-align: middle;
      }
      .ui-table td {
        padding: 0.875rem 1.25rem;
        border-bottom: 1px solid var(--color-border-subtle);
        vertical-align: middle;
        color: #1f2937;
        font-size: 0.9rem;
        background-color: var(--color-bg-secondary);
      }
      .ui-table tbody tr {
        transition: background-color 0.15s ease-in-out;
      }
      .ui-table tbody tr:hover td {
        background-color: var(--color-bg-primary);
      }
      .ui-table tbody tr:last-child td {
        border-bottom: 0;
      }
      /* Helpers */
      .ui-table .ui-table-title {
        font-weight: 600;
        color: #0f172a;
      }
      .ui-table .ui-table-subtitle {
        font-size: 0.8rem;
        color: #64748b;
        margin-top: 0.125rem;
      }
      .ui-table .ui-table-cell-select {
        width: 2.5rem;
        text-align: center;
        padding-left: 1rem;
        padding-right: 0.5rem;
      }
      .ui-table .ui-table-cell-actions {
        text-align: right;
        white-space: nowrap;
      }
      .ui-table .ui-table-cell-actions > * + * {
        margin-left: 0.25rem;
      }
      .ui-table .ui-table-row-selected td {
        background-color: var(--color-brand-primary-soft);
      }
      .ui-table .ui-table-row-selected:hover td {
        background-color: var(--color-brand-primary-soft);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTableComponent {
  readonly caption = input<string>('');
}
