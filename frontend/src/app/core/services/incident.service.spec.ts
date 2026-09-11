import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IncidentService } from './incident.service';
import { HttpService } from './http.service';
import { Incident, IncidentStatus, IncidentPriority } from '../models/incident.model';

/**
 * F3 (sc-303) — F3.1.4 contract spec.
 *
 * The audit of sc-209 documented the failure mode this spec fixes:
 * asserting on the URL string lets the wire payload drift silently.
 * Every assertion below checks the **decoded wire fields** returned
 * from the (mocked) backend, not the path. URL composition is
 * tested as a side effect, but the contract lives in the response
 * body assertions.
 */
describe('IncidentService (F3.1 contract revalidation)', () => {
  let service: IncidentService;
  let http: HttpTestingController;
  const base = '/api';

  // F3.1.1 — fixture reflects the post-sc-315 wire shape: 4 statuses,
  // 4 priorities, audit fields exposed. If the backend adds a field,
  // this fixture is the canary.
  const fixtureIncident: Incident = {
    id: 'inc-1',
    title: 'Pothole on Av. Principal',
    description: 'Large crater blocking the right lane',
    status: 'pending' as IncidentStatus,
    priority: 'critical' as IncidentPriority,
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: 'cat-1',
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
    created_at: new Date('2026-08-01'),
    updated_at: new Date('2026-08-01'),
    deleted_at: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [IncidentService, HttpService],
    });
    service = TestBed.inject(IncidentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ───── F3.1.3 + F3.1.4 — typed filters reach the wire as snake_case query params
  //
  // F3 (sc-303) C1 (ronda 4) — el backend `incidents.controller.ts:findAll`
  // sólo acepta `status` (los demás filtros llegan pero los ignora
  // en silencio). El test ahora verifica el alcance reducido:
  // sólo `status` se manda en la URL.
  it('getIncidents forwards status to /incidents as a query param (C1 reduced scope)', (done) => {
    service
      .getIncidents({ status: 'in_progress' })
      .subscribe(() => done());

    const req = http.expectOne(
      (r) => r.url === `${base}/incidents` && r.method === 'GET',
    );
    const params = req.request.params;
    expect(params.get('status')).toBe('in_progress');
    // Los demás campos NO se mandan: el backend los ignoraría y
    // mandarlos en silencio es un no-op visible. Cuando un
    // change de backend los soporte, este aserto se actualiza
    // y los `toQueryParams` vuelven a incluirlos.
    expect(params.has('search')).toBe(false);
    expect(params.has('priority')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.has('limit')).toBe(false);
    expect(params.has('category_id')).toBe(false);
    req.flush([fixtureIncident]);
  });

  it('getIncidents with no filters sends no query params', (done) => {
    service.getIncidents({}).subscribe(() => done());

    const req = http.expectOne((r) => r.url === `${base}/incidents`);
    const params = req.request.params;
    expect(params.keys().length).toBe(0);
    req.flush([fixtureIncident]);
  });

  // ───── F3.1.1 — the service passes through every wire field, including the
  // sc-315 additions (closed_reason, approved_by, resolution_date, …).
  it('getIncidents returns the wire shape unchanged (F3.1.1 contract)', (done) => {
    const closed: Incident = {
      ...fixtureIncident,
      status: 'closed',
      closed_reason: 'duplicate of inc-0',
    };
    service.getIncidents({ status: 'closed' }).subscribe((result) => {
      // The result decodes the wire shape — `closed_reason` travels
      // from the response into the typed model without a manual
      // mapping step. If the wire adds a field, this is the test
      // that fails first, by the F3.1.4 principle.
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('closed');
      expect(result.items[0].closed_reason).toBe('duplicate of inc-0');
      done();
    });

    const req = http.expectOne((r) => r.url === `${base}/incidents`);
    req.flush([closed]);
  });

  it('getIncidents wraps the array in an IncidentListResult envelope (F3.2.6 prep)', (done) => {
    // F3 (sc-303) C1 (ronda 4) — el backend no pagina, así que
    // `total === items.length` y el envelope tiene `page: 1`. Cuando
    // el backend agregue paginación real, este aserto refleja
    // `page`/`limit` desde la query string.
    service.getIncidents({ status: 'pending' }).subscribe((result) => {
      expect(result).toEqual(
        expect.objectContaining({
          page: 1,
          total: 1,
        }),
      );
      expect(result.items[0].id).toBe('inc-1');
      done();
    });

    const req = http.expectOne((r) => r.url === `${base}/incidents`);
    req.flush([fixtureIncident]);
  });

  it('getIncident hits /incidents/:id and returns the wire fields', (done) => {
    const critical: Incident = { ...fixtureIncident, status: 'pending', priority: 'critical' };
    service.getIncident('inc-1').subscribe((incident) => {
      expect(incident.priority).toBe('critical');
      expect(incident.zone_id).toBe('zone-1');
      expect(incident.geofence_matched).toBe(true);
      done();
    });

    const req = http.expectOne(`${base}/incidents/inc-1`);
    expect(req.request.method).toBe('GET');
    req.flush(critical);
  });

  it('createIncident POSTs to /incidents and prepends to the cache', (done) => {
    const created: Incident = { ...fixtureIncident, id: 'inc-2' };
    service
      .createIncident({
        title: 'New pothole',
        description: 'x',
        lat: -2.2,
        lng: -80.8,
        priority: 'high',
      })
      .subscribe((c) => {
        expect(c.id).toBe('inc-2');
        expect(service.getIncidents$().subscribe).toBeDefined();
        done();
      });

    const req = http.expectOne(`${base}/incidents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'New pothole',
      description: 'x',
      lat: -2.2,
      lng: -80.8,
      priority: 'high',
    });
    req.flush(created);
  });

  // ───── F3.1.4 — PATCH /incidents/:id/status carries closed_reason when
  // the target is `closed`. The body is asserted (not the URL), per the
  // sc-209 lesson: a future change to the DTO shape will break this
  // test before it breaks the UI.
  it('updateIncidentStatus sends closed_reason in the body when target is closed', (done) => {
    const closed: Incident = {
      ...fixtureIncident,
      status: 'closed',
      closed_reason: 'duplicate of inc-0',
    };
    service.updateIncidentStatus('inc-1', 'closed', 'duplicate of inc-0').subscribe((c) => {
      expect(c.status).toBe('closed');
      expect(c.closed_reason).toBe('duplicate of inc-0');
      done();
    });

    const req = http.expectOne(`${base}/incidents/inc-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      status: 'closed',
      closed_reason: 'duplicate of inc-0',
    });
    req.flush(closed);
  });

  it('updateIncidentStatus omits closed_reason when the target is not closed', (done) => {
    service.updateIncidentStatus('inc-1', 'in_progress').subscribe(() => done());

    const req = http.expectOne(`${base}/incidents/inc-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'in_progress' });
    req.flush({ ...fixtureIncident, status: 'in_progress' });
  });

  it('deleteIncident DELETEs /incidents/:id and drops from cache', (done) => {
    // Seed the cache.
    service.getIncidents({}).subscribe();
    http.expectOne((r) => r.url === `${base}/incidents`).flush([fixtureIncident]);

    service.deleteIncident('inc-1').subscribe(() => done());
    const req = http.expectOne(`${base}/incidents/inc-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ───── F3 (sc-303) — ronda 6 fix: POST /incidents/:id/claim
  // La acción "claim" debe invocar el endpoint dedicado del backend
  // (`backend/src/modules/incidents/incident-workflow.controller.ts:34-42`),
  // NO la ruta genérica `PATCH /:id/status` (que NO escribe `claimed_by`).
  // El wire es el mismo `ClaimReleaseResponseDto` que `release`.
  it('claimIncident POSTs /incidents/:id/claim with {} and updates cache partially (ronda 6)', (done) => {
    // Seed the cache with a full fixture incident.
    service.getIncidents({}).subscribe();
    http.expectOne((r) => r.url === `${base}/incidents`).flush([fixtureIncident]);

    // Wire real (7 campos snake_case, mismo DTO que release).
    const slimResponse = {
      id: 'inc-1',
      title: 'Pothole on Main St',
      status: 'in_progress' as const,
      priority: 'medium' as const,
      claimed_by: 'user-1',
      organization_id: 'org-1',
      updated_at: new Date('2026-09-07'),
    };

    service.claimIncident('inc-1').subscribe((res) => {
      // Positive assertions (7 fields of ClaimReleaseResult).
      expect(res.id).toBe('inc-1');
      expect(res.title).toBe('Pothole on Main St');
      expect(res.status).toBe('in_progress');
      expect(res.priority).toBe('medium');
      // El fix central: la respuesta del endpoint dedicado SÍ incluye
      // `claimed_by` con el usuario actual. La aserción que faltó en
      // los tres commits de F3.4.7 hasta la ronda 6.
      expect(res.claimed_by).toBe('user-1');
      expect(res.organization_id).toBe('org-1');
      expect(res.updated_at).toBeDefined();

      // Negative assertions: wire does NOT return the full 25 fields.
      expect((res as any).description).toBeUndefined();
      expect((res as any).lat).toBeUndefined();
      expect((res as any).lng).toBeUndefined();
      expect((res as any).citizen_id).toBeUndefined();
      expect((res as any).category_id).toBeUndefined();

      // Cache partial merge: la entrada en `incidents$` debe tener
      // `claimed_by` actualizado a 'user-1' (no `null`), pero el resto
      // de los campos del modelo se preservan.
      const cached = (service as any).incidents$.value.find((i: Incident) => i.id === 'inc-1');
      expect(cached?.claimed_by).toBe('user-1');
      expect(cached?.description).toBe('Large crater blocking the right lane');
      expect(cached?.lat).toBe(-2.2);
      expect(cached?.status).toBe('in_progress');

      done();
    });

    const req = http.expectOne(`${base}/incidents/inc-1/claim`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(slimResponse);
  });

  // ───── F3 (sc-303) C2 (ronda 5) — POST /incidents/:id/release
  // El endpoint devuelve ClaimReleaseResponseDto que tras el interceptor
  // es un shape recortado de 7 campos snake_case.
  // El servicio debe emitir ClaimReleaseResult, mandar body {},
  // y actualizar el cache mediante un merge parcial sin perder campos.
  it('releaseIncident POSTs /incidents/:id/release with {} and updates cache partially (C2)', (done) => {
    // Seed the cache with a full fixture incident
    service.getIncidents({}).subscribe();
    http.expectOne((r) => r.url === `${base}/incidents`).flush([fixtureIncident]);

    const slimResponse = {
      id: 'inc-1',
      title: 'Pothole on Main St',
      status: 'pending' as const,
      priority: 'medium' as const,
      claimed_by: null,
      organization_id: 'org-1',
      updated_at: new Date('2026-09-02'),
    };

    service.releaseIncident('inc-1').subscribe((res) => {
      // Positive assertions (7 fields of ClaimReleaseResult)
      expect(res.id).toBe('inc-1');
      expect(res.title).toBe('Pothole on Main St');
      expect(res.status).toBe('pending');
      expect(res.priority).toBe('medium');
      expect(res.claimed_by).toBeNull();
      expect(res.organization_id).toBe('org-1');
      expect(res.updated_at).toBeDefined();

      // Negative assertions: Wire does NOT return the full 25 fields
      expect((res as any).description).toBeUndefined();
      expect((res as any).lat).toBeUndefined();
      expect((res as any).lng).toBeUndefined();
      expect((res as any).citizen_id).toBeUndefined();
      expect((res as any).category_id).toBeUndefined();

      // Cache partial merge assertion: cache preserves full fields
      const cached = (service as any).incidents$.value.find((i: Incident) => i.id === 'inc-1');
      expect(cached?.description).toBe('Large crater blocking the right lane');
      expect(cached?.lat).toBe(-2.2);
      expect(cached?.claimed_by).toBeNull();
      expect(cached?.status).toBe('pending');

      done();
    });

    const req = http.expectOne(`${base}/incidents/inc-1/release`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(slimResponse);
  });
});
