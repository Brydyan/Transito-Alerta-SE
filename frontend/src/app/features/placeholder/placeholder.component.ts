import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/**
 * F1 (D2) — Placeholder genérico para rutas cuyo componente real aún
 * no existe. Reutiliza `<app-empty-state>` (F0) y muestra la fase a la
 * que está asignada la pantalla. Cada ruta que monta este componente
 * lleva un comentario `// PLACEHOLDER F<n>` en `app.routes.ts` para
 * que sea grep-able y para que la fase siguiente la reemplace sin
 * ambigüedad.
 *
 * Ejemplo:
 *   {
 *     path: 'incidencias',
 *     loadComponent: () => import('./features/placeholder/...')
 *       .then((m) => m.PlaceholderComponent),
 *     data: { breadcrumb: 'Lista de Incidencias' },
 *   }
 *   // en la plantilla de la ruta:
 *   //   <app-placeholder title="Lista de Incidencias" phase="F3" />
 */
@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <app-empty-state
      icon="construction"
      [title]="title()"
      [description]="description()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  /** Título de la sección (visible al usuario). */
  readonly title = input.required<string>();
  /** Fase del roadmap que trae la pantalla real (p. ej. `F2`, `F3`, `F4`). */
  readonly phase = input.required<string>();

  description(): string {
    return `Esta pantalla llega en la fase ${this.phase()} del roadmap.`;
  }
}
