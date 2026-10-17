import { Injectable, OnDestroy, effect, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AppNotification } from './notification.service';

/**
 * 2026-10-17-header-notification-dropdown — wrapper de
 * socket.io-client que conecta al gateway NestJS del backend
 * (`backend/src/modules/realtime/events.gateway.ts`).
 *
 * El gateway monta Socket.IO en `/` (no en `/api`). El cliente
 * se conecta con `auth.token` (JWT) en el handshake; al conectar,
 * el backend lo une automáticamente al room `user:{userId}` y emite
 * eventos `notification` cuando llega una nueva.
 *
 * Reglas:
 *  - sólo conecta cuando hay un access token válido (signal login);
 *  - desconecta al logout para no dejar sockets colgados;
 *  - expone `notifications$` como Observable<AppNotification> — el
 *    `NotificationDropdownComponent` se suscribe y prependea al
 *    array local cuando llega una nueva.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly _notifications$ = new Subject<AppNotification>();
  readonly notifications$: Observable<AppNotification> = this._notifications$.asObservable();
  private socket: Socket | null = null;

  /**
   * Effect de ciclo de vida: cuando hay un access token (signal `login`
   * del AuthService), conecta. Cuando el token pasa a null (logout),
   * desconecta.
   *
   * El guard contra `null` es importante: el gateway rechaza el
   * handshake sin JWT y socket.io entraría en loop de reconexión.
   */
  constructor() {
    effect(() => {
      const token = this.authService.accessToken();
      if (token) {
        this.connectInternal(token);
      } else {
        this.disconnect();
      }
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Abre el socket si no está abierto. Idempotente: si ya hay
   * conexión viva, no reconecta.
   */
  connect(): void {
    const token = this.authService.accessToken();
    if (!token) return;
    this.connectInternal(token);
  }

  /**
   * Cierra el socket y libera la referencia. El subject queda
   * vivo pero sin fuente — `notifications$` deja de emitir.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private connectInternal(token: string): void {
    if (this.socket) return;
    // El gateway monta Socket.IO en la raíz, no en /api. Quitamos el
    // sufijo si la apiUrl lo trae (caso normalizado para localhost
    // vs. dominio absoluto).
    const baseUrl = environment.apiUrl.replace(/\/api\/?$/, '');
    this.socket = io(baseUrl, {
      auth: { token },
      // Reconexión con backoff: 1s, 2s, 4s, max 10s. Suficiente
      // para recuperarse de un redeploy sin saturar al gateway.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });
    // El gateway emite `notification` (singular) por cada evento de
    // tipo notificación dirigido al room `user:{userId}`. La forma
    // del payload es `{ type: NotificationType, data: Notification }`.
    this.socket.on('notification', (payload: { type: string; data: AppNotification }) => {
      // Cualquier evento que llegue por el canal `notification` del
      // gateway es una notificación válida. Filtramos por la presencia
      // de `data.id` por defense-in-depth (un heartbeat mal etiquetado
      // no debe caer en el dropdown).
      if (payload?.data?.id) {
        this._notifications$.next(payload.data);
      }
    });
    this.socket.on('connect_error', (err) => {
      // El backend emite 401 cuando el JWT expira o es inválido.
      // Cerramos el socket para forzar re-conexión con el nuevo token
      // después del refresh silencioso del AuthService.
      if (err && (err as { message?: string }).message === 'Unauthorized') {
        this.disconnect();
      }
    });
  }
}