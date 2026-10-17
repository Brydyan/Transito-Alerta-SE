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
      next: () => done(new Error('should have errored')),
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

  it('getAvailableOperators() calls /operator/locations to get available operators', (done) => {
    const fixtureOps = [{ user_id: 'op-1', lat: 0, lng: 0, updated_at: '2026-09-23' }];
    service.getAvailableOperators().subscribe((ops) => {
      expect(Array.isArray(ops)).toBe(true);
      done();
    });

    const req = http.expectOne(`${base}/operator/locations`);
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

  // ───── 2026-10-17-F7-dispatch-ui ──────────────────────────────────
  // Nuevos métodos para soportar el modal de despacho del admin_org:
  //   - getAvailableOperatorsForIncident(incidentId) → GET /incidents/:id/available-operators
  //   - assign(..., opts) extendido con override_cap/override_reason
  //   - release(assignmentId) → DELETE /assignments/:id
  //   - reassign(assignmentId, operatorId, opts) → PATCH /assignments/:id
  // Los modelos de comunicación son los del backend (AvailableOperatorDto,
  // UpdateAssignmentDto) y se exponen como tipos públicos del service.

  describe('F7-dispatch: getAvailableOperatorsForIncident()', () => {
    it('hits GET /incidents/:id/available-operators and flattens the response', (done) => {
      const fixture = [
        {
          id: 'op-1',
          name: 'Alice',
          email: 'alice@x.com',
          activeClaimCount: 1,
          available: true,
          maxActive: 3,
        },
        {
          id: 'op-2',
          name: 'Bob',
          email: null,
          activeClaimCount: 3,
          available: false,
          maxActive: 3,
        },
      ];
      service.getAvailableOperatorsForIncident('inc-1').subscribe((ops) => {
        expect(ops.length).toBe(2);
        expect(ops[0].id).toBe('op-1');
        expect(ops[0].available).toBe(true);
        expect(ops[1].available).toBe(false);
        done();
      });

      const req = http.expectOne(`${base}/incidents/inc-1/available-operators`);
      expect(req.request.method).toBe('GET');
      req.flush(fixture);
    });

    it('returns [] when the incident has no organization (backend returns empty)', (done) => {
      service.getAvailableOperatorsForIncident('inc-empty').subscribe((ops) => {
        expect(ops).toEqual([]);
        done();
      });
      http.expectOne(`${base}/incidents/inc-empty/available-operators`).flush([]);
    });
  });

  describe('F7-dispatch: assign() with override fields', () => {
    it('sends override_cap=true + override_reason when provided', (done) => {
      service
        .assign('inc-1', 'op-1', { overrideCap: true, overrideReason: 'Emergencia activa' })
        .subscribe(() => done());
      const httpReq = http.expectOne(`${base}/assignments`);
      expect(httpReq.request.method).toBe('POST');
      expect(httpReq.request.body).toEqual({
        incident_id: 'inc-1',
        operator_id: 'op-1',
        override_cap: true,
        override_reason: 'Emergencia activa',
      });
      httpReq.flush(fixtureAssignment);
    });

    it('omits override fields when not provided (back-compat)', (done) => {
      service.assign('inc-1', 'op-1').subscribe(() => done());
      const httpReq = http.expectOne(`${base}/assignments`);
      expect(httpReq.request.body).toEqual({
        incident_id: 'inc-1',
        operator_id: 'op-1',
      });
      httpReq.flush(fixtureAssignment);
    });

    it('propagates 429 CLAIM_LIMIT_REACHED without swallowing it', (done) => {
      service
        .assign('inc-1', 'op-1', { overrideCap: true, overrideReason: 'x' })
        .subscribe({
          next: () => done.fail('expected error'),
          error: (err) => {
            expect(err.status).toBe(429);
            done();
          },
        });
      http.expectOne(`${base}/assignments`).flush(
        { message: 'CLAIM_LIMIT_REACHED', code: 'CLAIM_LIMIT_REACHED' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    });
  });

  describe('F7-dispatch: release() (DELETE)', () => {
    it('hits DELETE /assignments/:id', (done) => {
      service.release('assign-1').subscribe(() => done());
      const req = http.expectOne(`${base}/assignments/assign-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('F7-dispatch: reassign() (PATCH /:id)', () => {
    it('sends PATCH /assignments/:id with new operator + override fields', (done) => {
      service
        .reassign('assign-1', 'op-2', { overrideCap: true, overrideReason: 'Reasignación por baja' })
        .subscribe(() => done());
      const req = http.expectOne(`${base}/assignments/assign-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        operator_id: 'op-2',
        override_cap: true,
        override_reason: 'Reasignación por baja',
      });
      req.flush(fixtureAssignment);
    });
  });
});
