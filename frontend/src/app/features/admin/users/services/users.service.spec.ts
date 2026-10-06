import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { UsersService } from './users.service';
import { environment } from '../../../../../environments/environment';
import {
  UNKNOWN_PERMISSION_LABEL,
  permissionLabel,
  resolveRolePermissionLabels,
  type PermissionItem,
} from '../models/user.interface';

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

  // sc-340: post-0051 `GET /api/roles/:id/permissions` returns UUIDs,
  // and `getRolePermissions` resolves them against the catalog (R2).
  // The pre-0051 expectation (endpoint returns "ACTION resource"
  // strings verbatim) asserted a contract the backend no longer keeps.
  it('getRolePermissions — GET /api/roles/:id/permissions resolves UUIDs to labels', () => {
    let result: ReadonlyArray<string> = [];
    service.getRolePermissions('r1').subscribe((perms) => {
      result = perms;
    });
    const req = http.expectOne(`${environment.apiUrl}/roles/r1/permissions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(['perm-uuid-1', 'perm-uuid-2']);
    const catalogReq = http.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/permissions` &&
        r.params.get('limit') === '100',
    );
    catalogReq.flush([
      { id: 'perm-uuid-1', resource: 'dashboard', action: 'READ' },
      { id: 'perm-uuid-2', resource: 'incidents', action: 'READ' },
    ]);
    expect(result).toEqual(['READ dashboard', 'READ incidents']);
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

  // -------------------------------------------------------------------
  // sc-340 — permissions catalog aligned to the real wire (R2, R3, R4).
  //
  // NOTE on assertion style: `expect` calls placed INSIDE `.subscribe()`
  // do NOT fail this suite — RxJS 7 reports throws in `next` handlers
  // via `onUnhandledError` (async), so the test passes vacuously
  // (verified empirically with an absurd expectation that still passed).
  // Every sc-340 service test below captures the emission and asserts
  // OUTSIDE the subscription, so RED is genuine.
  // -------------------------------------------------------------------
  describe('sc-340 T5 permissionLabel (pure resolver)', () => {
    it('prefers an explicit nombre when present', () => {
      expect(
        permissionLabel({ nombre: 'Custom label', action: 'READ', resource: 'dashboard' }),
      ).toBe('Custom label');
    });

    it('falls back to "action resource" from the wire fields', () => {
      expect(permissionLabel({ action: 'READ', resource: 'dashboard' })).toBe(
        'READ dashboard',
      );
    });

    it('returns an empty string — never undefined — when nothing is present', () => {
      expect(permissionLabel({})).toBe('');
      expect(permissionLabel({ action: null, resource: null, nombre: null })).toBe('');
      expect(permissionLabel({ action: '  ', resource: '' })).toBe('');
    });
  });

  describe('sc-340 T6/R3 getPermissionsCatalog projection', () => {
    it('a catalog entry with only id/resource/action never yields the string "undefined"', () => {
      let result: ReadonlyArray<string> = [];
      service.getPermissionsCatalog().subscribe((labels) => {
        result = labels;
      });
      const req = http.expectOne(
        (r) =>
          r.url === `${environment.apiUrl}/permissions` &&
          r.params.get('limit') === '100',
      );
      req.flush([{ id: 'perm-1', resource: 'dashboard', action: 'READ' }]);
      expect(result).toEqual(['READ dashboard']);
      expect(result.join(' ')).not.toContain('undefined');
    });
  });

  describe('sc-340 T10/R2 getRolePermissions label resolution', () => {
    const flushRoleAndCatalog = (rolePerms: string[], catalog: object[]) => {
      const roleReq = http.expectOne(
        `${environment.apiUrl}/roles/role-1/permissions`,
      );
      roleReq.flush(rolePerms);
      const catalogReq = http.expectOne(
        (r) =>
          r.url === `${environment.apiUrl}/permissions` &&
          r.params.get('limit') === '100',
      );
      catalogReq.flush(catalog);
    };

    it('UUID role permissions resolve to "{action} {resource}" labels via the catalog', () => {
      let result: ReadonlyArray<string> = [];
      service.getRolePermissions('role-1').subscribe((labels) => {
        result = labels;
      });
      flushRoleAndCatalog(
        ['perm-uuid-1', 'perm-uuid-2'],
        [
          { id: 'perm-uuid-1', resource: 'dashboard', action: 'READ' },
          { id: 'perm-uuid-2', resource: 'incidents', action: 'UPDATE' },
        ],
      );
      expect(result).toEqual(['READ dashboard', 'UPDATE incidents']);
      expect(result.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    });

    it('a UUID absent from the catalog yields an explicit marker, not undefined and no throw', () => {
      let result: ReadonlyArray<string> = [];
      let error: unknown = null;
      service.getRolePermissions('role-1').subscribe({
        next: (labels) => {
          result = labels;
        },
        error: (err) => {
          error = err;
        },
      });
      flushRoleAndCatalog(
        ['perm-uuid-orphan'],
        [{ id: 'perm-uuid-other', resource: 'dashboard', action: 'READ' }],
      );
      expect(error).toBeNull();
      expect(result).toEqual([UNKNOWN_PERMISSION_LABEL]);
      expect(result).not.toContain(undefined);
      expect(result.join(' ')).not.toContain('undefined');
    });

    it('resolveRolePermissionLabels maps known UUIDs and marks unknown ones', () => {
      const catalog: PermissionItem[] = [
        {
          permisoId: 'perm-uuid-1',
          nombre: 'READ dashboard',
          descripcion: '',
          recurso: 'dashboard',
          accion: 'READ',
        },
      ];
      expect(
        resolveRolePermissionLabels(['perm-uuid-1', 'perm-uuid-ghost'], catalog),
      ).toEqual(['READ dashboard', UNKNOWN_PERMISSION_LABEL]);
      expect(resolveRolePermissionLabels([], catalog)).toEqual([]);
    });
  });

  describe('sc-340 T8/R4 flat-array wire tolerance', () => {
    const expectCatalog = (url: string) =>
      http.expectOne(
        (r) => r.url === url && r.params.get('limit') === '100',
      );

    it('getPermissionsCatalog consumes the flat array (no envelope)', () => {
      let result: ReadonlyArray<string> = [];
      service.getPermissionsCatalog().subscribe((labels) => {
        result = labels;
      });
      const req = expectCatalog(`${environment.apiUrl}/permissions`);
      req.flush([
        { id: 'perm-1', resource: 'dashboard', action: 'READ' },
        { id: 'perm-2', resource: 'roles', action: 'UPDATE' },
      ]);
      expect(result).toEqual(['READ dashboard', 'UPDATE roles']);
    });

    it('getPermissions maps the flat array onto the PermissionItem model', () => {
      let result: PermissionItem[] = [];
      service.getPermissions().subscribe((items) => {
        result = items;
      });
      const req = expectCatalog(`${environment.apiUrl}/permissions`);
      req.flush([{ id: 'perm-1', resource: 'dashboard', action: 'READ' }]);
      expect(result).toEqual([
        {
          permisoId: 'perm-1',
          nombre: 'READ dashboard',
          descripcion: '',
          recurso: 'dashboard',
          accion: 'READ',
        },
      ]);
    });
  });
});
