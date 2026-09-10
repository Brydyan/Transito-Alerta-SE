import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * ProfileActionCardsComponent — F6 (`2026-09-08-f6-perfil-redesign`).
 *
 * 3 tarjetas (mock 10-01):
 *  1. **Contraseña** — link a `/app/cambiar-contrasena` (placeholder,
 *     fuera de alcance de esta fase).
 *  2. **Preferencia de Zona** — link a `/app/zonas` (placeholder).
 *  3. **Soporte Técnico** — mailto al Admin Global (decisión del
 *     design: "Contacte con el Administrador Global").
 *
 * Decisiones:
 *  - Sin `*hasPermission` (D7: el panel de perfil es universal
 *    para cualquier usuario autenticado).
 *  - Sin inputs/outputs: las tarjetas son presentacionales. El
 *    padre las monta en la sección inferior de la página.
 *  - Los `href` de "Soporte" es un mailto (no navega dentro
 *    de la SPA). Los de "Contraseña" y "Preferencia" usan
 *    `routerLink` para mantener la navegación SPA.
 */
@Component({
  selector: 'app-profile-action-cards',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  template: `
    <section class="cards-grid" aria-label="Acciones del perfil">
      <article class="action-card">
        <div class="icon-box icon-box--brand" aria-hidden="true">
          <ui-icon name="lock" [size]="22" [strokeWidth]="1.75" />
        </div>
        <h3 class="card-title">Contraseña</h3>
        <p class="card-desc">Actualice su clave de acceso para mayor seguridad.</p>
        <a class="card-link" [routerLink]="['/app/cambiar-contrasena']">
          Configurar seguridad …
        </a>
      </article>
      <article class="action-card">
        <div class="icon-box icon-box--brand" aria-hidden="true">
          <ui-icon name="map-pin" [size]="22" [strokeWidth]="1.75" />
        </div>
        <h3 class="card-title">Preferencia de Zona</h3>
        <p class="card-desc">Configure su cantón de visualización predeterminado.</p>
        <a class="card-link" [routerLink]="['/app/zonas']">Ver zonas …</a>
      </article>
      <article class="action-card">
        <div class="icon-box icon-box--brand" aria-hidden="true">
          <ui-icon name="life-buoy" [size]="22" [strokeWidth]="1.75" />
        </div>
        <h3 class="card-title">Soporte Técnico</h3>
        <p class="card-desc">
          ¿Dudas con su perfil? Contacte con el Administrador Global.
        </p>
        <a class="card-link" href="mailto:admin@jasrapo.com">
          Contactar soporte …
        </a>
      </article>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .action-card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.25rem 1.5rem;
        background: var(--color-bg-secondary, #ffffff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.75rem;
      }
      .icon-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.5rem;
        margin-bottom: 0.25rem;
      }
      .icon-box--brand {
        background: var(--color-brand-primary-soft, #ede9fe);
        color: var(--color-on-tint-violet, #5b21b6);
      }
      .card-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-slate-900, #0f172a);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .card-desc {
        font-size: 0.875rem;
        color: var(--color-slate-500, #64748b);
        margin: 0;
        line-height: 1.4;
      }
      .card-link {
        font-size: 0.8125rem;
        color: var(--color-brand-primary, #6d28d9);
        text-decoration: none;
        font-weight: 500;
        margin-top: 0.25rem;
      }
      .card-link:hover {
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileActionCardsComponent {}
