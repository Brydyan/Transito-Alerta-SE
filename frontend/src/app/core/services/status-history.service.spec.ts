import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StatusHistoryService } from './status-history.service';
import { HttpService } from './http.service';
import { StatusHistoryEntry, StatusHistoryListResult } from '../models/status-history.model';

/**
 * F3 (sc-303) — F3.1.6 status-history spec.
 *
 * Contract assertions on the wire (not the URL) — mirrors the F3.1.4
 * principle. The endpoint is `GET /incidents/:incidentId/status-history`
 * (nested resource, not a flat `?incident_id=` query). The backend
 * controller declares an explicit resource override; replicating
 * that in the spec catches any future change to the path.
 */
describe('StatusHistoryService (F3.1.6)', () => {
  let service: StatusHistoryService;
  let http: HttpTestingController;
  const base = 'http://localhost:3001/api';

  const fixtureEntry: StatusHistoryEntry = {
    id: 'sh-1',
    incident_id: 'inc-1',
    changed_by_user_id: 'user-1',
    previous_status: 'pending',
    new_status: 'in_progress',
    notes: null,
    event_id: 'evt-1',
    created_at: new Date('2026-08-01T10:00:00Z'),
  };

  const fixtureList: StatusHistoryListResult = {
    items: [fixtureEntry],
    total: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StatusHistoryService, HttpService],
    });
    service = TestBed.inject(StatusHistoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getStatusHistory hits the nested /incidents/:id/status-history path', (done) => {
    service.getStatusHistory('inc-1').subscribe((result) => {
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('sh-1');
      expect(result.items[0].previous_status).toBe('pending');
      expect(result.items[0].new_status).toBe('in_progress');
      done();
    });

    const req = http.expectOne(`${base}/incidents/inc-1/status-history`);
    expect(req.request.method).toBe('GET');
    // Confirm we are NOT using a flat /status-history?incident_id=…
    // (the controller explicitly overrides the resource inference
    // — flipping this to the wrong URL would silently leak the
    // audit trail to any caller holding `READ incidents`).
    expect(req.request.url).not.toContain('?incident_id=');
    req.flush(fixtureList);
  });

  it('getStatusHistory populates the cache for the same incident', (done) => {
    service.getStatusHistory('inc-1').subscribe(() => {
      // The cache is keyed by incident id; the entry the timeline
      // needs is the same wire shape the backend returned.
      const cached = service.getCached('inc-1');
      expect(cached).not.toBeNull();
      expect(cached![0].id).toBe('sh-1');
      expect(cached![0].new_status).toBe('in_progress');
      done();
    });

    http.expectOne(`${base}/incidents/inc-1/status-history`).flush(fixtureList);
  });

  it('getCached returns null when the incident has not been fetched', () => {
    expect(service.getCached('never-fetched')).toBeNull();
  });

  it('invalidate drops a single incident from the cache', (done) => {
    service.getStatusHistory('inc-1').subscribe(() => {
      expect(service.getCached('inc-1')).not.toBeNull();
      service.invalidate('inc-1');
      expect(service.getCached('inc-1')).toBeNull();
      done();
    });
    http.expectOne(`${base}/incidents/inc-1/status-history`).flush(fixtureList);
  });

  it('clearCache wipes the whole map', (done) => {
    service.getStatusHistory('inc-1').subscribe(() => {
      service.getStatusHistory('inc-2').subscribe(() => {
        expect(service.getCached('inc-1')).not.toBeNull();
        expect(service.getCached('inc-2')).not.toBeNull();
        service.clearCache();
        expect(service.getCached('inc-1')).toBeNull();
        expect(service.getCached('inc-2')).toBeNull();
        done();
      });
      http.expectOne(`${base}/incidents/inc-2/status-history`).flush(fixtureList);
    });
    http.expectOne(`${base}/incidents/inc-1/status-history`).flush(fixtureList);
  });
});
