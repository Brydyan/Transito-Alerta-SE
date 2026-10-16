import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserDetailModalService } from './user-detail-modal.service';
import { UsersService } from '../services/users.service';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';
import { User, toUserStatus } from '../models/user.interface';

/**
 * UserDetailModalComponent — F6 (`2026-09-08-f6-usuarios-redesign`).
 *
 * Modal read-only que muestra los datos completos de un user.
 * Se abre desde el ojo en cada fila de la tabla
 * (`/app/admin/users`); NO es para editar — para editar existe
 * la ruta `/app/admin/users/:id/edit` que monta el `UserFormComponent`.
 *
 * Datos que muestra (espejo de las columnas de la tabla + extras):
 *   - Avatar (iniciales si no hay url)
 *   - Email, teléfono
 *   - Nombres + apellidos
 *   - Rol (resuelto vía `getOrganizationName`/`getRoleName` —
 *     hoy leemos directo del objeto `user.rol` y `user.organizationId`)
 *   - Organización (id visible; nombre se podría resolver contra
 *     el signal `organizations` del `users-list` si el padre lo pasa)
 *   - Estado (Activo/Inactivo vía `toUserStatus`)
 *
 * Patrón estructural espejo del `ConfirmDialogComponent`
 * (`shared/components/confirm-dialog/confirm-dialog.component.ts`):
 *   - Lee `activeUser()` del service (signal global).
 *   - Si es `null`, retorna fragment vacío (`@if` en el template).
 *   - Backdrop click cierra; ESC cierra; botón X cierra.
 *
 * D7: NO `*hasPermission` para mostrar/ocultar. Master y
 * agent_system ven a todos; operator_org ve a los de su
 * org (regla del backend `assertVisible` aplicada en el GET
 * `/api/users`). El modal respeta la lista que ya pasó la
 * visibilidad del backend.
 */
@Component({
  selector: 'app-user-detail-modal',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (activeUser(); as user) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Detalle del usuario ' + user.nombres + ' ' + user.apellidos"
        (click)="onBackdropClick($event)"
      >
        <div class="modal-card" (click)="$event.stopPropagation()">
          <header class="modal-header">
            <h2 class="modal-title">Detalle del usuario</h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Cerrar"
              (click)="service.close()"
            >
              <ui-icon name="x" [size]="18" [strokeWidth]="2" />
            </button>
          </header>

          <div class="modal-body">
            <div class="detail-grid">
              <div class="detail-item detail-item--full">
                <span class="detail-label">Nombre completo</span>
                <span class="detail-value detail-value--name">
                  {{ user.nombres }} {{ user.apellidos }}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label">Correo</span>
                <span class="detail-value">{{ user.email || '—' }}</span>
              </div>

              <div class="detail-item">
                <span class="detail-label">Teléfono</span>
                <span class="detail-value">{{ user.telefono || '—' }}</span>
              </div>

              <div class="detail-item">
                <span class="detail-label">Rol</span>
                <span class="detail-value">
                  {{ user.rol?.nombre || '— sin rol —' }}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label">Organización</span>
                <span class="detail-value">
                  {{ orgName() || '— sin organización —' }}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label">Estado</span>
                <span class="detail-value">
                  <span
                    class="status-pill"
                    [class.status-pill--active]="statusOf(user) === 'activo'"
                    [class.status-pill--inactive]="statusOf(user) === 'inactivo'"
                  >
                    {{ statusOf(user) === 'activo' ? 'Activo' : 'Inactivo' }}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <footer class="modal-footer modal-footer--split">
            <!-- Telegram link — sólo roles staff (master/admin_org/operator_org).
                 Reporteros no usan el bot interno, así que ocultamos la sección. -->
            @if (activeUser()?.rol?.nombre !== 'reporter') {
              <div class="telegram-link-section">
                @if (telegramLinkResult() !== undefined) {
                  @if (telegramLinkResult(); as link) {
                    <div class="telegram-link-result">
                      <span class="telegram-link-label">Enlace Telegram:</span>
                      <a
                        [href]="link"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="telegram-link-url"
                      >
                        {{ link }}
                      </a>
                    </div>
                  } @else {
                    <span class="telegram-link-empty">Bot de Telegram no configurado.</span>
                  }
                }
                <button
                  type="button"
                  class="btn btn--secondary"
                  [disabled]="generatingLink()"
                  (click)="generateTelegramLink()"
                >
                  {{ generatingLink() ? 'Generando…' : 'Regenerar enlace Telegram' }}
                </button>
              </div>
            }
            <button
              type="button"
              class="btn btn--secondary"
              (click)="service.close()"
            >
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: contents; }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: fadeIn 0.15s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .modal-card {
        background: var(--color-bg-secondary, #fff);
        border-radius: 0.75rem;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
        width: 100%;
        max-width: 36rem;
        max-height: calc(100vh - 2rem);
        overflow: auto;
        animation: slideUp 0.2s ease;
      }
      @keyframes slideUp {
        from { transform: translateY(0.5rem); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border-subtle, #e2e8f0);
      }
      .modal-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-slate-800, #1e293b);
      }
      .modal-close {
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
      }
      .modal-close:hover {
        background: var(--color-bg-primary, #f1f5f9);
        color: var(--color-slate-700, #334155);
      }

      .modal-body {
        padding: 1.25rem;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem 1.25rem;
      }
      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
      }
      .detail-item--full {
        grid-column: 1 / -1;
      }
      .detail-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-slate-500, #64748b);
      }
      .detail-value {
        font-size: 0.9375rem;
        color: var(--color-slate-800, #1e293b);
        word-break: break-word;
      }
      .detail-value--name {
        font-size: 1.0625rem;
        font-weight: 600;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.125rem 0.625rem;
        font-size: 0.8125rem;
        font-weight: 500;
        border-radius: 9999px;
      }
      .status-pill--active {
        background: var(--color-success-50, #ecfdf5);
        color: var(--color-success-700, #047857);
      }
      .status-pill--inactive {
        background: var(--color-slate-100, #f1f5f9);
        color: var(--color-slate-700, #334155);
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 1rem 1.25rem;
        border-top: 1px solid var(--color-border-subtle, #e2e8f0);
      }
      .modal-footer--split {
        justify-content: space-between;
      }
      .telegram-link-section {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.375rem;
        min-width: 0;
      }
      .telegram-link-result {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        max-width: 100%;
        font-size: 0.8125rem;
      }
      .telegram-link-label {
        font-weight: 600;
        color: var(--color-slate-500, #64748b);
      }
      .telegram-link-url {
        color: var(--color-primary-600, #2563eb);
        text-decoration: none;
        word-break: break-all;
      }
      .telegram-link-url:hover {
        text-decoration: underline;
      }
      .telegram-link-empty {
        font-size: 0.8125rem;
        color: var(--color-slate-500, #64748b);
        font-style: italic;
      }
      .btn {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 0.5rem;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .btn--secondary {
        background: var(--color-bg-secondary, #fff);
        color: var(--color-slate-700, #334155);
        border-color: var(--color-border-subtle, #e2e8f0);
      }
      .btn--secondary:hover {
        background: var(--color-bg-primary, #f1f5f9);
      }
      .btn--secondary[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
})
export class UserDetailModalComponent {
  protected readonly service = inject(UserDetailModalService);
  private readonly usersAdminService = inject(UsersService);

  /** Signal del service — `null` = modal cerrado. */
  protected readonly activeUser = this.service.activeUser;

  /** Estado actual derivado para el badge. */
  protected readonly statusOf = (u: User): 'activo' | 'inactivo' => toUserStatus(u.isActive);

  /**
   * Nombre de la organización resuelto desde el `organizationId`
   * vía el mapa `orgsById` que el padre pasa al `open()`. Si la
   * org no está en el mapa (caso borde: user con org_id que
   * ya no existe), caemos al id crudo como fallback visible.
   */
  protected readonly orgName = computed<string>(() => {
    const u = this.activeUser();
    if (!u || !u.organizationId) return '';
    return this.service.orgsById().get(u.organizationId) ?? u.organizationId;
  });

  /**
   * Resultado del último `regenerateTelegramLink` para el user actual.
   *   - `undefined` → aún no se pidió un enlace (estado inicial).
   *   - `string`    → deep-link generado (mostrar como link).
   *   - `null`      → bot no configurado (`TELEGRAM_BOT_USERNAME`
   *                    unset) — frontend muestra "Bot no configurado".
   *
   * Se resetea a `undefined` cada vez que cambia el `activeUser()`,
   * así no se filtra el link de un user anterior a otro nuevo.
   */
  protected readonly telegramLinkResult = signal<string | null | undefined>(undefined);

  /** `true` mientras la request al backend está en vuelo. */
  protected readonly generatingLink = signal(false);

  /**
   * Cierra al click en el backdrop (no en la card). El stopPropagation
   * del template evita que clicks dentro cierren.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.service.close();
    }
  }

  /**
   * Pide al backend un deep-link nuevo para el `activeUser()`. No-op
   * si el modal no está abierto (defensivo). Reseteamos el resultado
   * previo al iniciar para que la UI no muestre un link "stale"
   * mientras corre la nueva request.
   *
   * El backend (`UsersService.adminGenerateTelegramLink`) valida:
   *   - target existe → 404 si no.
   *   - actor outranka target (`assertCanManage`) → 403 si no.
   *   - target no es `reporter` → 403 (no usan el bot interno).
   * Devuelve `{ telegram_link: string | null }`; `null` significa
   * "bot no configurado" y el template lo renderiza como texto muted.
   */
  generateTelegramLink(): void {
    const user = this.activeUser();
    if (!user) return;
    this.generatingLink.set(true);
    this.telegramLinkResult.set(undefined);
    this.usersAdminService.regenerateTelegramLink(user.usuarioId).subscribe({
      next: (res) => {
        this.telegramLinkResult.set(res.telegram_link);
        this.generatingLink.set(false);
      },
      error: () => {
        this.generatingLink.set(false);
      },
    });
  }
}
