import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { signal } from '@angular/core';

import { NotificationDropdownComponent } from './notification-dropdown.component';
import {
  NotificationService,
  AppNotification,
} from '../../../core/services/notification.service';
import { RealtimeService } from '../../../core/services/realtime.service';

/**
 * 2026-10-17-header-notification-dropdown — TDD para el dropdown
 * del bell button en el header. Reemplaza el botón campana estático
 * (sin handler, punto rojo hardcodeado) por un dropdown funcional
 * con badge dinámico, lista de notificaciones, click que navega y
 * "Marcar todo como leído".
 */
describe('NotificationDropdownComponent (2026-10-17)', () => {
  let component: NotificationDropdownComponent;
  let fixture: ComponentFixture<NotificationDropdownComponent>;
  let mockNotifications: {
    getNotifications: jest.Mock;
    getUnreadCount: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
  };
  let realtimeSubject: Subject<AppNotification>;
  let mockRealtime: { notifications$: Subject<AppNotification> };

  const fixtureN = (overrides: Partial<AppNotification> = {}): AppNotification => ({
    id: 'n-1',
    user_id: 'user-1',
    incident_id: 'inc-42',
    type: 'incident.created',
    message: 'Bache en Av. Principal',
    data: {},
    read: false,
    created_at: '2026-10-17T10:00:00Z',
    updated_at: '2026-10-17T10:00:00Z',
    ...overrides,
  });

  beforeEach(async () => {
    mockNotifications = {
      getNotifications: jest.fn().mockReturnValue(
        of({ data: [fixtureN()], total: 1 }),
      ),
      getUnreadCount: jest.fn().mockReturnValue(of({ count: 3 })),
      markAsRead: jest.fn().mockReturnValue(of(fixtureN({ read: true }))),
      markAllAsRead: jest.fn().mockReturnValue(of(undefined)),
    };
    realtimeSubject = new Subject<AppNotification>();
    mockRealtime = { notifications$: realtimeSubject.asObservable() };

    await TestBed.configureTestingModule({
      imports: [NotificationDropdownComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: NotificationService, useValue: mockNotifications },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationDropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('init: carga unread count desde getUnreadCount', () => {
    expect(mockNotifications.getUnreadCount).toHaveBeenCalled();
    expect(component.unreadCount()).toBe(3);
  });

  it('toggle: al abrir, carga getNotifications(20)', () => {
    component.open.set(false);
    component.toggle();
    expect(mockNotifications.getNotifications).toHaveBeenCalledWith(20);
    expect(component.notificationsList().length).toBe(1);
  });

  it('badge: muestra el número de unread > 0', () => {
    const badge: HTMLElement | null = fixture.nativeElement.querySelector(
      '[data-testid="unread-badge"]',
    );
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('badge: se oculta cuando unreadCount = 0', () => {
    component.unreadCount.set(0);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector(
      '[data-testid="unread-badge"]',
    );
    expect(badge).toBeNull();
  });

  it('realtime: nueva notificación vía socket → incrementa unreadCount y prependea a la lista si está abierto', () => {
    component.unreadCount.set(3);
    component.open.set(false);
    component.toggle(); // abre
    const listBefore = component.notificationsList().length;

    realtimeSubject.next(fixtureN({ id: 'n-new', incident_id: 'inc-new' }));

    expect(component.unreadCount()).toBe(4);
    expect(component.notificationsList()[0].id).toBe('n-new');
    expect(component.notificationsList().length).toBe(listBefore + 1);
  });

  it('realtime: si el dropdown está cerrado, sólo incrementa el contador (no toca la lista)', () => {
    component.unreadCount.set(3);
    component.open.set(false);

    realtimeSubject.next(fixtureN({ id: 'n-new' }));

    expect(component.unreadCount()).toBe(4);
    // La lista no se carga hasta abrir
    expect(mockNotifications.getNotifications).not.toHaveBeenCalled();
  });

  it('click en notificación → markAsRead + navega + cierra dropdown', () => {
    const navSpy = jest.spyOn(component, 'onNotificationClick');
    component.toggle();
    component.onNotificationClick(fixtureN({ id: 'n-1', incident_id: 'inc-42' }));

    expect(mockNotifications.markAsRead).toHaveBeenCalledWith('n-1');
    expect(component.open()).toBe(false);
  });

  it('Marcar todo como leído: markAllAsRead + setea unreadCount=0', () => {
    component.unreadCount.set(5);
    component.open.set(false);
    component.toggle();
    component.onMarkAllAsRead();

    expect(mockNotifications.markAllAsRead).toHaveBeenCalled();
    expect(component.unreadCount()).toBe(0);
    // Las notificaciones locales se marcan leídas
    expect(component.notificationsList().every((n) => n.read)).toBe(true);
  });

  it('error en getUnreadCount inicial: no rompe el componente (no badge visible)', () => {
    mockNotifications.getUnreadCount.mockReturnValueOnce(
      throwError(() => new Error('boom')),
    );
    // Recrear el componente con el mock fallido
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [NotificationDropdownComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: NotificationService, useValue: mockNotifications },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compileComponents();
    const f2 = TestBed.createComponent(NotificationDropdownComponent);
    f2.detectChanges();

    expect(f2.componentInstance.unreadCount()).toBe(0);
  });

  it('formatFor(): incident.created + critical → 🔴 Incidencia crítica', () => {
    const out = component.formatFor(
      fixtureN({ type: 'incident.created', data: { priority: 'critical' } }),
    );
    expect(out.icon).toBe('🔴');
    expect(out.label).toBe('Incidencia crítica');
  });

  it('formatFor(): incident.status_changed + en_sitio → 📍 Operador en sitio', () => {
    const out = component.formatFor(
      fixtureN({ type: 'incident.status_changed', data: { status: 'en_sitio' } }),
    );
    expect(out.icon).toBe('📍');
    expect(out.label).toBe('Operador en sitio');
  });

  it('formatFor(): incident_pending_approval → ⏳ Pendiente de aprobación', () => {
    const out = component.formatFor(fixtureN({ type: 'incident_pending_approval' }));
    expect(out.icon).toBe('⏳');
    expect(out.label).toBe('Pendiente de aprobación');
  });

  it('formatFor(): incident.assigned → 📋 Asignación', () => {
    const out = component.formatFor(fixtureN({ type: 'incident.assigned' }));
    expect(out.icon).toBe('📋');
    expect(out.label).toBe('Asignación');
  });

  it('formatFor(): incident.status_changed con otro estado → 🔄 Estado actualizado', () => {
    const out = component.formatFor(
      fixtureN({ type: 'incident.status_changed', data: { status: 'in_progress' } }),
    );
    expect(out.icon).toBe('🔄');
    expect(out.label).toBe('Estado actualizado');
  });

  it('formatFor(): type desconocido → icon default 🔔 + label tipo crudo', () => {
    const out = component.formatFor(fixtureN({ type: 'something.unknown' }));
    expect(out.icon).toBe('🔔');
    expect(out.label).toBe('something.unknown');
  });
});