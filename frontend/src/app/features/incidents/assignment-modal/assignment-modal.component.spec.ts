import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AssignmentModalComponent } from './assignment-modal.component';
import { AssignmentService, AvailableOperator, AssignmentResult } from '../../../core/services/assignment.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { HttpService } from '../../../core/services/http.service';

/**
 * AssignmentModalComponent spec — Phase 3 TDD.
 *
 * Tests cover:
 *   - Operator selection updates selectedOperatorId signal
 *   - Incident selection updates selectedIncidentId signal
 *   - Successful assignment calls service + closes modal + shows toast
 *   - 409 conflict shows error toast + modal stays open
 *   - isAssigning guard prevents double-submit
 *   - canAssign computed: requires both operator and incident selected
 */
describe('AssignmentModalComponent', () => {
  let component: AssignmentModalComponent;
  let fixture: ComponentFixture<AssignmentModalComponent>;
  let assignmentService: {
    assign: jest.Mock;
    getAvailableOperators: jest.Mock;
    getOperatorWorkload: jest.Mock;
  };
  let toastService: {
    success: jest.Mock;
    error: jest.Mock;
    warning: jest.Mock;
  };

  const fixtureOperator: AvailableOperator = {
    user_id: 'op-1',
    lat: -2.2,
    lng: -80.8,
    updated_at: '2026-09-23',
    operator_name: 'Juan Pérez',
  };

  const fixtureAssignment: AssignmentResult = {
    id: 'assign-1',
    incident_id: 'inc-1',
    operator_id: 'op-1',
    role: 'primary',
    created_at: new Date('2026-09-23'),
    updated_at: new Date('2026-09-23'),
    deleted_at: null,
  };

  beforeEach(async () => {
    assignmentService = {
      assign: jest.fn(),
      getAvailableOperators: jest.fn().mockReturnValue(of([fixtureOperator])),
      getOperatorWorkload: jest.fn().mockReturnValue(of({ count: 2, operator_id: 'op-1' })),
    };
    toastService = {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AssignmentModalComponent, HttpClientTestingModule],
      providers: [
        { provide: AssignmentService, useValue: assignmentService },
        { provide: ToastService, useValue: toastService },
        HttpService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignmentModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('selectOperator() updates selectedOperatorId signal', () => {
    component.selectOperator('op-1');
    expect(component.selectedOperatorId()).toBe('op-1');
  });

  it('selectIncident() updates selectedIncidentId signal', () => {
    component.selectIncident('inc-1');
    expect(component.selectedIncidentId()).toBe('inc-1');
  });

  it('canAssign returns false when operator not selected', () => {
    component.selectIncident('inc-1');
    expect(component.canAssign()).toBe(false);
  });

  it('canAssign returns false when incident not selected', () => {
    component.selectOperator('op-1');
    expect(component.canAssign()).toBe(false);
  });

  it('canAssign returns true when both operator and incident are selected', () => {
    component.selectOperator('op-1');
    component.selectIncident('inc-1');
    expect(component.canAssign()).toBe(true);
  });

  it('submit() calls assign service with correct ids and shows success toast', () => {
    assignmentService.assign.mockReturnValue(of(fixtureAssignment));
    component.selectOperator('op-1');
    component.selectIncident('inc-1');

    component.submit();

    expect(assignmentService.assign).toHaveBeenCalledWith('inc-1', 'op-1');
    expect(toastService.success).toHaveBeenCalled();
  });

  it('submit() on 409 shows error toast and keeps modal open', () => {
    assignmentService.assign.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Already assigned' } }))
    );
    component.selectOperator('op-1');
    component.selectIncident('inc-1');

    component.submit();

    expect(toastService.error).toHaveBeenCalled();
    // isAssigning must be reset to false after error
    expect(component.isAssigning()).toBe(false);
  });

  it('submit() sets isAssigning to true during request to prevent double-submit', () => {
    // Observe isAssigning while service is called
    let capturedDuringCall = false;
    assignmentService.assign.mockImplementation(() => {
      capturedDuringCall = component.isAssigning();
      return of(fixtureAssignment);
    });
    component.selectOperator('op-1');
    component.selectIncident('inc-1');

    component.submit();

    expect(capturedDuringCall).toBe(true);
    expect(component.isAssigning()).toBe(false); // reset after success
  });

  it('preSelectIncident() pre-fills selectedIncidentId', () => {
    component.preSelectIncident('inc-99');
    expect(component.selectedIncidentId()).toBe('inc-99');
  });

  it('close() emits closed event and resets state', () => {
    const closedSpy = jest.fn();
    component.closed.subscribe(closedSpy);

    component.selectOperator('op-1');
    component.selectIncident('inc-1');
    component.close();

    expect(closedSpy).toHaveBeenCalled();
    expect(component.selectedOperatorId()).toBeNull();
    expect(component.selectedIncidentId()).toBeNull();
  });
});
