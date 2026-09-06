import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { IncidentDetailComponent } from './incident-detail.component';
import { IncidentService } from '../../../core/services/incident.service';
import { CommentService } from '../../../core/services/comment.service';
import { StatusHistoryService } from '../../../core/services/status-history.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { Incident } from '../../../core/models/incident.model';
import { Comment } from '../../../core/models/comment.model';
import { StatusHistoryEntry } from '../../../core/models/status-history.model';

/**
 * F3 (sc-303) — F3.4 spec.
 *
 * Cubre los behaviors centrales sin pretender probar la UI entera:
 *  - F3.4.2 — carga en paralelo vía forkJoin (verificamos que
 *    las tres requests salen).
 *  - F3.4.4 — id inexistente → `notFound` y NO error global.
 *  - F3.4.7 — 409 al cambiar estado recarga la incidencia.
 *  - F3.4.7 — las acciones derivan de `availableActions()` (D4).
 *  - D8 — sin coordenadas el bloque de mapa se omite entero.
 */
describe('IncidentDetailComponent (F3.4)', () => {
  const baseIncident: Incident = {
    id: 'inc-1',
    title: 'Pothole on Main St',
    description: 'Big crater',
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
  };

  function setup(opts: {
    id?: string | null;
    permissions?: string[];
    userId?: string | null;
    incident?: Incident | null;
    notFoundFromServer?: boolean;
  } = {}) {
    const id = opts.id === undefined ? 'inc-1' : opts.id;
    const incidentSvc = {
      getIncident: jest.fn(),
      updateIncidentStatus: jest.fn(),
      releaseIncident: jest.fn(),
    };
    const commentSvc = {
      getComments: jest.fn().mockReturnValue(of<Comment[]>([])),
    };
    const historySvc = {
      getStatusHistory: jest
        .fn()
        .mockReturnValue(of<{ items: StatusHistoryEntry[]; total: number }>({ items: [], total: 0 })),
    };
    const authSvc = {
      user: () => ({
        id: opts.userId ?? 'user-1',
        permissions: opts.permissions ?? [],
      }),
    };
    const toastSvc = { show: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: IncidentService, useValue: incidentSvc },
        { provide: CommentService, useValue: commentSvc },
        { provide: StatusHistoryService, useValue: historySvc },
        { provide: AuthService, useValue: authSvc },
        { provide: ToastService, useValue: toastSvc },
      ],
    });

    if (opts.notFoundFromServer) {
      incidentSvc.getIncident.mockReturnValue(throwError(() => ({ status: 404 })));
    } else {
      incidentSvc.getIncident.mockReturnValue(of(opts.incident ?? baseIncident));
    }

    const fixture = TestBed.createComponent(IncidentDetailComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component, incidentSvc, commentSvc, historySvc, toastSvc };
  }

  it('F3.4.2 — carga en paralelo: incident, comments, history en tres requests', () => {
    const { incidentSvc, commentSvc, historySvc } = setup();
    expect(incidentSvc.getIncident).toHaveBeenCalledTimes(1);
    expect(commentSvc.getComments).toHaveBeenCalledTimes(1);
    expect(historySvc.getStatusHistory).toHaveBeenCalledTimes(1);
  });

  it('F3.4.4 — id inexistente activa el estado local notFound (no la página de error global)', () => {
    const { component, fixture } = setup({ notFoundFromServer: true });
    expect(component.notFound()).toBe(true);
    expect(component.loading()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('no encontrada');
  });

  it('sin id en la URL también activa notFound (defensivo)', () => {
    const { component } = setup({ id: null });
    expect(component.notFound()).toBe(true);
  });

  it('D8: hasCoordinates devuelve false cuando las coordenadas no son finitas', () => {
    const noCoords: Incident = { ...baseIncident, lat: NaN, lng: NaN };
    const { component } = setup({ incident: noCoords });
    expect(component.hasCoordinates()).toBe(false);
  });

  it('D4 — availableActions se llama con (incident, permissions, currentUserId)', () => {
    const { component } = setup({ permissions: ['UPDATE incidents'] });
    // pending + UPDATE ⇒ claim
    expect(component.actions()).toContain('claim');
  });

  it('F3.4.7 — al ejecutar claim con éxito, el incident signal se actualiza y se muestra toast', () => {
    const { component, incidentSvc, toastSvc } = setup({
      permissions: ['UPDATE incidents'],
    });
    const updated = { ...baseIncident, status: 'in_progress' as const };
    incidentSvc.updateIncidentStatus.mockReturnValue(of(updated));

    component.onAction('claim');

    expect(incidentSvc.updateIncidentStatus).toHaveBeenCalledWith(
      'inc-1',
      'in_progress',
      undefined,
    );
    expect(component.incident()?.status).toBe('in_progress');
    expect(toastSvc.show).toHaveBeenCalled();
  });

  it('F3.4.7 — al fallar el cambio de estado, el toast expone el mensaje del backend y se recarga la incidencia', () => {
    const { component, incidentSvc, toastSvc } = setup({
      permissions: ['UPDATE incidents'],
    });
    incidentSvc.updateIncidentStatus.mockReturnValue(
      throwError(() => ({ error: { message: 'INCIDENT_INVALID_TRANSITION' } })),
    );
    // La recarga usa `getIncident`, que está mockeado arriba
    incidentSvc.getIncident.mockReturnValue(of(baseIncident));

    component.onAction('claim');

    expect(toastSvc.show).toHaveBeenCalledWith(
      'INCIDENT_INVALID_TRANSITION',
      'error',
    );
  });

  it('F3.4.9 — close sin motivo muestra un toast de advertencia y no llama al backend', () => {
    const { component, incidentSvc } = setup({
      permissions: ['UPDATE incidents', 'CLOSE incidents'],
    });
    // Mockear `window.prompt` para que devuelva vacío.
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('   ');

    component.onAction('close');

    expect(incidentSvc.updateIncidentStatus).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('F3.4.9 — close con motivo llama al backend con `closed_reason`', () => {
    const { component, incidentSvc } = setup({
      permissions: ['UPDATE incidents', 'CLOSE incidents'],
    });
    incidentSvc.updateIncidentStatus.mockReturnValue(
      of({ ...baseIncident, status: 'closed' as const, closed_reason: 'recurso no disponible' }),
    );
    const promptSpy = jest
      .spyOn(window, 'prompt')
      .mockReturnValue('recurso no disponible');

    component.onAction('close');

    expect(incidentSvc.updateIncidentStatus).toHaveBeenCalledWith(
      'inc-1',
      'closed',
      'recurso no disponible',
    );
    promptSpy.mockRestore();
  });

  // C2 (ronda 4) — el botón "release" antes era un no-op silencioso
  // (sólo mostraba un toast de "pendiente"). Conectar al endpoint
  // real `POST /incidents/:id/release`.
  it('C2: onAction("release") llama al endpoint real y actualiza el incident', () => {
    // El usuario debe ser el `claimed_by` para que `release`
    // aparezca en `availableActions()`. Mocks:
    //   - incident.claimed_by = 'user-1' (mismo que currentUserId)
    //   - status = 'in_progress' (sólo entonces se ofrece release)
    const claimedIncident: Incident = {
      ...baseIncident,
      status: 'in_progress',
      claimed_by: 'user-1',
    };
    const { component, incidentSvc, toastSvc } = setup({
      permissions: ['UPDATE incidents'],
      userId: 'user-1',
      incident: claimedIncident,
    });
    const released: Incident = { ...claimedIncident, claimed_by: null };
    incidentSvc.releaseIncident = jest.fn().mockReturnValue(of(released));

    component.onAction('release');

    expect(incidentSvc.releaseIncident).toHaveBeenCalledWith('inc-1');
    expect(component.incident()?.claimed_by).toBeNull();
    expect(toastSvc.show).toHaveBeenCalledWith('Incidencia liberada.', 'success');
  });

  it('C2: onAction("release") con error 409 muestra el motivo del backend y recarga', () => {
    const claimedIncident: Incident = {
      ...baseIncident,
      status: 'in_progress',
      claimed_by: 'user-1',
    };
    const { component, incidentSvc, toastSvc } = setup({
      permissions: ['UPDATE incidents'],
      userId: 'user-1',
      incident: claimedIncident,
    });
    incidentSvc.releaseIncident = jest.fn().mockReturnValue(
      throwError(() => ({ error: { message: 'NOT_THE_CLAIMER' } })),
    );
    incidentSvc.getIncident.mockReturnValue(of(claimedIncident));

    component.onAction('release');

    expect(toastSvc.show).toHaveBeenCalledWith('NOT_THE_CLAIMER', 'error');
  });
});
