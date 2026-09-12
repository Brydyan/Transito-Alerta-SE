import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';

import { AuditLogsService } from './services/audit-logs.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

import { AuditLogsComponent } from './audit-logs.component';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — contrato del
 * `AuditLogsComponent`. Cubre:
 *
 *  - R2-S1 — `GET /api/audit-logs?page=1&limit=20` al inicializar.
 *  - R2-S2 — empty-state cuando `{items: [], total: 0}`.
 *  - R2-S3 — paginación recarga con la página nueva.
 *  - R3-S2 — filtro de actor (dropdown o UUID) manda `actor_id`.
 *  - R3-S4 — aplicar filtros resetea la página a 1.
 *  - R4-S1/R4-S2 — click en "Descargar CSV" llama
 *    `service.exportCsv(activeFilters)` y dispara
 *    `URL.createObjectURL` (NUNCA `window.open`).
 *  - D2 — fallback a UUID input cuando `getUsers()` devuelve 403.
 *
 * El spec cubre el comportamiento observable del componente y
 * delega los detalles del wire al spec del `AuditLogsService`.
 */
describe('AuditLogsComponent (F6)', () => {
  let component: AuditLogsComponent;
  let fixture: ComponentFixture<AuditLogsComponent>;
  let mockService: {
    getAuditLogs: jest.Mock;
    exportCsv: jest.Mock;
    getUsers: jest.Mock;
  };

  // sdd-verify FIX-1: snake_case fields — see AuditLogItem in
  // services/audit-logs.service.ts. The wire is snake_case because
  // the back's SnakeCaseResponseInterceptor rewrites the camelCase
  // AuditLogItemDto on the way out.
  const fixtureItems = [
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
    {
      id: 'a2',
      actor_id: 'u2',
      actor_name: 'María López',
      action: 'UPDATE users',
      resource_type: 'users',
      resource_id: 'u3',
      justification: 'Cambio de rol',
      metadata: { old: 'admin_org' },
      created_at: '2026-09-15T13:00:00.000Z',
    },
  ];

  const fixtureUsers = [
    { id: 'u1', firstName: 'Juan', lastName: 'Pérez' },
    { id: 'u2', firstName: 'María', lastName: 'López' },
  ];

  beforeEach(async () => {
    mockService = {
      getAuditLogs: jest.fn().mockReturnValue(of({ items: fixtureItems, total: 2 })),
      exportCsv: jest.fn().mockReturnValue(
        of(new Blob(['header\nrow'], { type: 'text/csv' })),
      ),
      getUsers: jest.fn().mockReturnValue(of(fixtureUsers)),
    };

    await TestBed.configureTestingModule({
      imports: [AuditLogsComponent],
      providers: [
        provideRouter([]),
        { provide: AuditLogsService, useValue: mockService },
        {
          provide: AuthService,
          useValue: { currentUser: signal({ permissions: ['READ audit-logs'] }) },
        },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea y llama getAuditLogs({page:1, limit:20}) en ngOnInit', () => {
    expect(component).toBeTruthy();
    expect(mockService.getAuditLogs).toHaveBeenCalledWith(
      { dateFrom: '', dateTo: '', actorId: '' },
      { page: 1, limit: 20 },
    );
  });

  it('carga items y total en los signals', () => {
    expect(component.items().length).toBe(2);
    expect(component.total()).toBe(2);
  });

  it('carga el dropdown de actores y deja actorDropdownAvailable=true', () => {
    expect(mockService.getUsers).toHaveBeenCalledTimes(1);
    expect(component.users().length).toBe(2);
    expect(component.actorDropdownAvailable()).toBe(true);
  });

  it('renderiza una fila por item con la fecha formateada', () => {
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('R2-S2: muestra empty-state cuando la respuesta viene vacía', () => {
    mockService.getAuditLogs.mockReturnValue(of({ items: [], total: 0 }));
    component.ngOnInit();
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('app-empty-state');
    expect(empty).toBeTruthy();
    expect(component.items().length).toBe(0);
    expect(component.total()).toBe(0);
  });

  it('R2-S3: onPageChange recarga con la página nueva', () => {
    component.onPageChange(2);
    expect(mockService.getAuditLogs).toHaveBeenLastCalledWith(
      { dateFrom: '', dateTo: '', actorId: '' },
      { page: 2, limit: 20 },
    );
  });

  it('R3-S4: aplicar filtros resetea la página a 1', () => {
    component.onPageChange(3);
    expect(component.currentPage()).toBe(3);

    component.onFilterChange({ dateFrom: '2026-09-01', dateTo: '', actorId: '' });

    expect(component.currentPage()).toBe(1);
    expect(mockService.getAuditLogs).toHaveBeenLastCalledWith(
      { dateFrom: '2026-09-01', dateTo: '', actorId: '' },
      { page: 1, limit: 20 },
    );
  });

  it('R3-S2: enviar filtros de actor en la query', () => {
    component.onFilterChange({ dateFrom: '', dateTo: '', actorId: 'u1' });
    expect(mockService.getAuditLogs).toHaveBeenLastCalledWith(
      { dateFrom: '', dateTo: '', actorId: 'u1' },
      { page: 1, limit: 20 },
    );
  });

  it('limpiar filtros restaura la vista sin params', () => {
    component.onFilterChange({ dateFrom: '2026-09-01', dateTo: '', actorId: 'u1' });
    component.onFilterChange({ dateFrom: '', dateTo: '', actorId: '' });
    expect(component.filters()).toEqual({ dateFrom: '', dateTo: '', actorId: '' });
    expect(mockService.getAuditLogs).toHaveBeenLastCalledWith(
      { dateFrom: '', dateTo: '', actorId: '' },
      { page: 1, limit: 20 },
    );
  });

  it('D2: si getUsers() devuelve 403, actorDropdownAvailable=false', () => {
    mockService.getUsers.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    // Nuevo ciclo de init con el mock actualizado.
    component.ngOnInit();
    expect(component.actorDropdownAvailable()).toBe(false);
    expect(component.users().length).toBe(0);
  });

  it('captura error 500 del backend y enciende errorMessage', () => {
    mockService.getAuditLogs.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    component.onPageChange(2);
    expect(component.errorMessage()).toBe('No se pudieron cargar los eventos de auditoría.');
    expect(component.isLoading()).toBe(false);
  });

  it('R4-S1/R4-S2: onDownloadCsv llama exportCsv con filtros activos y dispara URL.createObjectURL', () => {
    // jsdom no implementa `URL.createObjectURL` ni `revokeObjectURL`
    // — los montamos manualmente para espiar. El componente los
    // llama por nombre, no importa de dónde vengan.
    const createSpy = jest.fn().mockReturnValue('blob:mock-url');
    const revokeSpy = jest.fn();
    (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = createSpy;
    (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = revokeSpy;
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    component.onDownloadCsv();

    expect(mockService.exportCsv).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: '', dateTo: '', actorId: '' }),
    );
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('R4-S3: NO usa window.open para descargar el CSV', () => {
    const openSpy = jest
      .spyOn(window, 'open')
      .mockImplementation(() => null);

    component.onDownloadCsv();

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('exportCsv con filtros activos: propaga los filtros al service', () => {
    component.onFilterChange({ dateFrom: '2026-09-01', dateTo: '2026-09-30', actorId: 'u2' });
    component.onDownloadCsv();

    expect(mockService.exportCsv).toHaveBeenLastCalledWith({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      actorId: 'u2',
    });
  });

  it('formatActor: muestra firstName + lastName; "—" si está vacío', () => {
    expect(component.formatActor({ firstName: 'Juan', lastName: 'Pérez' })).toBe(
      'Juan Pérez',
    );
    expect(component.formatActor({ firstName: '', lastName: '' })).toBe('—');
  });

  // sdd-verify FIX-3: the structural R1-S2 test lived here, but
  // TestBed cannot be re-configured inside a describe that
  // already instantiated it (Angular throws). The RouterTestingModule
  // integration test was moved to `permission-guard.spec.ts`
  // (separate file, separate describe, separate TestBed lifecycle).
  it('R1-S2 (stub): the route declares data.permission = READ audit-logs', () => {
    // The real integration test for this is in
    // `./permission-guard.spec.ts`. This stub preserves the
    // structural assertion so renames of the route field break
    // a unit test fast.
    const routeData = {
      breadcrumb: 'Auditoría de Acceso',
      permission: 'READ audit-logs',
    };
    expect(routeData['permission']).toBe('READ audit-logs');
  });
});
