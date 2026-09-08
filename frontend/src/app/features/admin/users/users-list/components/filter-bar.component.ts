import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { UiIconComponent } from '../../../../../shared/components/ui-icon/ui-icon.component';
import { Organization, Role } from '../../models/user.interface';

/**
 * FilterBar con dos dropdowns (rol, organización) y reset — F6.
 *
 * Los `select` se controlan con `[(ngModel)]` y se emite
 * `filterChange` con un objeto combinado cuando alguno
 * cambia. El padre decide qué hacer con el filtro (en este
 * caso: la búsqueda es local, los filtros son backend).
 *
 * La opción «Todos» es un valor vacío (`''`) en lugar de un
 * sentinel — más simple para el backend y la UI, y alinea con
 * cómo el design describe los defaults del mock.
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, UiIconComponent],
  template: `
    <div class="filter-bar">
      <label class="field">
        <span class="label">Rol</span>
        <select
          class="select"
          [ngModel]="roleControl()"
          (ngModelChange)="onRoleChange($event)"
          aria-label="Filtrar por rol"
        >
          <option value="">Todos los roles</option>
          @for (role of roles(); track role.rolId) {
            <option [value]="role.rolId">{{ role.nombre }}</option>
          }
        </select>
      </label>
      <label class="field">
        <span class="label">Organización</span>
        <select
          class="select"
          [ngModel]="orgControl()"
          (ngModelChange)="onOrgChange($event)"
          aria-label="Filtrar por organización"
        >
          <option value="">Todas las organizaciones</option>
          @for (org of organizations(); track org.id) {
            <option [value]="org.id">{{ org.nombre }}</option>
          }
        </select>
      </label>
      @if (roleControl() || orgControl()) {
        <button
          type="button"
          class="reset-btn"
          (click)="reset()"
          aria-label="Limpiar filtros"
        >
          <ui-icon name="x" [size]="14" [strokeWidth]="2" />
          Limpiar
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .filter-bar {
        display: flex;
        gap: 0.75rem;
        align-items: end;
        flex-wrap: wrap;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 12rem;
      }
      .label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-slate-500, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .select {
        padding: 0.5rem 0.75rem;
        background: var(--color-bg-secondary, #fff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        font-size: 0.875rem;
        color: var(--color-slate-900, #0f172a);
      }
      .select:focus {
        outline: none;
        border-color: var(--color-brand-primary, #6d28d9);
        box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.12);
      }
      .reset-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem 0.75rem;
        color: var(--color-brand-primary, #6d28d9);
        background: transparent;
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        height: 2.25rem;
      }
      .reset-btn:hover {
        background: var(--color-bg-primary, #f1f5f9);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent {
  readonly roles = input.required<ReadonlyArray<Role>>();
  readonly organizations = input.required<ReadonlyArray<Organization>>();

  /** Outputs hacia el padre — string vacío = sin filtro. */
  readonly filterChange = output<{ role: string; org: string }>();

  protected readonly roleControl = input<string>('');
  protected readonly orgControl = input<string>('');

  onRoleChange(value: string): void {
    this.filterChange.emit({ role: value, org: this.orgControl() });
  }
  onOrgChange(value: string): void {
    this.filterChange.emit({ role: this.roleControl(), org: value });
  }
  reset(): void {
    this.filterChange.emit({ role: '', org: '' });
  }
}
