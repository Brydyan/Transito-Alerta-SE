import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MenuOptionService } from './menu-option.service';
import { environment } from '../../../environments/environment';

describe('MenuOptionService', () => {
  let service: MenuOptionService;
  let http: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/menu-options`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MenuOptionService],
    });
    service = TestBed.inject(MenuOptionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  // ── CRUD ───────────────────────────────────────────────────────────────

  it('GET /menu-options returns all active options', (done) => {
    service.findAll().subscribe((items) => {
      expect(items.length).toBe(2);
      expect(items[0].name).toBe('Dashboard');
      done();
    });

    const req = http.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([
      { id: 'a1', name: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', display_order: 10, is_active: true, parent_id: null, created_at: '2026-09-01' },
      { id: 'a2', name: 'Inicio', route: '/inicio', icon: 'home', display_order: 20, is_active: true, parent_id: 'a1', created_at: '2026-09-01' },
    ]);
  });

  it('GET /menu-options/:id returns a single option', (done) => {
    service.findOne('a1').subscribe((item) => {
      expect(item.id).toBe('a1');
      expect(item.name).toBe('Dashboard');
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'a1', name: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', display_order: 10, is_active: true, parent_id: null, created_at: '2026-09-01' });
  });

  it('POST /menu-options creates a new option', (done) => {
    const payload = { name: 'Nuevo', route: '/nuevo', displayOrder: 30 };
    service.create(payload).subscribe((item) => {
      expect(item.id).toBe('b1');
      expect(item.name).toBe('Nuevo');
      done();
    });

    const req = http.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'b1', name: 'Nuevo', route: '/nuevo', icon: null, display_order: 30, is_active: true, parent_id: null, created_at: '2026-09-14' });
  });

  it('PATCH /menu-options/:id updates an option', (done) => {
    const payload = { name: 'Actualizado' };
    service.update('a1', payload).subscribe((item) => {
      expect(item.name).toBe('Actualizado');
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'a1', name: 'Actualizado', route: '/dashboard', icon: 'layout-dashboard', display_order: 10, is_active: true, parent_id: null, created_at: '2026-09-01' });
  });

  it('DELETE /menu-options/:id removes an option', (done) => {
    service.delete('a1').subscribe((result) => {
      expect(result).toBeNull();
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  // ── Role matrix ────────────────────────────────────────────────────────

  it('GET /menu-options/:id/roles returns matrix grouped by scope', (done) => {
    service.getRoleMatrix('a1').subscribe((matrix) => {
      expect(matrix.platform.length).toBe(2);
      expect(matrix.organization.length).toBe(1);
      expect(matrix.public.length).toBe(1);
      expect(matrix.platform[0].roleName).toBe('master');
      expect(matrix.platform[0].canRead).toBe(true);
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1/roles`);
    expect(req.request.method).toBe('GET');
    req.flush({
      platform: [
        { roleId: 'r1', roleName: 'master', canRead: true, canWrite: true },
        { roleId: 'r2', roleName: 'operador_sistema', canRead: true, canWrite: false },
      ],
      organization: [
        { roleId: 'r3', roleName: 'admin_org', canRead: false, canWrite: false },
      ],
      public: [
        { roleId: 'r5', roleName: 'reporter', canRead: false, canWrite: false },
      ],
    });
  });

  it('PUT /menu-options/:id/roles/:roleId sets role access', (done) => {
    service.setRoleAccess('a1', 'r1', { canRead: true, canWrite: false }).subscribe((result) => {
      expect(result.canRead).toBe(true);
      expect(result.canWrite).toBe(false);
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1/roles/r1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ canRead: true, canWrite: false });
    req.flush({ menuOptionId: 'a1', roleId: 'r1', canRead: true, canWrite: false });
  });

  // ── Endpoint assignment ────────────────────────────────────────────────

  it('PUT /menu-options/:id/endpoints assigns endpoints', (done) => {
    service.assignEndpoints('a1', { endpointIds: ['e1', 'e2'] }).subscribe((result) => {
      expect(result.length).toBe(2);
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1/endpoints`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ endpointIds: ['e1', 'e2'] });
    req.flush([
      { menuOptionId: 'a1', endpointId: 'e1' },
      { menuOptionId: 'a1', endpointId: 'e2' },
    ]);
  });

  it('GET /menu-options/endpoints returns paginated catalog', (done) => {
    service.getEndpointCatalog({ page: 1, limit: 10 }).subscribe((result) => {
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      done();
    });

    const req = http.expectOne(`${baseUrl}/endpoints?page=1&limit=10`);
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        { id: 'e1', method: 'GET', path: '/api/users', description: 'List users' },
        { id: 'e2', method: 'POST', path: '/api/users', description: 'Create user' },
      ],
      total: 50,
      page: 1,
      limit: 10,
    });
  });

  it('GET /menu-options/endpoints supports filter params', (done) => {
    service.getEndpointCatalog({ page: 1, limit: 20, route: 'users', method: 'GET' }).subscribe((result) => {
      expect(result.data.length).toBe(1);
      done();
    });

    const req = http.expectOne(`${baseUrl}/endpoints?page=1&limit=20&route=users&method=GET`);
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [{ id: 'e1', method: 'GET', path: '/api/users', description: 'List users' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  // ── sc-334 admin-controles-enhancements Phase 2 ────────────────────

  it('GET /menu-options/:id/endpoints returns the assigned endpoints (D1/R1)', (done) => {
    service.getAssignedEndpoints('a1').subscribe((endpoints) => {
      expect(endpoints.length).toBe(2);
      expect(endpoints[0].id).toBe('e1');
      expect(endpoints[0].path).toBe('/api/incidents');
      expect(endpoints[1].id).toBe('e2');
      done();
    });

    const req = http.expectOne(`${baseUrl}/a1/endpoints`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([
      { id: 'e1', method: 'GET', path: '/api/incidents', description: 'List incidents' },
      { id: 'e2', method: 'POST', path: '/api/incidents', description: 'Create incident' },
    ]);
  });

  it('GET /menu-options/:id/endpoints returns empty array when nothing is assigned', (done) => {
    service.getAssignedEndpoints('a2').subscribe((endpoints) => {
      expect(endpoints).toEqual([]);
      done();
    });

    const req = http.expectOne(`${baseUrl}/a2/endpoints`);
    req.flush([]);
  });

  it('GET /menu-options/endpoints forwards module filter as query param (D6/R6)', (done) => {
    service.getEndpointCatalog({ page: 1, limit: 20, module: 'incidents' }).subscribe(() => done());

    const req = http.expectOne(`${baseUrl}/endpoints?page=1&limit=20&module=incidents`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('GET /menu-options/endpoints omits module param when empty/whitespace', (done) => {
    service.getEndpointCatalog({ module: '   ' }).subscribe(() => done());

    const req = http.expectOne(`${baseUrl}/endpoints`);
    expect(req.request.params.has('module')).toBe(false);
    req.flush({ data: [], total: 0, page: 1, limit: 20 });
  });
});
