import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssignmentService, AssignmentResult, OperatorWorkload, Assignment } from './assignment.service';
import { HttpService } from './http.service';

/**
 * Phase 2 TDD — assignment.service.spec.ts
 *
 * Tests follow the F3 contract-revalidation pattern: assert on decoded
 * wire fields, not on URL strings. Every method is tested independently
 * with a fixture that mirrors the backend wire shape.
 *
 * Strict TDD cycle:
 *   RED  — tests written first, service doesn't exist yet.
 *   GREEN — service implemented to make tests pass.
 */
describe('AssignmentService', () => {
  let service: AssignmentService;
  let http: HttpTestingController;
  const base = '/api';

  const fixtureAssignment: AssignmentResult = {
    id: 'assign-1',
    incident_id: 'inc-1',
    operator_id: 'op-1',
    role: 'primary',
    created_at: new Date('2026-09-23'),
    updated_at: new Date('2026-09-23'),
    deleted_at: null,
  };

  const fixtureWorkload: OperatorWorkload = {
    count: 3,
    operator_id: 'op-1',
  };

  const fixtureLatest: Assignment | null = {
    id: 'assign-1',
    incident_id: 'inc-1',
    operator_id: 'op-1',
    role: 'primary',
    operator_name: 'Juan Pérez',
    created_at: new Date('2026-09-23'),
    updated_at: new Date('2026-09-23'),
    deleted_at: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AssignmentService, HttpService],
    });
    service = TestBed.inject(AssignmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ───── assign() ────────────────────────────────────────────────────

  it('assign() posts to /assignments and returns AssignmentResult', (done) => {
    service.assign('inc-1', 'op-1').subscribe((result) => {
      expect(result.id).toBe('assign-1');
      expect(result.incident_id).toBe('inc-1');
      expect(result.operator_id).toBe('op-1');
      done();
    });

    const req = http.expectOne(`${base}/assignments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ incident_id: 'inc-1', operator_id: 'op-1' });
    req.flush(fixtureAssignment);
  });

  it('assign() propagates 409 ConflictException from backend', (done) => {
    service.assign('inc-1', 'op-1').subscribe({
      next: () => fail('should have errored'),
      error: (err) => {
        expect(err.status).toBe(409);
        done();
      },
    });

    const req = http.expectOne(`${base}/assignments`);
    req.flush({ message: 'Incident inc-1 is already assigned' }, { status: 409, statusText: 'Conflict' });
  });

  // ───── getOperatorWorkload() ────────────────────────────────────────

  it('getOperatorWorkload() gets /assignments/operator/:id/count', (done) => {
    service.getOperatorWorkload('op-1').subscribe((result) => {
      expect(result.count).toBe(3);
      expect(result.operator_id).toBe('op-1');
      done();
    });

    const req = http.expectOne(`${base}/assignments/operator/op-1/count`);
    expect(req.request.method).toBe('GET');
    req.flush(fixtureWorkload);
  });

  // ───── getAvailableOperators() ────────────────────────────────────

  it('getAvailableOperators() calls /operators/locations to get available operators', (done) => {
    const fixtureOps = [{ user_id: 'op-1', lat: 0, lng: 0, updated_at: '2026-09-23' }];
    service.getAvailableOperators().subscribe((ops) => {
      expect(Array.isArray(ops)).toBe(true);
      done();
    });

    const req = http.expectOne(`${base}/operators/locations`);
    expect(req.request.method).toBe('GET');
    req.flush({ operators: fixtureOps });
  });

  // ───── getLatestAssignment() ───────────────────────────────────────

  it('getLatestAssignment() gets /assignments/incident/:id and returns first active item', (done) => {
    service.getLatestAssignment('inc-1').subscribe((result) => {
      expect(result).not.toBeNull();
      expect(result!.incident_id).toBe('inc-1');
      done();
    });

    const req = http.expectOne(`${base}/assignments/incident/inc-1`);
    expect(req.request.method).toBe('GET');
    req.flush([fixtureLatest]);
  });

  it('getLatestAssignment() returns null when no assignments exist', (done) => {
    service.getLatestAssignment('inc-empty').subscribe((result) => {
      expect(result).toBeNull();
      done();
    });

    const req = http.expectOne(`${base}/assignments/incident/inc-empty`);
    req.flush([]);
  });
});
