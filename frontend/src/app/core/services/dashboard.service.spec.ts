import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { DashboardService } from './dashboard.service';
import { HttpService } from './http.service';
import {
  IncidentStats,
  WeeklyStats,
} from '../models/dashboard.model';

/**
 * F6 redesign (`2026-09-08-f6-dashboard-redesign`) — contrato del
 * `DashboardService`.
 *
 * Cada test afirma sobre el wire shape (D1 de F0: derivar del
 * controlador, no de la URL). Las URLs se verifican como
 * subproducto, pero las aserciones reales viven en la respuesta.
 */
describe('DashboardService (F6 redesign)', () => {
  let service: DashboardService;
  let http: HttpTestingController;
  const base = '/api';

  const fixtureStats: IncidentStats = {
    total: 22,
    by_status: { pending: 9, in_progress: 7, resolved: 6, closed: 0 },
    by_priority: { critical: 3, high: 5, medium: 10, low: 4 },
    recent_count: 12,
    locations_count: 4,
    average_resolution_time: {
      formatted: '~13h',
      days: 0,
      hours: 13,
      seconds: 46800,
    },
    trends: {
      total_pct: 8,
      pendientes_pct: -5,
      resolution_rate_pct: 67,
    },
    top_categories: [
      { name: 'Baches y Hundimientos', total: 8, resolved: 3, pending: 5 },
      { name: 'Agua Potable', total: 6, resolved: 2, pending: 4 },
      { name: 'Alumbrado', total: 4, resolved: 1, pending: 3 },
    ],
  };

  const fixtureWeekly: WeeklyStats = {
    days: [
      { date: '2026-09-02', label: 'Mié', recibidas: 4, resueltas: 2 },
      { date: '2026-09-03', label: 'Jue', recibidas: 6, resueltas: 3 },
      { date: '2026-09-04', label: 'Vie', recibidas: 3, resueltas: 1 },
      { date: '2026-09-05', label: 'Sáb', recibidas: 2, resueltas: 2 },
      { date: '2026-09-06', label: 'Dom', recibidas: 1, resueltas: 0 },
      { date: '2026-09-07', label: 'Lun', recibidas: 5, resueltas: 4 },
      { date: '2026-09-08', label: 'Mar', recibidas: 7, resueltas: 5 },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DashboardService, HttpService],
    });
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('getStats — devuelve el wire completo y expone el contrato de /api/incidents/stats', (done) => {
    service.getStats().subscribe((stats) => {
      // Afirmamos sobre campos wire, no sobre el path (precedente SC-209).
      expect(stats.total).toBe(22);
      expect(stats.by_status['pending']).toBe(9);
      expect(stats.by_status['in_progress']).toBe(7);
      expect(stats.trends?.total_pct).toBe(8);
      expect(stats.average_resolution_time?.formatted).toBe('~13h');
      expect(stats.top_categories[0]?.name).toBe('Baches y Hundimientos');
      done();
    });
    const req = http.expectOne(`${base}/incidents/stats`);
    expect(req.request.method).toBe('GET');
    req.flush(fixtureStats);
  });

  it('getWeeklyStats — devuelve los 7 días con recibidas y resueltas', (done) => {
    service.getWeeklyStats().subscribe((weekly) => {
      expect(weekly.days.length).toBe(7);
      // Lunes-viernes tienen actividad en la fixture.
      const totalRecibidas = weekly.days.reduce((s, d) => s + d.recibidas, 0);
      const totalResueltas = weekly.days.reduce((s, d) => s + d.resueltas, 0);
      expect(totalRecibidas).toBe(28);
      expect(totalResueltas).toBe(17);
      done();
    });
    const req = http.expectOne(`${base}/incidents/weekly-stats`);
    expect(req.request.method).toBe('GET');
    req.flush(fixtureWeekly);
  });

  it('getRecentActivity — proyecta data[] a filas, limit aplicado', (done) => {
    service.getRecentActivity(5).subscribe((rows) => {
      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual({
        id: 'inc-1',
        category: 'Baches y Hundimientos',
        status: 'pending',
        priority: 'critical',
        createdAt: '2026-09-08T10:00:00Z',
      });
      done();
    });
    const req = http.expectOne(
      (r) => r.url === `${base}/incidents/feed` && r.params.get('limit') === '5',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        {
          id: 'inc-1',
          title: 'Pothole',
          status: 'pending',
          priority: 'critical',
          created_at: '2026-09-08T10:00:00Z',
          category: { id: 'cat-1', name: 'Baches y Hundimientos' },
        },
        {
          id: 'inc-2',
          title: 'Agua',
          status: 'in_progress',
          priority: 'high',
          created_at: '2026-09-08T09:30:00Z',
          category: { id: 'cat-2', name: 'Agua Potable' },
        },
        {
          id: 'inc-3',
          title: 'Luz',
          status: 'pending',
          priority: 'medium',
          created_at: '2026-09-08T09:00:00Z',
          category: { id: 'cat-3', name: 'Alumbrado' },
        },
      ],
    });
  });

  it('getRecentActivity — feed sin data devuelve lista vacía sin crashear', (done) => {
    service.getRecentActivity(5).subscribe((rows) => {
      expect(rows).toEqual([]);
      done();
    });
    const req = http.expectOne(
      (r) => r.url === `${base}/incidents/feed` && r.params.get('limit') === '5',
    );
    req.flush({});
  });

  it('getRecentActivity — feed con category null muestra "—"', (done) => {
    service.getRecentActivity(5).subscribe((rows) => {
      expect(rows[0]?.category).toBe('—');
      done();
    });
    const req = http.expectOne(
      (r) => r.url === `${base}/incidents/feed` && r.params.get('limit') === '5',
    );
    req.flush({
      data: [
        {
          id: 'inc-x',
          title: 'Sin categoría',
          status: 'pending',
          priority: 'low',
          created_at: '2026-09-08T08:00:00Z',
          category: null,
        },
      ],
    });
  });
});
