import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { AssignDialogComponent } from './assign-dialog.component';
import {
  AssignmentService,
  AvailableOperatorForIncident,
} from '../../../core/services/assignment.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * 2026-10-17-F7-dispatch-ui — spec del modal de despacho que se abre
 * cuando el admin_org hace click en "Asignar" sobre un incidente.
 *
 * Cubre el flow feliz + override (operador saturado + incident critical)
 * + errores específicos del backend (409 ya-asignado, 429 cap-reached,
 * 422 override-reason-required, 403 wrong-org).
 */
describe('AssignDialogComponent (F7-dispatch 2026-10-17)', () => {
  let component: AssignDialogComponent;
  let fixture: ComponentFixture<AssignDialogComponent>;
  let mockAssignments: {
    getAvailableOperatorsForIncident: jest.Mock;
    assign: jest.Mock;
    release: jest.Mock;
    reassign: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock; warning: jest.Mock; info: jest.Mock };

  const OPS: AvailableOperatorForIncident[] = [
    { id: 'op-1', name: 'Alice',  email: 'a@x.com', activeClaimCount: 1, available: true,  maxActive: 3 },
    { id: 'op-2', name: 'Bob',    email: null,       activeClaimCount: 3, available: false, maxActive: 3 },
    { id: 'op-3', name: 'Carol',  email: 'c@x.com', activeClaimCount: 0, available: true,  maxActive: 3 },
  ];

  function setup(opts: {
      incidentId?: string;
      incidentPriority?: 'low' | 'medium' | 'high' | 'critical';
      existingAssignmentId?: string;
    } = {}) {
    mockAssignments = {
      getAvailableOperatorsForIncident: jest.fn().mockReturnValue(of(OPS)),
      assign: jest.fn().mockReturnValue(
        of({ id: 'assign-new', incident_id: 'inc-1', operator_id: 'op-1', role: 'primary', created_at: new Date(), updated_at: new Date(), deleted_at: null }),
      ),
      release: jest.fn().mockReturnValue(of(undefined)),
      reassign: jest.fn().mockReturnValue(
        of({ id: 'assign-existing', incident_id: 'inc-1', operator_id: 'op-1', role: 'primary', created_at: new Date(), updated_at: new Date(), deleted_at: null }),
      ),
    };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
    TestBed.configureTestingModule({
      imports: [AssignDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: AssignmentService, useValue: mockAssignments },
        { provide: ToastService, useValue: mockToast },
      ],
    });
    fixture = TestBed.createComponent(AssignDialogComponent);
    component = fixture.componentInstance;
    // 2026-10-17 — `input.required<string>()` se bindea con
    // `componentRef.setInput()` ANTES del primer `detectChanges`,
    // para que el `effect()` que dispara `loadOperators()` lea
    // el valor correcto en su primera ejecución.
    fixture.componentRef.setInput('incidentId', opts.incidentId ?? 'inc-1');
    fixture.componentRef.setInput('incidentPriority', opts.incidentPriority ?? 'critical');
    fixture.componentRef.setInput('existingAssignmentId', opts.existingAssignmentId ?? null);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return { fixture, component };
  }

  it('al abrir: carga la lista de operadores vía getAvailableOperatorsForIncident', () => {
    const { component } = setup();
    expect(mockAssignments.getAvailableOperatorsForIncident).toHaveBeenCalledWith('inc-1');
    expect(component.availableOperators().length).toBe(3);
    expect(component.loading()).toBe(false);
  });

  it('muestra "3 de 3" para operadores saturados y "1 de 3" para los disponibles', () => {
    const { fixture } = setup();
    const html = fixture.nativeElement.textContent ?? '';
    expect(html).toContain('3 de 3');
    expect(html).toContain('1 de 3');
    expect(html).toContain('0 de 3');
  });

  it('selección de un operador disponible → habilita submit (sin override form)', () => {
    const { component } = setup();
    component.selectOperator(OPS[0]); // Alice, available
    expect(component.selectedOperatorId()).toBe('op-1');
    expect(component.overrideMode()).toBe(false);
    expect(component.canSubmit()).toBe(true);
  });

  it('selección de un operador saturado en critical → activa override mode', () => {
    const { component } = setup({ incidentPriority: 'critical' });
    component.selectOperator(OPS[1]); // Bob, saturated
    expect(component.overrideMode()).toBe(true);
    expect(component.canSubmit()).toBe(false); // falta override_reason
  });

  it('selección de un operador saturado en non-critical → NO permite override', () => {
    const { component } = setup({ incidentPriority: 'high' });
    component.selectOperator(OPS[1]);
    expect(component.overrideMode()).toBe(false);
    expect(component.canSubmit()).toBe(false); // saturated sin override path
  });

  it('override con razón válida → habilita submit', () => {
    const { component } = setup({ incidentPriority: 'critical' });
    component.selectOperator(OPS[1]);
    component.overrideReason.set('Emergencia nacional');
    expect(component.canSubmit()).toBe(true);
  });

  it('submit en flow normal: llama assign() sin override fields', () => {
    const { component } = setup();
    const closedSpy = jest.spyOn(component.closed, 'emit');
    component.selectOperator(OPS[0]);
    component.submit();
    expect(mockAssignments.assign).toHaveBeenCalledWith(
      'inc-1',
      'op-1',
      { overrideCap: undefined, overrideReason: undefined },
    );
    expect(mockToast.success).toHaveBeenCalled();
    expect(closedSpy).toHaveBeenCalled();
  });

  it('submit en override: llama assign() con override_cap + override_reason', () => {
    const { component } = setup({ incidentPriority: 'critical' });
    component.selectOperator(OPS[1]);
    component.overrideReason.set('Emergencia activa');
    component.submit();
    expect(mockAssignments.assign).toHaveBeenCalledWith(
      'inc-1',
      'op-2',
      { overrideCap: true, overrideReason: 'Emergencia activa' },
    );
  });

  it('submit con existingAssignmentId: usa reassign() en lugar de assign()', () => {
    const { component } = setup({ existingAssignmentId: 'assign-old' });
    component.selectOperator(OPS[0]);
    component.submit();
    expect(mockAssignments.reassign).toHaveBeenCalledWith(
      'assign-old',
      'op-1',
      { overrideCap: undefined, overrideReason: undefined },
    );
    expect(mockAssignments.assign).not.toHaveBeenCalled();
  });

  it('error 409 (ya asignado): muestra toast y mantiene el dialog abierto', () => {
    const { component } = setup();
    mockAssignments.assign.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Ya existe una asignación activa' },
          }),
      ),
    );
    component.selectOperator(OPS[0]);
    component.submit();
    expect(mockToast.error).toHaveBeenCalled();
    expect(component.open()).toBe(true);
  });

  it('error 429 (cap reached sin override): mensaje específico con código backend', () => {
    // El backend emite `code: 'CLAIM_LIMIT_REACHED'` en el body.
    // El toast lo muestra tal cual (sin reescribir) — el admin
    // master reconoce el código y sabe que debe re-intentar con
    // override_cap. Si el body no trae mensaje, caemos al
    // fallback user-friendly.
    const { component } = setup();
    mockAssignments.assign.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            error: { code: 'CLAIM_LIMIT_REACHED', message: 'CLAIM_LIMIT_REACHED' },
          }),
      ),
    );
    component.selectOperator(OPS[0]);
    component.submit();
    expect(mockToast.error).toHaveBeenCalledWith(
      'CLAIM_LIMIT_REACHED',
      'Tope alcanzado',
    );
  });

  it('cancel(): emite closed y resetea estado', () => {
    const { component } = setup();
    const closedSpy = jest.spyOn(component.closed, 'emit');
    component.selectOperator(OPS[0]);
    component.cancel();
    expect(closedSpy).toHaveBeenCalled();
    expect(component.selectedOperatorId()).toBeNull();
  });
});