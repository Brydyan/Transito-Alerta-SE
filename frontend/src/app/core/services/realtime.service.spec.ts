import { TestBed } from '@angular/core/testing';
import { signal, Injectable } from '@angular/core';
import { RealtimeService } from './realtime.service';
import { AuthService } from './auth.service';

/**
 * 2026-10-17-header-notification-dropdown — TDD para el wrapper de
 * socket.io-client. El service:
 *   - expone `notifications$` como un Observable<AppNotification>
 *   - emite cuando el socket recibe un evento `notification` del room
 *   - conecta/desconecta según el estado de autenticación
 *
 * La idea del test es mockear `io(...)` (entry point de
 * socket.io-client) sin tocar el global. Usamos jest.mock al nivel
 * del módulo `socket.io-client`.
 */

jest.mock('socket.io-client', () => {
  const m = jest.fn();
  return { __esModule: true, default: m, io: m };
});

import { io as ioFn } from 'socket.io-client';
const ioMock = ioFn as unknown as jest.Mock;

@Injectable({ providedIn: 'root' })
class FakeAuthForTest {
  readonly currentUser = signal<{ id: string } | null>(null);
  readonly accessToken = signal<string | null>(null);
  logout = jest.fn();
}

describe('RealtimeService (2026-10-17)', () => {
  let service: RealtimeService;
  let mockSocket: {
    on: jest.Mock;
    off: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
    connected: boolean;
    auth: Record<string, unknown>;
  };

  beforeEach(() => {
    ioMock.mockReset();
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
      auth: {},
    };
    ioMock.mockReturnValue(mockSocket);

    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        { provide: AuthService, useClass: FakeAuthForTest },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  it('connect() llama io() con la URL base (sin /api) y pasa el JWT en auth.token', () => {
    const auth = TestBed.inject(AuthService) as unknown as FakeAuthForTest;
    auth.accessToken.set('jwt-abc');
    auth.currentUser.set({ id: 'user-1' });

    service.connect();

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, opts] = ioMock.mock.calls[0];
    expect(typeof url).toBe('string');
    // opts.auth.token es el JWT (no expone el prefijo 'Bearer' — el
    // gateway lee el token crudo del handshake).
    expect((opts as { auth: { token: string } }).auth.token).toBe('jwt-abc');
    // URL base no debe terminar en /api — el gateway monta Socket.IO en /
    expect((url as string).endsWith('/api')).toBe(false);
  });

  it('connect() sin user autenticado NO abre socket (no-op)', () => {
    const auth = TestBed.inject(AuthService) as unknown as FakeAuthForTest;
    auth.currentUser.set(null);
    auth.accessToken.set(null);

    service.connect();

    expect(ioMock).not.toHaveBeenCalled();
  });

  it('notifications$ emite cuando el socket recibe un evento de notificación', async () => {
    const auth = TestBed.inject(AuthService) as unknown as FakeAuthForTest;
    auth.accessToken.set('jwt-abc');
    auth.currentUser.set({ id: 'user-1' });

    // Capturar handlers registrados por socket.on
    const handlers: Record<string, (payload: unknown) => void> = {};
    mockSocket.on.mockImplementation(
      (event: string, cb: (payload: unknown) => void) => {
        handlers[event] = cb;
      },
    );

    service.connect();

    // Capturar la primera emisión del Observable
    const emitted: unknown[] = [];
    service.notifications$.subscribe((n) => emitted.push(n));

    // Simular el evento `notification` del gateway
    handlers['notification']({
      type: 'incident.created',
      data: {
        id: 'n-1',
        user_id: 'user-1',
        incident_id: 'inc-42',
        type: 'incident.created',
        message: 'Bache en Av. Principal',
        data: { priority: 'high' },
        read: false,
        created_at: '2026-10-17T10:00:00Z',
        updated_at: '2026-10-17T10:00:00Z',
        deleted_at: null,
      },
    });

    expect(emitted.length).toBe(1);
    expect((emitted[0] as { id: string }).id).toBe('n-1');
    expect((emitted[0] as { incident_id: string }).incident_id).toBe('inc-42');
  });

  it('disconnect() cierra el socket', () => {
    const auth = TestBed.inject(AuthService) as unknown as FakeAuthForTest;
    auth.accessToken.set('jwt-abc');
    auth.currentUser.set({ id: 'user-1' });

    service.connect();
    service.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});