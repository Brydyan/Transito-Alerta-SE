import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApiEndpointEntity } from '../entities/api-endpoint.entity';

/**
 * HTTP methods we want in the catalog. Skip:
 *   - ALL (5): Nest-internal, doesn't map to a real verb
 *   - OPTIONS (6), HEAD (7), SEARCH (8): uncommon, clutter the catalog
 */
const SKIP_METHODS = new Set<number>([
  RequestMethod.ALL,
  RequestMethod.OPTIONS,
  RequestMethod.HEAD,
  RequestMethod.SEARCH,
]);

/**
 * RequestMethod enum → string. Defined manually here so we don't import
 * every Nest enum entry — only the verbs the catalog cares about.
 */
const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

/**
 * One endpoint discovered by walking a controller's methods.
 *
 * `source` is a synthetic identifier (ControllerName.methodName) used
 * as the default `description` for newly-inserted rows. Existing rows
 * with hand-written descriptions are NEVER overwritten — see
 * `syncToDatabase` below.
 */
export interface DiscoveredEndpoint {
  method: string;
  path: string;
  source: string;
}

/**
 * Sync result returned by `syncToDatabase`. Useful for the CLI script
 * (`scripts/sync-endpoints.ts`) to print a summary.
 */
export interface EndpointSyncResult {
  discovered: number;
  inserted: number;
  preserved: number;
  skipped: number;
}

/**
 * sc-334 admin-controles-enhancements Phase 11 — auto-discovery.
 *
 * Walks every registered controller via NestJS's DiscoveryService +
 * MetadataScanner, reads `@Controller(prefix)` + `@Get/@Post/...` path
 * metadata, and UPSERTs the rows into `api_endpoints`.
 *
 * Why this exists: prior to Phase 11, every new module had to ship a
 * migration that manually INSERTed its endpoints into `api_endpoints`.
 * Modules added without doing so (departments, for example) showed 0
 * endpoints in the `/app/admin/controles` panel. With auto-discovery,
 * every controller route is registered at backend startup — including
 * routes that haven't been touched in years (e.g. `comment-images`).
 *
 * Sync strategy (conservative — preserves junction references):
 *   1. Discover every endpoint from controllers.
 *   2. INSERT any (method, path) that doesn't already exist in the
 *      catalog, using `ControllerName.methodName` as the default
 *      description. Existing rows with hand-written descriptions are
 *      untouched.
 *   3. Do NOT delete rows that are no longer present in the
 *      controllers — the `menu_option_endpoints` junction table has
 *      CASCADE FKs, so removing a catalog row would wipe any
 *      admin's manual assignments.
 *   4. Do NOT update existing descriptions — admins who took the time
 *      to write nice human descriptions ("List users") shouldn't lose
 *      them when this service runs.
 *
 * Hook: implements `OnApplicationBootstrap` so the catalog is in sync
 * before the HTTP server starts accepting requests. Also callable
 * directly via the CLI script `scripts/sync-endpoints.ts`.
 */
@Injectable()
export class EndpointDiscoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EndpointDiscoveryService.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
  ) {}

  /**
   * NestJS bootstrap hook — runs once after the app module finishes
   * initializing. Sync errors are caught and logged so a transient DB
   * hiccup doesn't prevent the server from starting; the catalog can
   * always be re-synced via the CLI script.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.syncToDatabase();
      this.logger.log(
        `Endpoint discovery: ${result.discovered} discovered, ${result.inserted} inserted, ${result.preserved} preserved`,
      );
    } catch (err) {
      this.logger.error(
        `Endpoint discovery sync failed (catalog stays as-is, can be re-run via scripts/sync-endpoints.ts): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Walks every controller and returns a flat list of `{method, path,
   * source}` tuples. Pure introspection — does NOT touch the database.
   * Exposed for tests and the CLI script.
   */
  discover(): DiscoveredEndpoint[] {
    const endpoints: DiscoveredEndpoint[] = [];

    const wrappers = this.discovery.getControllers();
    for (const wrapper of wrappers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const controllerPath =
        Reflect.getMetadata(PATH_METADATA, metatype) ?? '';
      const controllerName = metatype.name;

      this.scanner.scanFromPrototype(
        instance,
        Object.getPrototypeOf(instance),
        (methodKey: string | symbol) => {
          const methodRef = (instance as Record<string | symbol, unknown>)[
            methodKey
          ];
          if (typeof methodRef !== 'function') return;

          const methodEnum = Reflect.getMetadata(
            METHOD_METADATA,
            methodRef,
          ) as number | undefined;
          if (methodEnum === undefined) return; // not an HTTP handler
          if (SKIP_METHODS.has(methodEnum)) return;

          const rawMethodPath = Reflect.getMetadata(
            PATH_METADATA,
            methodRef as object,
          );
          const methodPath =
            typeof rawMethodPath === 'string' ? rawMethodPath : '';
          const fullPath = this.buildFullPath(controllerPath, methodPath);

          endpoints.push({
            method: METHOD_NAMES[methodEnum],
            path: fullPath,
            source: `${controllerName}.${String(methodKey)}`,
          });
        },
      );
    }

    return endpoints;
  }

  /**
   * INSERT-only sync — adds new endpoints discovered from controllers
   * without touching or removing existing rows. See class doc for the
   * full rationale.
   */
  async syncToDatabase(): Promise<EndpointSyncResult> {
    const discovered = this.discover();

    // Pull the existing (method, path) pairs in one query.
    const existingRows = await this.endpointRepo.find({
      select: ['id', 'method', 'path'],
    });
    const existingKeys = new Set(
      existingRows.map((e) => `${e.method}|${e.path}`),
    );

    let inserted = 0;
    let preserved = 0;
    let skipped = 0;

    for (const ep of discovered) {
      const key = `${ep.method}|${ep.path}`;
      if (existingKeys.has(key)) {
        preserved++;
        continue;
      }

      try {
        await this.endpointRepo.insert({
          method: ep.method,
          path: ep.path,
          description: ep.source,
        });
        inserted++;
      } catch (err) {
        // Unique constraint race (two processes starting at once) —
        // treat as benign skip, not a failure.
        this.logger.warn(
          `Skipped duplicate insert for ${ep.method} ${ep.path}: ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    return { discovered: discovered.length, inserted, preserved, skipped };
  }

  /**
   * Builds the full route as NestJS would route it. The global prefix
   * (`/api`) is set in `main.ts`; we mirror it here so stored paths
   * match the actual HTTP paths (which the existing seed in migration
   * 0054 already follows).
   *
   * NestJS quirk: `@Get()` / `@Post()` with NO argument stores the
   * path as `'/'` (root of the controller prefix), not `''`. Joining
   * that verbatim produces `/api/departments//` — wrong. We strip any
   * leading/trailing slashes before joining.
   *
   * Examples:
   *   controllerPath='users', methodPath=''     → '/api/users'
   *   controllerPath='users', methodPath='/:id' → '/api/users/:id'
   *   controllerPath='departments', methodPath='/' → '/api/departments'
   *   controllerPath='',       methodPath='/health' → '/api/health'
   */
  private buildFullPath(controllerPath: string, methodPath: string): string {
    const cleanMethod = methodPath.replace(/^\/+|\/+$/g, '');
    const parts = ['api', controllerPath, cleanMethod].filter(Boolean);
    return '/' + parts.join('/');
  }
}