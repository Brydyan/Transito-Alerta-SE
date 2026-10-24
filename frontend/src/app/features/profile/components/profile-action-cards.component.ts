import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { UserService } from '../../../core/services/user.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * ProfileActionCardsComponent — F6 (`2026-09-08-f6-perfil-redesign`).
 *
 * 4 tarjetas (D4, 2026-10-11 user-form-departments-telegram-hybrid):
 *  1. **Contraseña** — link a `/app/cambiar-contrasena` (placeholder).
 *  2. **Preferencia de Zona** — link a `/app/zonas` (placeholder).
 *  3. **Soporte Técnico** — mailto al Admin Global.
 *  4. **Notificaciones Telegram** — self-service de vinculación de bot.
 *
 * Decisiones:
 *  - D4: la 4ta tarjeta lee `UserService.getCurrentUser()` para
 *    verificar `telegram_chat_id`. Si existe, muestra badge "Vinculado"
 *    y botón "Re-vincular". Si no, muestra "No configurado" y "Vincular".
 *  - El click llama a `generateTelegramLink()` y abre la URL en nueva
 *    pestaña (`window.open(link, '_blank')`).
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
      <article class="action-card">
        <div class="icon-box icon-box--brand" aria-hidden="true">
          <ui-icon name="send" [size]="22" [strokeWidth]="1.75" />
        </div>
        <h3 class="card-title">Notificaciones Telegram</h3>
        <p class="card-desc">Reciba alertas de emergencia directamente en Telegram.</p>
        <div class="card-telegram">
          @if (currentUser()?.telegram_chat_id) {
            <span
              class="card-badge card-badge--linked"
              data-testid="telegram-status"
              aria-label="Estado de vinculación Telegram"
            >
              Vinculado
            </span>
          } @else {
            <span
              class="card-badge card-badge--unlinked"
              data-testid="telegram-status"
              aria-label="Estado de vinculación Telegram"
            >
              No configurado
            </span>
          }
          <button
            type="button"
            class="card-link"
            data-testid="telegram-link-btn"
            [disabled]="isLinking()"
            (click)="onLinkTelegram()"
          >
            @if (isLinking()) {
              Generando enlace…
            } @else if (currentUser()?.telegram_chat_id) {
              Re-vincular
            } @else {
              Vincular bot de Telegram
            }
          </button>
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
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
      }
      .card-link:hover {
        text-decoration: underline;
      }
      .card-link:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .card-telegram {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-top: 0.25rem;
      }
      .card-badge {
        display: inline-block;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
      }
      .card-badge--linked {
        background: var(--color-success-soft, #dcfce7);
        color: var(--color-success-fg, #15803d);
      }
      .card-badge--unlinked {
        background: var(--color-slate-100, #f1f5f9);
        color: var(--color-slate-500, #64748b);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileActionCardsComponent {
  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUser = toSignal(
    this.userService.getCurrentUser().pipe(catchError(() => of(null))),
  );
  readonly isLinking = signal(false);

  onLinkTelegram(): void {
    if (this.isLinking()) return;
    this.isLinking.set(true);
    this.userService
      .generateTelegramLink()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ telegram_link }) => {
          this.isLinking.set(false);
          if (telegram_link) {
            window.open(telegram_link, '_blank');
          } else {
            this.toastService.warning(
              'El bot de Telegram no está configurado en este servidor.',
              'Sin enlace',
            );
          }
        },
        error: () => {
          this.isLinking.set(false);
          this.toastService.error(
            'No se pudo generar el enlace de Telegram. Intenta nuevamente.',
            'Error',
          );
        },
      });
  }
}
