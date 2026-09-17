import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';

import { ApiEndpointEntity } from '../entities/api-endpoint.entity';
import {
  EndpointDiscoveryService,
  DiscoveredEndpoint,
} from './endpoint-discovery.service';

/**
 * sc-334 admin-controles-enhancements Phase 11 — endpoint discovery
 * tests.
 *
 * Strategy: stub the DiscoveryService + MetadataScanner + repository
 * with hand-crafted fixtures. We don't spin up a full Nest app here
 * because the controller-discovery path is internal to the framework
 * and not worth the boot cost — what's worth verifying is:
 *   1. Path composition (controller prefix + method path, with the
 *      `@Get()` empty-path edge case).
 *   2. Method filtering (skip ALL/OPTIONS/HEAD/SEARCH).
 *   3. INSERT-only sync (existing rows preserved, new ones inserted,
 *      no DELETE — see class doc for why).
 */

class FakeScanner {
  // Mimics MetadataScanner.scanFromPrototype — invokes the callback
  // once per method name on the supplied prototype. The test wires
  // controllers with hand-built prototypes so this is straightforward.
  scanFromPrototype(
    _instance: object,
    prototype: object,
    callback: (key: string | symbol) => void,
  ): void {
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (n) => n !== 'constructor' && typeof (prototype as Record<string, unknown>)[n] === 'function',
    );
    for (const name of methodNames) {
      callback(name);
    }
  }
}

function makeRepoMock(): {
  find: jest.Mock;
  insert: jest.Mock;
  delete: jest.Mock;
} {
  return {
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

describe('EndpointDiscoveryService (Phase 11)', () => {
  let service: EndpointDiscoveryService;
  let repo: ReturnType<typeof makeRepoMock>;
  let discoveryGetControllers: jest.Mock;

  /**
   * Builds a fake controller wrapper: { instance, metatype } pair that
   * DiscoveryService.getControllers() returns. We attach `@Controller`
   * prefix metadata to the metatype and `@Get/@Post/...` method+path
   * metadata to each method.
   */
  function buildController(
    controllerName: string,
    controllerPrefix: string,
    handlers: Array<{
      methodName: string;
      verb: RequestMethod;
      subPath?: string | undefined;
    }>,
  ): { instance: object; metatype: new () => unknown } {
    class FakeController {}
    // Class names are static — override so metatype.name matches the
    // test's expected `source` (ControllerName.methodName).
    Object.defineProperty(FakeController, 'name', { value: controllerName });
    Reflect.defineMetadata(PATH_METADATA, controllerPrefix, FakeController);

    const proto: Record<string, unknown> = {};
    for (const h of handlers) {
      const fn = function noop() {};
      Reflect.defineMetadata(METHOD_METADATA, h.verb, fn);
      // NestJS quirk: undefined for @Get() with no arg, string for the rest.
      const metaValue =
        h.subPath === undefined
          ? Reflect.getMetadata(PATH_METADATA, FakeController) // any non-string forces typeof fallback
          : h.subPath;
      // Use a sentinel when subPath is undefined so the typeof check fires.
      const finalValue =
        h.subPath === undefined ? undefined : h.subPath === '__SLASH__' ? '/' : h.subPath;
      if (finalValue === undefined) {
        // Don't define PATH_METADATA — service uses typeof guard.
      } else {
        Reflect.defineMetadata(PATH_METADATA, finalValue, fn);
      }
      proto[h.methodName] = fn;
    }

    const instance = Object.create(proto);
    return { instance, metatype: FakeController as new () => unknown };
  }

  beforeEach(async () => {
    repo = makeRepoMock();
    discoveryGetControllers = jest.fn().mockReturnValue([]);
    const fakeDiscovery = { getControllers: discoveryGetControllers } as unknown as DiscoveryService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        EndpointDiscoveryService,
        { provide: DiscoveryService, useValue: fakeDiscovery },
        { provide: MetadataScanner, useClass: FakeScanner },
        { provide: getRepositoryToken(ApiEndpointEntity), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(EndpointDiscoveryService);
  });

  describe('discover()', () => {
    it('returns empty list when no controllers are registered', () => {
      expect(service.discover()).toEqual([]);
    });

    it('composes full paths as /api/{controllerPrefix}/{subPath}', () => {
      const users = buildController('UsersController', 'users', [
        { methodName: 'list', verb: RequestMethod.GET },
        { methodName: 'create', verb: RequestMethod.POST },
        { methodName: 'findOne', verb: RequestMethod.GET, subPath: ':id' },
        { methodName: 'update', verb: RequestMethod.PATCH, subPath: ':id' },
        { methodName: 'remove', verb: RequestMethod.DELETE, subPath: ':id' },
      ]);
      discoveryGetControllers.mockReturnValue([users]);

      const result = service.discover();

      expect(result).toHaveLength(5);
      expect(result.find((r) => r.source === 'UsersController.list')?.path).toBe(
        '/api/users',
      );
      expect(result.find((r) => r.source === 'UsersController.create')?.path).toBe(
        '/api/users',
      );
      expect(result.find((r) => r.source === 'UsersController.findOne')?.path).toBe(
        '/api/users/:id',
      );
      expect(
        result.find((r) => r.source === 'UsersController.list')?.method,
      ).toBe('GET');
      expect(
        result.find((r) => r.source === 'UsersController.create')?.method,
      ).toBe('POST');
      expect(
        result.find((r) => r.source === 'UsersController.update')?.method,
      ).toBe('PATCH');
      expect(
        result.find((r) => r.source === 'UsersController.remove')?.method,
      ).toBe('DELETE');
    });

    it('handles @Get() (no arg) by producing /api/{controllerPrefix} without trailing slash', () => {
      // DepartmentsController.list uses @Get() — NestJS stores nothing
      // for the path, so Reflect.getMetadata returns undefined. The
      // service must guard with typeof and not call .replace on undefined.
      const departments = buildController('DepartmentsController', 'departments', [
        { methodName: 'list', verb: RequestMethod.GET /* no subPath */ },
        { methodName: 'create', verb: RequestMethod.POST },
      ]);
      discoveryGetControllers.mockReturnValue([departments]);

      const result: DiscoveredEndpoint[] = service.discover();

      expect(result.find((r) => r.source === 'DepartmentsController.list')?.path).toBe(
        '/api/departments',
      );
      expect(
        result.find((r) => r.source === 'DepartmentsController.create')?.path,
      ).toBe('/api/departments');
    });

    it('handles controllers with empty prefix (@Controller())', () => {
      // e.g. AppController has @Controller() — global /api/health, /api/estados.
      const app = buildController('AppController', '', [
        { methodName: 'health', verb: RequestMethod.GET, subPath: 'health' },
        { methodName: 'estados', verb: RequestMethod.GET, subPath: 'estados' },
      ]);
      discoveryGetControllers.mockReturnValue([app]);

      const result = service.discover();

      expect(result.find((r) => r.source === 'AppController.health')?.path).toBe(
        '/api/health',
      );
      expect(result.find((r) => r.source === 'AppController.estados')?.path).toBe(
        '/api/estados',
      );
    });

    it('handles controllers with nested path (@Controller("comments/:id/images"))', () => {
      const commentImages = buildController(
        'CommentImagesController',
        'comments/:id/images',
        [{ methodName: 'list', verb: RequestMethod.GET }],
      );
      discoveryGetControllers.mockReturnValue([commentImages]);

      const result = service.discover();

      expect(
        result.find((r) => r.source === 'CommentImagesController.list')?.path,
      ).toBe('/api/comments/:id/images');
    });

    it('skips ALL, OPTIONS, HEAD, SEARCH verbs (only keeps GET/POST/PUT/DELETE/PATCH)', () => {
      const weird = buildController('WeirdController', 'weird', [
        { methodName: 'doAll', verb: RequestMethod.ALL },
        { methodName: 'options', verb: RequestMethod.OPTIONS, subPath: 'opt' },
        { methodName: 'head', verb: RequestMethod.HEAD, subPath: 'h' },
        { methodName: 'search', verb: RequestMethod.SEARCH, subPath: 's' },
        { methodName: 'get', verb: RequestMethod.GET },
      ]);
      discoveryGetControllers.mockReturnValue([weird]);

      const result = service.discover();

      // Only `get` survives.
      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('GET');
    });

    it('walks every controller independently and aggregates the results', () => {
      const a = buildController('AController', 'a', [
        { methodName: 'list', verb: RequestMethod.GET },
      ]);
      const b = buildController('BController', 'b', [
        { methodName: 'list', verb: RequestMethod.GET },
        { methodName: 'create', verb: RequestMethod.POST },
      ]);
      discoveryGetControllers.mockReturnValue([a, b]);

      const result = service.discover();

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.path).sort()).toEqual([
        '/api/a',
        '/api/b',
        '/api/b',
      ]);
    });
  });

  describe('syncToDatabase() — INSERT-only strategy', () => {
    it('returns discovered=0 / inserted=0 / preserved=0 when no controllers exist', async () => {
      const result = await service.syncToDatabase();
      expect(result).toEqual({
        discovered: 0,
        inserted: 0,
        preserved: 0,
        skipped: 0,
      });
      expect(repo.find).toHaveBeenCalledTimes(1);
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('inserts new endpoints with ControllerName.methodName as default description', async () => {
      const users = buildController('UsersController', 'users', [
        { methodName: 'list', verb: RequestMethod.GET },
        { methodName: 'create', verb: RequestMethod.POST },
      ]);
      discoveryGetControllers.mockReturnValue([users]);
      repo.find.mockResolvedValue([]); // catalog empty

      const result = await service.syncToDatabase();

      expect(result.discovered).toBe(2);
      expect(result.inserted).toBe(2);
      expect(result.preserved).toBe(0);
      expect(repo.insert).toHaveBeenCalledTimes(2);
      expect(repo.insert).toHaveBeenCalledWith({
        method: 'GET',
        path: '/api/users',
        description: 'UsersController.list',
      });
      expect(repo.insert).toHaveBeenCalledWith({
        method: 'POST',
        path: '/api/users',
        description: 'UsersController.create',
      });
    });

    it('preserves existing rows (no DELETE — see class doc for why)', async () => {
      const users = buildController('UsersController', 'users', [
        { methodName: 'list', verb: RequestMethod.GET },
      ]);
      discoveryGetControllers.mockReturnValue([users]);
      // Catalog already has the GET /api/users row with a hand-written description.
      repo.find.mockResolvedValue([
        {
          id: 'existing-1',
          method: 'GET',
          path: '/api/users',
          description: 'List users (hand-written)',
        } as ApiEndpointEntity,
      ]);

      const result = await service.syncToDatabase();

      expect(result.inserted).toBe(0);
      expect(result.preserved).toBe(1);
      expect(repo.insert).not.toHaveBeenCalled();
      // Critically: no DELETE — junction FKs would cascade.
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('inserts only the new endpoints when the catalog is partially populated', async () => {
      const users = buildController('UsersController', 'users', [
        { methodName: 'list', verb: RequestMethod.GET },
        { methodName: 'create', verb: RequestMethod.POST },
      ]);
      discoveryGetControllers.mockReturnValue([users]);
      repo.find.mockResolvedValue([
        {
          id: 'existing-1',
          method: 'GET',
          path: '/api/users',
          description: 'List users',
        } as ApiEndpointEntity,
      ]);

      const result = await service.syncToDatabase();

      expect(result.discovered).toBe(2);
      expect(result.inserted).toBe(1); // POST only
      expect(result.preserved).toBe(1); // GET only
      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(repo.insert).toHaveBeenCalledWith({
        method: 'POST',
        path: '/api/users',
        description: 'UsersController.create',
      });
    });
  });
});