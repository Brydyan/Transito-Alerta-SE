import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NotificationService, AppNotification } from './notification.service';

/**
 * 2026-10-17-header-notification-dropdown — TDD para el service de
 * notificaciones que consume el backend (REST + Socket.IO).
 *
 * Shape del backend (`GET /notifications`):
 *   { data: Notification[], total: number, meta?: {...} }
 *
 * Cada notification:
 *   { id, user_id, incident_id, type, message, data, read,
 *     created_at, updated_at, deleted_at | null }
 *
 * Diferencias con la interface vieja que este spec corrige:
 *   - `related_incident_id` → `incident_id`
 *   - `is_read` → `read`
 *   - faltan `message`, `data`, `updated_at`, `deleted_at`
 */
describe('NotificationService (2026-10-17)', () => {
  let service: NotificationService;
  let http: HttpTestingController;
  const base = '/api';

  const fixture: AppNotification = {
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
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [NotificationService],
    });
    service = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getNotifications(limit=20) GET /notifications?limit=20', () => {
    let result: { data: AppNotification[] } | undefined;
    service.getNotifications(20).subscribe((r) => (result = r));

    const req = http.expectOne(`${base}/notifications?limit=20`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [fixture], total: 1 });
    expect(result?.data[0].type).toBe('incident.created');
    expect(result?.data[0].incident_id).toBe('inc-42');
    expect(result?.data[0].read).toBe(false);
  });

  it('getUnreadCount() GET /notifications/unread-count', () => {
    let result: { count: number } | undefined;
    service.getUnreadCount().subscribe((r) => (result = r));

    const req = http.expectOne(`${base}/notifications/unread-count`);
    expect(req.request.method).toBe('GET');
    req.flush({ count: 5 });
    expect(result?.count).toBe(5);
  });

  it('markAsRead(id) PATCH /notifications/:id/read (cuerpo vacío)', () => {
    let result: AppNotification | undefined;
    service.markAsRead('n-1').subscribe((r) => (result = r));

    const req = http.expectOne(`${base}/notifications/n-1/read`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({ ...fixture, read: true });
    expect(result?.read).toBe(true);
  });

  it('markAllAsRead() PATCH /notifications/read-all', () => {
    let completed = false;
    service.markAllAsRead().subscribe({ complete: () => (completed = true) });

    const req = http.expectOne(`${base}/notifications/read-all`);
    expect(req.request.method).toBe('PATCH');
    req.flush(null);
    expect(completed).toBe(true);
  });
});