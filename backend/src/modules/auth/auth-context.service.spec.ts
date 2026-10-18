import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { DataSource, Repository } from 'typeorm';

import { AuthContextService, PERMISSION_CACHE_PREFIX } from './auth-context.service';
import { AuthUserRepository } from './auth-user.repository';
import { UserEntity } from '../users/entities/user.entity';

function makeAuthConfig() {
  return {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    permissionCacheTtlSeconds: 3600,
    anonymousDeviceUuid: 'anonymous',
    // ANON (sc-326) — el techo anónimo está VACÍO.
    anonymousPermissions: [],
    sessionRefreshGraceSeconds: 30,
    sessionRefreshTtlSeconds: 604800,
  };
}

function makeDataSource(query: jest.Mock = jest.fn().mockResolvedValue([])) {
  return { query };
}

function makeService(opts: {
  cache?: { get: jest.Mock; set: jest.Mock; del?: jest.Mock };
  dataSource?: { query: jest.Mock };
}) {
  const cache = opts.cache ?? { get: jest.fn(), set: jest.fn() };
  const dataSource = opts.dataSource ?? makeDataSource();
  const authUserRepo = new AuthUserRepository(
    {} as unknown as jest.Mocked<Repository<UserEntity>>,
    dataSource as unknown as DataSource,
  );
  const configService = {
    get: () => makeAuthConfig(),
  } as unknown as ConfigService;
  const service = new AuthContextService(cache as unknown as Cache, configService, authUserRepo);
  return { service, cache, dataSource, authUserRepo };
}

/**
 * 2026-10-18-admin-org-dept-scoping — el caching layer debe
 * preservar `departmentId` end-to-end (DB → cache.set → cache.get
 * → AuthContext.scope). El scope derivado por `resolveSubjectScope`
 * SOLO es `'department'` cuando `departmentId` llega poblado; si el
 * cache lo strippea, admin_org cae al fallback `'org'` (se ven TODOS
 * los usuarios del org) — la regresión que este test atrapa.
 */
describe('AuthContextService — 2026-10-18 departmentId threading', () => {
  describe('cache write (DB row → Redis)', () => {
    it('cache.set incluye departmentId cuando la fila DB lo tiene poblado', async () => {
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            permissions: ['READ users'],
            organization_id: 'org-1',
            // 2026-10-18 — el seed actual de admin_org SÍ popula
            // department_id; este caso cubre ese happy path.
            department_id: 'dept-A',
            device_uuid: 'device-abc',
            role_name: 'admin_org',
            role_deleted_at: null,
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      await service.getAuthContextByUserId('user-1');

      expect(cache.set).toHaveBeenCalledWith(
        `${PERMISSION_CACHE_PREFIX}uid:user-1`,
        expect.objectContaining({
          permissions: ['READ users'],
          organizationId: 'org-1',
          // 2026-10-18 — el round-trip Redis debe preservar el
          // departmentId. Si este expect falla, el switch de
          // `resolveSubjectScope` recibirá `null` en el cache hit
          // y admin_org verá TODA la org (regresión).
          departmentId: 'dept-A',
          roleName: 'admin_org',
          isAnonymous: false,
        }),
        expect.any(Number),
      );
    });

    it('cache.set incluye departmentId: null cuando la fila DB lo tiene null (master/agent_system/operator_org)', async () => {
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            permissions: [],
            organization_id: null,
            department_id: null,
            device_uuid: 'device-x',
            role_name: 'master',
            role_deleted_at: null,
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      await service.getAuthContextByUserId('user-master');

      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          organizationId: null,
          // 2026-10-18 — los roles no-admin_org tienen
          // departmentId:null y eso DEBE persistirse en el cache
          // (si lo strippeamos, en el cache hit admin_org también
          // vería `null`).
          departmentId: null,
          roleName: 'master',
        }),
        expect.any(Number),
      );
    });

    it('cache.set guarda departmentId: null cuando el row es la anonymous device', async () => {
      // Defensa explícita: el path anónimo fuerza `departmentId: null`
      // independientemente del contenido de la BD (mismo principio que
      // `organizationId: null` y `roleName: null`).
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            // El row NO migrado todavía tendría contenido viejo, pero el
            // path anon debe sobrescribirlo a null.
            permissions: ['UPDATE incidents'],
            organization_id: 'org-attic',
            department_id: 'dept-attic',
            device_uuid: 'anonymous',
            role_name: 'admin_org',
            role_deleted_at: null,
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('anon-row');

      expect(ctx.departmentId).toBeNull();
      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ departmentId: null }),
        expect.any(Number),
      );
    });

    it('cache.set guarda departmentId: null cuando el role está soft-deleted (R7.5)', async () => {
      // Defensa: rol soft-deleted ⇒ denormalización rota; departmentId
      // cae a `null` por el mismo principio que roleName.
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            permissions: ['READ users'],
            organization_id: 'org-1',
            department_id: 'dept-A',
            device_uuid: 'device-x',
            role_name: 'admin_org',
            role_deleted_at: new Date('2026-08-25T00:00:00Z'),
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('user-1');

      expect(ctx.departmentId).toBeNull();
      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ departmentId: null }),
        expect.any(Number),
      );
    });
  });

  describe('cache read (Redis → AuthContext)', () => {
    it('cache hit reconstruye departmentId poblado y deriva scope "department"', async () => {
      const cache = {
        get: jest.fn().mockResolvedValue({
          permissions: ['READ users'],
          organizationId: 'org-1',
          // 2026-10-18 — el cache hit debe reconstruir el scope
          // `'department'` (no fallback a `'org'`). Si
          // departmentId falta en la construcción del AuthContext,
          // el scope degenera y admin_org ve TODA la org.
          departmentId: 'dept-A',
          roleName: 'admin_org',
          isAnonymous: false,
        }),
        set: jest.fn(),
      };
      const dataSource = makeDataSource();
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('user-1');

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(ctx.departmentId).toBe('dept-A');
      expect(ctx.scope).toEqual({
        kind: 'department',
        organizationId: 'org-1',
        departmentId: 'dept-A',
      });
    });

    it('cache hit con departmentId: null para admin_org cae al fallback "org" (back-compat)', async () => {
      // Un cache caliente que precede al deploy (TTL de 1h) NO tiene
      // `departmentId` poblado. `resolveSubjectScope` debe tratarlo
      // como `null` y derivar `'org'`, NO `'deny'`. Si esto cayera
      // a deny, admin_org legacy quedaría 403'd por una hora entera.
      const cache = {
        get: jest.fn().mockResolvedValue({
          permissions: ['READ users'],
          organizationId: 'org-1',
          departmentId: null,
          roleName: 'admin_org',
          isAnonymous: false,
        }),
        set: jest.fn(),
      };
      const { service } = makeService({ cache });

      const ctx = await service.getAuthContextByUserId('user-1');

      expect(ctx.scope).toEqual({ kind: 'org', organizationId: 'org-1' });
    });
  });

  describe('cache miss + DB hit + return', () => {
    it('cache miss con departmentId poblado deriva scope "department" en el AuthContext retornado', async () => {
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            permissions: ['READ users'],
            organization_id: 'org-1',
            department_id: 'dept-A',
            device_uuid: 'device-abc',
            role_name: 'admin_org',
            role_deleted_at: null,
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('user-1');

      expect(ctx).toEqual({
        userId: 'user-1',
        permissions: ['READ users'],
        organizationId: 'org-1',
        departmentId: 'dept-A',
        roleName: 'admin_org',
        scope: {
          kind: 'department',
          organizationId: 'org-1',
          departmentId: 'dept-A',
        },
        sessionId: null,
        isAnonymous: false,
      });
    });

    it('cache miss para usuario inexistente devuelve departmentId: null y scope "public"', async () => {
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(jest.fn().mockResolvedValue([]));
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('ghost');

      expect(ctx.departmentId).toBeNull();
      expect(ctx.scope).toEqual({ kind: 'public' });
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('cache miss para anonymous device devuelve departmentId: null aunque la fila lo tenga poblado', async () => {
      const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const dataSource = makeDataSource(
        jest.fn().mockResolvedValue([
          {
            permissions: ['UPDATE incidents'],
            organization_id: 'org-attic',
            department_id: 'dept-attic',
            device_uuid: 'anonymous',
            role_name: 'admin_org',
            role_deleted_at: null,
          },
        ]),
      );
      const { service } = makeService({ cache, dataSource });

      const ctx = await service.getAuthContextByUserId('anon-row');

      expect(ctx.departmentId).toBeNull();
      expect(ctx.organizationId).toBeNull();
      expect(ctx.scope).toEqual({ kind: 'public' });
      expect(ctx.isAnonymous).toBe(true);
    });
  });
});