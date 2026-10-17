import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  NotificationService,
  AppNotification,
} from '../../../core/services/notification.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * 2026-10-17-header-notification-dropdown — bell dropdown del top
 * bar. Reemplaza el botón estático (con punto rojo hardcodeado) por
 * un dropdown funcional con badge, lista, navegación al click y
 * "Marcar todo como leído".
 *
 * Comportamiento end-to-end:
 *   - Al init: carga `unreadCount` vía `getUnreadCount()`. Si falla,
 *     badge queda en 0 (no rompe el shell).
 *   - Al toggle: lazy load de la lista (20 items) vía
 *     `getNotifications(20)`. Reapertura no recarga (cache en señal).
 *   - Realtime: cada `notification` del socket incrementa el badge
 *     y, si el dropdown está abierto, prependea la nueva a la lista.
 *   - Click en item → `markAsRead(id)` + navega a
 *     `/app/incidencias/:incidentId` + cierra el dropdown.
 *   - Marcar todo → `markAllAsRead()` + badge = 0 + marca todas las
 *     locales como `read`.
 *
 * Format por tipo:
 *   - `incident.created` + priority=critical → 🔴 Incidencia crítica
 *   - `incident.status_changed` + status=en_sitio → 📍 Operador en sitio
 *   - `incident.status_changed` (otros) → 🔄 Estado actualizado
 *   - `incident.assigned` → 📋 Asignación
 *   - `incident_pending_approval` → ⏳ Pendiente de aprobación
 *   - cualquier otro → 🔔 + label con el `type` crudo
 */
@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterModule, UiIconComponent],
  template: `
    <div class="relative">
      <button
        type="button"
        class="btn-icon p-1 text-slate-500 bg-transparent border-none relative"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        aria-label="Notificaciones"
        data-testid="bell-button"
      >
        <ui-icon name="bell" [size]="20" />
        @if (unreadCount() > 0) {
          <span
            class="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-prio-high border-2 border-white rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            data-testid="unread-badge"
          >
            {{ unreadCount() > 99 ? '99+' : unreadCount() }}
          </span>
        }
      </button>

      @if (open()) {
        <div
          class="absolute right-0 mt-2 w-80 max-h-[480px] overflow-auto bg-white border border-border-subtle rounded-lg shadow-lg z-[1000]"
          data-testid="dropdown-panel"
        >
          <header class="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 class="font-semibold text-slate-800 text-sm">Notificaciones</h3>
            <button
              type="button"
              class="text-xs text-brand-primary hover:underline"
              (click)="onMarkAllAsRead()"
              data-testid="btn-mark-all-read"
            >
              Marcar todo como leído
            </button>
          </header>

          @if (notificationsList().length === 0) {
            <p class="px-4 py-6 text-sm text-slate-500 text-center" data-testid="empty-state">
              No tenés notificaciones.
            </p>
          } @else {
            <ul class="divide-y divide-border-subtle">
              @for (n of notificationsList(); track n.id) {
                <li
                  (click)="onNotificationClick(n)"
                  class="px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50"
                  [class.bg-blue-50]="!n.read"
                  [attr.data-testid]="'notification-' + n.id"
                >
                  <div class="flex items-start gap-2">
                    <span class="text-base leading-none mt-0.5" aria-hidden="true">
                      {{ formatFor(n).icon }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-slate-800 truncate">
                        {{ formatFor(n).label }}
                      </p>
                      <p class="text-xs text-slate-600 line-clamp-2">{{ n.message }}</p>
                      <p class="text-[10px] text-slate-400 mt-1">
                        {{ n.created_at | date: 'short' }}
                      </p>
                    </div>
                    @if (!n.read) {
                      <span
                        class="w-2 h-2 rounded-full bg-brand-primary mt-1.5 shrink-0"
                        aria-label="No leído"
                      ></span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDropdownComponent implements OnInit {
  private readonly notificationsService = inject(NotificationService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elRef = inject(ElementRef);

  // ── Estado interno ──
  readonly open = signal(false);
  /** Lista de notificaciones cargada (signal). Renombrado de
   *  `notifications` para no colisionar con el Observable del
   *  RealtimeService (`realtime.notifications$`). */
  readonly notificationsList = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  ngOnInit(): void {
    // Carga inicial del badge — si falla, badge queda en 0 (no
    // rompe el header). El error se silencia a propósito: el
    // dropdown se reabre y refresca la lista cuando el user hace
    // click en el bell.
    this.notificationsService
      .getUnreadCount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => this.unreadCount.set(r.count),
        error: () => this.unreadCount.set(0),
      });

    // Stream realtime → actualiza badge y preendea si el dropdown
    // está abierto.
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((n) => {
        this.unreadCount.update((v) => v + 1);
        if (this.open()) {
          this.notificationsList.update((list) => [n, ...list]);
        }
      });
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: unknown): void {
    if (!target) return;
    const element = target as Node;
    if (this.open() && !this.elRef.nativeElement.contains(element)) {
      this.open.set(false);
    }
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next && this.notificationsList().length === 0) {
      this.loadList();
    }
  }

  close(): void {
    this.open.set(false);
  }

  private loadList(): void {
    this.notificationsService
      .getNotifications(20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => this.notificationsList.set(r.data),
        // Sin toast de error: el dropdown muestra un estado vacío y
        // el user puede reintentar abriendo de nuevo.
        error: () => this.notificationsList.set([]),
      });
  }

  onNotificationClick(n: AppNotification): void {
    // Optimistic update: marcar como leída localmente antes del HTTP
    // para que el cambio sea visible si el user no navega (o vuelve).
    // En error, se hace rollback.
    if (!n.read) {
      this.notificationsList.update((list) =>
        list.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      this.unreadCount.update((v) => Math.max(0, v - 1));

      this.notificationsService.markAsRead(n.id).subscribe({
        error: () => {
          // Rollback si el PATCH falla.
          this.notificationsList.update((list) =>
            list.map((x) => (x.id === n.id ? { ...x, read: false } : x)),
          );
          this.unreadCount.update((v) => v + 1);
        },
      });
    }

    this.open.set(false);
    if (n.incident_id) {
      this.router.navigate(['/app/incidencias', n.incident_id]);
    }
  }

  onMarkAllAsRead(): void {
    this.notificationsService.markAllAsRead().subscribe({
      next: () => {
        this.unreadCount.set(0);
        this.notificationsList.update((list) =>
          list.map((n) => ({ ...n, read: true })),
        );
      },
      error: () => {
        // El backend reconcilia — no mostramos error.
      },
    });
  }

  /**
   * Format heurístico por tipo de notificación. Devuelve icon + label
   * corto para el header del item. Si el `type` no matchea ninguna
   * regla conocida, usa 🔔 + label crudo (defense in depth — el
   * backend puede agregar tipos sin que el frontend deje de
   * renderizar).
   */
  formatFor(n: AppNotification): { icon: string; label: string } {
    switch (n.type) {
      case 'incident.created':
        return n.data?.['priority'] === 'critical'
          ? { icon: '🔴', label: 'Incidencia crítica' }
          : { icon: '📢', label: 'Incidencia creada' };
      case 'incident.status_changed':
        return n.data?.['status'] === 'en_sitio'
          ? { icon: '📍', label: 'Operador en sitio' }
          : { icon: '🔄', label: 'Estado actualizado' };
      case 'incident.assigned':
        return { icon: '📋', label: 'Asignación' };
      case 'incident_pending_approval':
        return { icon: '⏳', label: 'Pendiente de aprobación' };
      default:
        return { icon: '🔔', label: n.type };
    }
  }
}