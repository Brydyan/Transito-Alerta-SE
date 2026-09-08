import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';
import { RoleStats } from '../models/role-permission.interface';

/**
 * StatsCardsComponent — F6 (`2026-09-08-f6-roles-redesign`).
 *
 * Tres tarjetas con métricas agregadas: Total Permisos, Módulos
 * Protegidos, Usuarios Asignados (mock 04-01). Replica la sección
 * `.info-cards-grid` de Users pero con números y descripciones de
 * tamaño 2xl.
 *
 * Sin `*hasPermission` (D7 del design — el panel de stats es
 * universal para admins; mostrarlo como gated sería peor que
 * mostrarlo siempre).
 *
 * Decisión de diseño: los datos son `input.required<RoleStats>()`;
 * si la pantalla quiere pasar un valor parcial, usa el setter
 * `set` o computa un fallback. La spec del change lo entrega
 * desde `RolesService.getRoleStats()`.
 */
@Component({
  selector: 'app-stats-cards',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <section class="stats-grid" aria-label="Métricas agregadas de roles">
      <article class="stat-card stat-card--permissions">
        <div class="stat-icon" aria-hidden="true">
          <ui-icon name="key" [size]="22" [strokeWidth]="1.75" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats().totalPermissions }}</div>
          <div class="stat-label">Total Permisos</div>
        </div>
      </article>
      <article class="stat-card stat-card--modules">
        <div class="stat-icon" aria-hidden="true">
          <ui-icon name="lock" [size]="22" [strokeWidth]="1.75" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats().protectedModules }}</div>
          <div class="stat-label">Módulos Protegidos</div>
        </div>
      </article>
      <article class="stat-card stat-card--users">
        <div class="stat-icon" aria-hidden="true">
          <ui-icon name="users" [size]="22" [strokeWidth]="1.75" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats().assignedUsers }}</div>
          <div class="stat-label">Usuarios Asignados</div>
        </div>
      </article>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .stat-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem 1.5rem;
        background: var(--color-bg-secondary, #ffffff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.75rem;
      }
      .stat-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.5rem;
        flex-shrink: 0;
      }
      .stat-card--permissions .stat-icon {
        background: var(--color-brand-primary-soft, #ede9fe);
        color: var(--color-on-tint-violet, #5b21b6);
      }
      .stat-card--modules .stat-icon {
        background: var(--color-bg-primary, #f1f5f9);
        color: var(--color-slate-600, #475569);
      }
      .stat-card--users .stat-icon {
        background: var(--color-brand-primary-soft, #ede9fe);
        color: var(--color-on-tint-violet, #5b21b6);
      }
      .stat-body {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
      }
      .stat-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--color-slate-900, #0f172a);
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .stat-label {
        font-size: 0.875rem;
        color: var(--color-slate-500, #64748b);
        font-weight: 500;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsCardsComponent {
  readonly stats = input.required<RoleStats>();
}
