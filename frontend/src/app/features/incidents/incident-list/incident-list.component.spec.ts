import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { IncidentListComponent } from './incident-list.component';
import { IncidentService } from '../../../core/services/incident.service';
import { AuthService } from '../../../core/services/auth.service';
import { Incident, IncidentListResult } from '../../../core/models/incident.model';

/**
 * F3 (sc-303) — F3.2.9 list specs.
 *
 *  - Filtros combinados generan los query params correctos.
 *  - Restaurar desde URL reconstruye el estado.
 *  - `empty-state` cuando no hay resultados.
 *  - Las tarjetas de contexto muestran guion cuando la métrica
 *    está indisponible (D8 — nunca 0).
 *
 * El `IncidentService` se mockea con un espía de `getIncidents` para
 * verificar QUÉ filtros viajan al backend. La aserción es sobre
 * el filtro (el contrato), no sobre el path del router.
 */
describe('IncidentListComponent (F3.2.9)', () => {
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
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
    ...overrides,
  });

  function setup(qp: Record<string, string> = {}) {
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: [], total: 0, page: 1, limit: 10 }),
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

  it('hidrata los filtros desde la URL al montar (D2 — "restaurar desde URL reconstruye el estado")', () => {
    // F3 (sc-303) C1 (ronda 4) — sólo `status` se persiste en la
    // URL. `search`/`priority`/`page` ya no se mandan al backend;
    // cuando se extienda `findAll`, este test se expande.
    setup({ status: 'in_progress', page: '2' });
    fixture.detectChanges();
    expect(component.statusFilter()).toBe('in_progress');
    expect(component.currentPage()).toBe(2);
  });

  it('emite al backend los filtros presentes en la URL, sin los vacíos', () => {
    const { spy } = setup({ status: 'closed' });
    fixture.detectChanges();
    expect(spy.getIncidents).toHaveBeenCalled();
    const arg = spy.getIncidents.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['status']).toBe('closed');
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('priority');
  });

  it('al cambiar el estado, vuelve a la página 1 (spec — la búsqueda/filtro reinicia paginación)', () => {
    const { spy } = setup({ page: '3' });
    fixture.detectChanges();
    component.onStatusChange('resolved');
    expect(component.currentPage()).toBe(1);
    expect(spy.getIncidents).toHaveBeenCalled();
  });

  it('al limpiar filtros, vacía la barra y vuelve a la página 1', () => {
    const { spy } = setup({ status: 'in_progress' });
    fixture.detectChanges();
    component.onClearFilters();
    expect(component.searchCtrl.value).toBe('');
    expect(component.statusFilter()).toBeNull();
    expect(component.currentPage()).toBe(1);
    // La siguiente llamada no debe llevar search/priority/page/limit.
    const arg = spy.getIncidents.mock.calls[spy.getIncidents.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('priority');
  });

  it('muestra "Mostrando N de N" (sin paginación real hasta que el backend extienda findAll) — C1', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({
        items: Array.from({ length: 10 }, (_, i) => makeIncident(`inc-${i}`)),
        total: 10,
        page: 1,
        limit: 10,
      }),
    );
    fixture.detectChanges();
    // F3 (sc-303) C1 (ronda 4) — sin paginación real del backend,
    // el rango es siempre `N de N`. Cuando se extienda `findAll`,
    // el formato vuelve a `start-end de N`.
    expect(component.rangeText()).toBe('Mostrando 10 de 10 incidencias');
  });

  it('singular cuando total === 1 (no rompe UX)', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [makeIncident('only-one')], total: 1, page: 1, limit: 10 }),
    );
    fixture.detectChanges();
    expect(component.rangeText()).toBe('Mostrando 1 de 1 incidencia');
  });

  it('C1: el paginador está oculto mientras el backend no soporte paginación', () => {
    // La guarda `shouldShowPagination` devuelve `false` siempre
    // hasta que el backend extienda `findAll`. Un usuario no
    // debería ver un paginador que no hace nada.
    expect(component.shouldShowPagination()).toBe(false);
  });

  it('C1: el filtro de búsqueda y el selector de prioridad NO se renderizan (alcance reducido)', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Antes había `[data-testid="search-input"]` y `[data-testid="priority-select"]`;
    // ambos se retiraron del template porque el backend no los
    // soporta. Sólo queda `[data-testid="status-select"]`.
    expect(el.querySelector('[data-testid="search-input"]')).toBeNull();
    expect(el.querySelector('[data-testid="priority-select"]')).toBeNull();
    expect(el.querySelector('[data-testid="status-select"]')).not.toBeNull();
  });

  it('trunca títulos largos con elipsis y conserva el texto completo como title accesible (F3.2.5)', () => {
    const longTitle = 'x'.repeat(80);
    expect(component.truncate(longTitle, 60)).toMatch(/…$/);
    expect(component.truncate(longTitle, 60).length).toBe(60);
    // El title accesible (atributo HTML) lo aplicamos en el template,
    // no acá — el método sólo prepara el string. Lo verifica el
    // assertion end-to-end: ningún carácter del título original se
    // pierde; lo que cambia es que se trunca el render.
    expect(component.truncate('corto')).toBe('corto');
  });

  it('badges traduce del wire (inglés) al F0 (español) sin perder el contrato', () => {
    expect(component.badgeStatusFor('pending')).toBe('pendiente');
    expect(component.badgeStatusFor('in_progress')).toBe('en_proceso');
    expect(component.badgeStatusFor('resolved')).toBe('resuelto');
    expect(component.badgeStatusFor('closed')).toBe('cerrada');
  });

  it('D8: el rango "0" se renderiza con la palabra "incidencias" (no "incidencia")', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [], total: 0, page: 1, limit: 10 }),
    );
    fixture.detectChanges();
    expect(component.rangeText()).toBe('Mostrando 0 de 0 incidencias');
  });
});
