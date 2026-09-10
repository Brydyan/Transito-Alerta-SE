import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { UsersService } from './users.service';
import { environment } from '../../../../../environments/environment';

/**
 * F6 (`2026-09-08-f6-new-user-form`) — contrato del `UsersService`
 * para el `NewUserFormComponent`. Cubre los métodos nuevos:
 *
 *  - `getFormData()` — wrapper de `GET /api/users/form-data` (T5.4).
 *  - `createUserJson()` — `POST /api/users` con JSON snake_case
 *    (reemplaza el path FormData del `UserFormComponent` viejo para
 *    el alta; el `UserFormComponent` mantiene su `createUser()`
 *    legacy intacto, ver `apply-progress.md`).
 *  - `uploadAvatar()` — `PATCH /api/users/:id/avatar` con multipart
 *    bajo el campo `avatar` (T5.4, `UsersController.updateAvatar`).
 *  - `getRolePermissions()` — `GET /api/roles/:id/permissions` (R6,
 *    `RolesController.listPermissions`); devuelve `string[]`.
 *  - `getPermissionsCatalog()` — `GET /api/permissions?limit=100`
 *    (catálogo para derivar "SIN ACCESO" — D-frontend-5.a).
 *
 * El spec de los métodos preexistentes (`getUsers`, `getRoles`,
 * `getOrganizations`, etc.) sigue cubierto por los specs de los
 * componentes que los consumen.
 */
describe('UsersService (F6 new-user-form)', () => {
  let service: UsersService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/users`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UsersService],
    });
    service = TestBed.inject(UsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getFormData — GET /api/users/form-data y aplana { roles, organizations }', () => {
    service.getFormData().subscribe((data) => {
      expect(data.roles).toEqual([
        { id: 'r1', name: 'admin_org' },
        { id: 'r2', name: 'operador_org' },
      ]);
      expect(data.organizations).toEqual([
        { id: 'o1', name: 'GAD Norte' },
      ]);
    });
    const req = http.expectOne(`${base}/form-data`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      roles: [
        { id: 'r1', name: 'admin_org' },
        { id: 'r2', name: 'operador_org' },
      ],
      organizations: [{ id: 'o1', name: 'GAD Norte' }],
    });
  });

  it('createUserJson — POST /api/users con JSON snake_case (no FormData)', () => {
    const payload = {
      email: 'juan@municipio.gob.ec',
      first_name: 'Juan',
      last_name: 'Pérez',
      phone: '+593 99 999 9999',
      role_id: 'r1',
      organization_id: 'o1',
    };
    service.createUserJson(payload).subscribe((user) => {
      expect(user).toEqual({ id: 'new-id', email: payload.email });
    });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    // JSON body, no FormData — confirma que no viaja como multipart.
    expect(req.request.body instanceof FormData).toBe(false);
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'new-id', email: payload.email });
  });

  it('uploadAvatar — PATCH /api/users/:id/avatar con multipart y campo "avatar"', () => {
    const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    service.uploadAvatar('user-id', file).subscribe((user) => {
      expect(user).toEqual({ id: 'user-id' });
    });
    const req = http.expectOne(`${base}/user-id/avatar`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);
    const body = req.request.body as FormData;
    expect(body.has('avatar')).toBe(true);
    expect((body.get('avatar') as File).name).toBe('avatar.jpg');
    req.flush({ id: 'user-id' });
  });

  it('getRolePermissions — GET /api/roles/:id/permissions devuelve string[]', () => {
    service.getRolePermissions('r1').subscribe((perms) => {
      expect(perms).toEqual(['READ dashboard', 'READ incidents']);
    });
    const req = http.expectOne(`${environment.apiUrl}/roles/r1/permissions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(['READ dashboard', 'READ incidents']);
  });

  it('getPermissionsCatalog — GET /api/permissions?limit=100 y devuelve string[]', () => {
    service.getPermissionsCatalog().subscribe((perms) => {
      expect(perms).toEqual(['READ dashboard', 'UPDATE roles']);
    });
    const req = http.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/permissions` &&
        r.params.get('limit') === '100',
    );
    expect(req.request.method).toBe('GET');
    req.flush(['READ dashboard', 'UPDATE roles']);
  });
});
