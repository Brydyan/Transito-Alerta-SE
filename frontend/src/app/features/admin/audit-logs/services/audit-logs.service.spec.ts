import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { AuditLogsService } from './audit-logs.service';
import { environment } from '../../../../../environments/environment';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — contrato del
 * `AuditLogsService`. Cubre los tres métodos que el componente
 * consume directamente:
 *
 *  - `getAuditLogs(filters, page, limit)` — `GET /api/audit-logs`
 *    con paginación y filtros opcionales (date_from, date_to,
 *    actor_id). Devuelve `{items, total}`.
 *  - `exportCsv(filters)` — `GET /api/audit-logs/export.csv`
 *    con `responseType: 'blob'` (R4-S3: NUNCA `window.open`,
 *    porque rompe las cookies de auth).
 *  - `getUsers()` — `GET /api/users?limit=100` para el dropdown
 *    de actores. D2 del design dice `form-data` pero ese endpoint
 *    actual sólo trae `{roles, organizations}` — desviación
 *    documentada en `apply-progress.md`. Fallback a UUID input
 *    en 403 (actor sin permiso READ users).
 *
 * El spec NO afirma sobre la URL exacta construida (SC-209
 * lesson: los tests deben mirar el wire real, no la query
 * string). En cambio, verifica el método, los params y el
 * `responseType`.
 */
describe('AuditLogsService (F6)', () => {
  let service: AuditLogsService;
  let http: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/audit-logs`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuditLogsService],
    });
    service = TestBed.inject(AuditLogsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAuditLogs — GET /api/audit-logs con page, limit y filtros', () => {
    service
      .getAuditLogs(
        { dateFrom: '2026-09-01', dateTo: '2026-09-30', actorId: 'u1' },
        { page: 1, limit: 20 },
      )
      .subscribe((res) => {
        expect(res.items.length).toBe(1);
        expect(res.total).toBe(1);
      });

    const req = http.expectOne((r) => r.url === baseUrl && r.method === 'GET');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('date_from')).toBe('2026-09-01');
    expect(req.request.params.get('date_to')).toBe('2026-09-30');
    expect(req.request.params.get('actor_id')).toBe('u1');

    req.flush({
      items: [
        {
          id: 'a1',
          actor_id: 'u1',
          actor_name: 'Juan Pérez',
          action: 'READ audit-logs',
          resource_type: 'audit-logs',
          resource_id: null,
          justification: null,
          metadata: {},
          created_at: '2026-09-15T12:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('getAuditLogs — omite los filtros vacíos (date_from/date_to/actor_id)', () => {
    service.getAuditLogs({}, { page: 2, limit: 10 }).subscribe();
    const req = http.expectOne((r) => r.url === baseUrl && r.method === 'GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.has('date_from')).toBe(false);
    expect(req.request.params.has('date_to')).toBe(false);
    expect(req.request.params.has('actor_id')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('exportCsv — GET /api/audit-logs/export.csv con responseType blob', () => {
    const blob = new Blob(['a,b,c\n1,2,3'], { type: 'text/csv' });
    service
      .exportCsv({ dateFrom: '2026-09-01', dateTo: '2026-09-30', actorId: undefined })
      .subscribe((result) => {
        expect(result).toBe(blob);
        expect(result.type).toBe('text/csv');
      });

    const req = http.expectOne((r) => r.url === `${baseUrl}/export.csv`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('date_from')).toBe('2026-09-01');
    expect(req.request.params.get('date_to')).toBe('2026-09-30');
    expect(req.request.params.has('actor_id')).toBe(false);
    req.flush(blob);
  });

  it('exportCsv — envía los filtros activos al backend', () => {
    service.exportCsv({ actorId: 'u-actor' }).subscribe();
    const req = http.expectOne((r) => r.url === `${baseUrl}/export.csv`);
    expect(req.request.params.get('actor_id')).toBe('u-actor');
    expect(req.request.params.has('date_from')).toBe(false);
    req.flush(new Blob(['x'], { type: 'text/csv' }));
  });

  it('getUsers — GET /api/users?limit=100 y mapea a {id, firstName, lastName}', () => {
    service.getUsers().subscribe((users) => {
      expect(users).toEqual([
        { id: 'u1', firstName: 'Juan', lastName: 'Pérez' },
        { id: 'u2', firstName: 'María', lastName: 'López' },
      ]);
    });

    // D2 dice `GET /api/users/form-data`, pero ese endpoint actual sólo
    // trae `{roles, organizations}` (no `users`). Usamos `GET /api/users`
    // que sí devuelve la forma `{id, first_name, last_name}` que el
    // dropdown necesita. Desviación documentada en `apply-progress.md`.
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.params.get('limit')).toBe('100');
    req.flush({
      items: [
        { id: 'u1', first_name: 'Juan', last_name: 'Pérez' },
        { id: 'u2', first_name: 'María', last_name: 'López' },
      ],
      total: 2,
    });
  });
});
