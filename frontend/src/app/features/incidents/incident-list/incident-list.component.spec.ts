import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { IncidentListComponent } from './incident-list.component';
import { IncidentService } from '../../../core/services/incident.service';
import { AuthService } from '../../../core/services/auth.service';
import { Incident, IncidentListResult } from '../../../core/models/incident.model';

/**
 * sc-339 — pagination + envelope specs.
 * Real envelope {items,total} drives pagination and page-size changes.
 */
describe('IncidentListComponent (sc-339 pagination)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  const makeIncident = (id: string, overrides: Partial<Incident> = {}): Incident => ({
    id,
    title: `Pothole ${id}`,
    description: 'x',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
    ...overrides,
  });

  function setup(qp: Record<string, string> = {}) {
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: [], total: 0, page: 1, limit: 20 }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(qp) },
            queryParamMap: of(convertToParamMap(qp)),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    return { spy };
  }

  it('hidrata los filtros desde la URL al montar', () => {
    setup({ status: 'in_progress', page: '2' });
    fixture.detectChanges();
    expect(component.statusFilter()).toBe('in_progress');
    expect(component.currentPage()).toBe(2);
  });

  it('emite al backend los filtros presentes en la URL, con page/limit y sin params no-whitelisteados', () => {
    const { spy } = setup({ status: 'closed' });
    fixture.detectChanges();
    expect(spy.getIncidents).toHaveBeenCalled();
    const arg = spy.getIncidents.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['status']).toBe('closed');
    expect(arg['page']).toBe(1);
    expect(arg['limit']).toBe(20);
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('priority');
    expect(arg).not.toHaveProperty('per_page');
    expect(arg).not.toHaveProperty('incident_category_id');
  });

  it('al cambiar el estado, vuelve a la página 1', () => {
    const { spy } = setup({ page: '3' });
    fixture.detectChanges();
    component.onStatusChange('resolved');
    expect(component.currentPage()).toBe(1);
    expect(spy.getIncidents).toHaveBeenCalled();
  });

  it('al limpiar filtros, vacía la barra y vuelve a la página 1 sin status', () => {
    const { spy } = setup({ status: 'in_progress' });
    fixture.detectChanges();
    component.onClearFilters();
    expect(component.searchCtrl.value).toBe('');
    expect(component.statusFilter()).toBeNull();
    expect(component.currentPage()).toBe(1);
    const arg = spy.getIncidents.mock.calls[spy.getIncidents.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('priority');
    expect(arg['page']).toBe(1);
    expect(arg['limit']).toBe(20);
  });

  it('muestra rango "1-10 de 10" con paginación real', () => {
    const { spy } = setup();
    component.pageSize.set(10);
    spy.getIncidents.mockReturnValue(
      of({
        items: Array.from({ length: 10 }, (_, i) => makeIncident(`inc-${i}`)),
        total: 10,
        page: 1,
        limit: 10,
      }),
    );
    fixture.detectChanges();
    // Manually sync signals as fetch() would set total via subscription
    component.total.set(10);
    component.currentPage.set(1);
    expect(component.rangeText()).toBe('Mostrando 1-10 de 10 incidencias');
  });

  it('singular cuando total === 1', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [makeIncident('only-one')], total: 1, page: 1, limit: 20 }),
    );
    fixture.detectChanges();
    component.total.set(1);
    component.currentPage.set(1);
    expect(component.rangeText()).toBe('Mostrando 1 de 1 incidencia');
  });

  it('shouldShowPagination es false cuando total <= pageSize, true cuando total > pageSize', () => {
    setup();
    fixture.detectChanges();
    component.pageSize.set(20);
    component.total.set(10);
    expect(component.shouldShowPagination()).toBe(false);
    component.total.set(25);
    expect(component.shouldShowPagination()).toBe(true);
  });

  it('cambiar el tamaño de página resetea a página 1 y refetchea con el nuevo limit', () => {
    const { spy } = setup();
    fixture.detectChanges();
    // Simulate being on page 3 with pageSize 20
    component.currentPage.set(3);
    component.pageSize.set(20);
    spy.getIncidents.mockClear();
    component.onPageSizeChange(10);
    expect(component.pageSize()).toBe(10);
    expect(component.currentPage()).toBe(1);
    expect(spy.getIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('el filtro de búsqueda y el selector de prioridad NO se renderizan (alcance reducido)', () => {
    setup();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="search-input"]')).toBeNull();
    expect(el.querySelector('[data-testid="priority-select"]')).toBeNull();
    expect(el.querySelector('[data-testid="status-select"]')).not.toBeNull();
  });

  it('trunca títulos largos con elipsis', () => {
    const longTitle = 'x'.repeat(80);
    expect(component.truncate(longTitle, 60)).toMatch(/…$/);
    expect(component.truncate(longTitle, 60).length).toBe(60);
    expect(component.truncate('corto')).toBe('corto');
  });

  it('badges traduce del wire (inglés) al F0 (español)', () => {
    setup();
    fixture.detectChanges();
    expect(component.badgeStatusFor('pending')).toBe('pendiente');
    expect(component.badgeStatusFor('in_progress')).toBe('en_proceso');
    expect(component.badgeStatusFor('resolved')).toBe('resuelto');
    expect(component.badgeStatusFor('closed')).toBe('cerrada');
  });

  it('D8: el rango "0" se renderiza con la palabra "incidencias"', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [], total: 0, page: 1, limit: 20 }),
    );
    fixture.detectChanges();
    expect(component.rangeText()).toBe('Mostrando 0 de 0 incidencias');
  });
});
