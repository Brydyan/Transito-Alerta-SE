import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { RolesService } from './roles.service';
import { environment } from '../../../../../environments/environment';

/**
 * F6 fix batch (W.2) — `RolesService` dedicado, cubre los 3 métodos
 * añadidos en el rediseño (`getRoles(page, limit, search?)`,
 * `getRoleStats()`, `deleteRole(id)`). Los métodos preexistentes
 * (`getRoleById`, `getAllPermissions`, `updateRole`) quedan
 * cubiertos por specs de los componentes que los consumen
 * (`role-editor.component.spec.ts`); la prioridad de este spec es
 * asentar el contrato del service rediseñado.
 */
describe('RolesService (F6 rediseño)', () => {
  let service: RolesService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/roles`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RolesService],
    });
    service = TestBed.inject(RolesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getRoles — envía page, limit y search como query params', () => {
    service.getRoles(2, 10, 'admin').subscribe((roles) => {
      expect(roles.length).toBe(2);
    });
    const req = http.expectOne(
      (r) =>
        r.url === base &&
        r.params.get('page') === '2' &&
        r.params.get('limit') === '10' &&
        r.params.get('search') === 'admin',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([
      { rolId: 1, nombre: 'admin_sistema', permissionCount: 48 },
      { rolId: 2, nombre: 'admin_organizacion', permissionCount: 24 },
    ]);
  });

  it('getRoles — sin search no agrega el param', () => {
    service.getRoles(1, 25).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === base &&
        r.params.get('page') === '1' &&
        r.params.get('limit') === '25' &&
        !r.params.has('search'),
    );
    req.flush([]);
  });

  it('getRoles — aplana el envelope { data, meta }', () => {
    service.getRoles().subscribe((roles) => {
      expect(roles).toEqual([
        { rolId: 1, nombre: 'admin_sistema' },
      ]);
    });
    // `getRoles()` con defaults envía `page=1&limit=25` como
    // query params; el matcher acepta ambos.
    const req = http.expectOne(
      (r) => r.url === base && r.params.get('page') === '1',
    );
    req.flush({ data: [{ rolId: 1, nombre: 'admin_sistema' }], meta: { total: 1, page: 1, last_page: 1, per_page: 25 } });
  });

  it('getRoleStats — aplana el envelope y devuelve RoleStats', () => {
    service.getRoleStats().subscribe((stats) => {
      expect(stats).toEqual({
        totalPermissions: 124,
        protectedModules: 12,
        assignedUsers: 85,
      });
    });
    const req = http.expectOne(`${base}/stats`);
    expect(req.request.method).toBe('GET');
    req.flush({
      data: { totalPermissions: 124, protectedModules: 12, assignedUsers: 85 },
      meta: { generated_at: '2026-09-08T00:00:00Z' },
    });
  });

  it('getRoleStats — fallback a ceros si la respuesta viene vacía', () => {
    service.getRoleStats().subscribe((stats) => {
      expect(stats).toEqual({
        totalPermissions: 0,
        protectedModules: 0,
        assignedUsers: 0,
      });
    });
    const req = http.expectOne(`${base}/stats`);
    req.flush({});
  });

  it('deleteRole — DELETE con withCredentials', () => {
    service.deleteRole(5).subscribe();
    const req = http.expectOne(`${base}/5`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush(204, { status: 204, statusText: 'No Content' });
  });

  // F6 (mock 04-02): `POST /api/roles` para crear un rol nuevo.
  // El body lleva `name` (requerido), `description?` y `permissions?`
  // (array de UUIDs). El backend (`CreateRoleDto`) rechaza nombres
  // < 2 chars, así que el service NO sanitiza — el rol-editor ya
  // valida con `canSave()` antes de llamar.
  it('createRole — POST con name, description, permissions y withCredentials', () => {
    service
      .createRole({
        name: 'operador_campo',
        description: 'Rol para operadores en campo',
        permissions: ['uuid-1', 'uuid-2'],
      })
      .subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({
      name: 'operador_campo',
      description: 'Rol para operadores en campo',
      permissions: ['uuid-1', 'uuid-2'],
    });
    req.flush({ id: 'new-uuid', name: 'operador_campo', permissions: ['uuid-1', 'uuid-2'] });
  });

  it('createRole — description opcional puede omitirse', () => {
    service.createRole({ name: 'sin_desc', permissions: [] }).subscribe();
    const req = http.expectOne(base);
    expect(req.request.body).toEqual({ name: 'sin_desc', permissions: [] });
    req.flush({ id: 'new-uuid', name: 'sin_desc', permissions: [] });
  });
});
