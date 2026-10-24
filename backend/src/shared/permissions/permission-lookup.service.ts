import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { PermissionEntity } from '../../modules/permissions/entities/permission.entity';

/**
 * PermissionLookupService — singleton (`providedIn: 'root'`) que
 * mantiene un índice in-memory de `"ACTION resource" -> uuid`
 * construido a partir del catálogo de `permissions`.
 *
 * F6 fix (post-0026): las `users.permissions` ahora se almacenan
 * como UUIDs (migration `0026_roles_permissions_uuid_format.sql`
 * y `0009_roles_permissions.sql` ya normalizaron). El
 * `PermissionGuard` clásico comparaba
 * `userPermissions.includes("READ roles")` (string formateado)
 * contra un array de UUIDs — siempre `false` → 403 a
 * `master` para todos los endpoints protegidos.
 *
 * Con este resolver, el guard traduce `(action, resource)` a
 * UUID y compara contra `userPermissions`. El cache se construye
 * lazy (en la primera lookup) y se invalida explícitamente vía
 * `invalidate()` cuando se hace una migration del catálogo
 * (la 0050 hace `DELETE permissions … WHERE deleted_at IS NULL`
 * en la DOWN, pero los soft-deletes mantienen la fila — el
 * resolver filtra `deletedAt: IsNull()` para excluir).
 */
/**
 * Registrado como provider en `CoreModule` (singleton por scope
 * del módulo — el CoreModule es importado por AppModule y vive
 * toda la app). El cache persiste durante el lifetime del
 * proceso Node.
 */
@Injectable()
export class PermissionLookupService {
  /**
   * 2026-10-20-auth-me-500 — canonical shape of a catalog id.
   *
   * `roles.permissions` / `users.permissions` are denormalized snapshots that
   * historically carried THREE different formats: canonical `"ACTION resource"`
   * (0016/0018/0019/0021 §1), the erroneous `resource:ACTION` (0021 §6), and
   * UUIDs (0026 onwards). 0026's remap only understood the space-separated one,
   * so the colon ones survived into `users.permissions` and then hit
   * `getDescriptionsByUuids` below, which fed them straight into a
   * `uuid IN (...)` — Postgres raised `22P02 invalid input syntax for type
   * uuid` and `GET /api/auth/me` answered 500.
   *
   * Migration `0038_permissions_uuid_normalization.sql` removes the bad data at
   * the source. This regex is the runtime half of the same guard: one corrupt
   * row must degrade into "missing permissions" (403 on one endpoint), never
   * into a 500 that takes down login for every Bearer-authenticated request
   * through this funnel.
   */
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private readonly logger = new Logger(PermissionLookupService.name);
  private cache: Map<string, string> | null = null;
  private reverseCache: Map<string, string> | null = null;

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
  ) {}

  /**
   * Devuelve el UUID del perm `(action, resource)` activo (no
   * soft-deleted), o `null` si no existe en el catálogo. El
   * cache se construye una sola vez por proceso (la primera
   * llamada); `invalidate()` lo borra.
   */
  async getUuid(action: string, resource: string): Promise<string | null> {
    if (!this.cache) {
      await this.buildCache();
    }
    return this.cache?.get(this.key(action, resource)) ?? null;
  }

  /**
   * Misma utilidad pero síncrona — útil cuando el caller ya
   * garantiza que el cache está construido. Lanza si no lo está.
   */
  getUuidSync(action: string, resource: string): string | null {
    if (!this.cache) {
      throw new Error(
        'PermissionLookupService.getUuidSync() llamado antes de buildCache()',
      );
    }
    return this.cache.get(this.key(action, resource)) ?? null;
  }

  /**
   * Construye (o reconstruye) el índice desde el catálogo.
   * Llamado automáticamente en la primera lookup o
   * explícitamente vía `invalidate()` después de una migration
   * del catálogo.
   */
  async buildCache(): Promise<void> {
    const rows = await this.permissionRepo.find({
      where: { deletedAt: IsNull() },
      select: ['id', 'action', 'resource'],
    });
    const map = new Map<string, string>();
    const reverse = new Map<string, string>();
    for (const row of rows) {
      const k = this.key(row.action, row.resource);
      map.set(k, row.id);
      reverse.set(row.id, k);
    }
    this.cache = map;
    this.reverseCache = reverse;
    this.logger.log(`Catalog index rebuilt: ${map.size} permisos activos`);
  }

  /**
   * Convierte una lista de UUIDs de permisos a sus descripciones
   * en formato "ACTION resource". Usado por AuthService.getMe()
   * para devolver permisos al frontend en un formato que el
   * permissionGuard pueda usar directamente.
   *
   * 2026-10-20-auth-me-500 — D1: filtra los elementos que no son UUID
   * ANTES de construir el `IN (...)`. TypeORM delega el bindeo a Postgres,
   * que castea el parámetro a la columna `uuid` y aborta la query con
   * `22P02` ante un string no-UUID. Sin este filtro, un único elemento
   * corrupto en `users.permissions` convertía cada `GET /api/auth/me` en un
   * 500 (`{"statusCode":500,"message":"Internal server error"}`, 52 bytes).
   *
   * D2: los descartados se loguean en WARN. Silenciarlos sería peor — la
   * corrupción tiene que ser visible en los logs, no un 403 Mystery.
   */
  async getDescriptionsByUuids(uuids: string[]): Promise<string[]> {
    if (!uuids || uuids.length === 0) {
      return [];
    }

    const valid = uuids.filter((u) => PermissionLookupService.UUID_RE.test(u));
    if (valid.length !== uuids.length) {
      this.logger.warn(
        `getDescriptionsByUuids: ${uuids.length - valid.length}/${uuids.length} ` +
          `entradas no son UUID del catálogo y se descartaron sin consultar la DB. ` +
          `Ejecutá 0038_permissions_uuid_normalization.sql. ` +
          `Muestra: ${JSON.stringify(uuids.filter((u) => !PermissionLookupService.UUID_RE.test(u)).slice(0, 5))}`,
      );
    }
    if (valid.length === 0) {
      return [];
    }

    if (!this.cache) {
      await this.buildCache();
    }
    const rows = await this.permissionRepo.find({
      where: { id: In(valid), deletedAt: IsNull() },
      select: ['id', 'action', 'resource'],
    });
    return rows.map((row) => `${row.action} ${row.resource}`);
  }

  /** Invalida el cache. La próxima lookup lo reconstruye. */
  invalidate(): void {
    this.cache = null;
    this.reverseCache = null;
  }

  /**
   * Traduce un array de UUIDs del catálogo a sus nombres
   * `"ACTION resource"` (p. ej. `["READ menu-options"]`).
   * Usa el mismo canal/cache que `getUuid`; ignora UUIDs
   * desconocidos (soft-deleted o inexistentes).
   */
  async getNamesByUuids(uuids: string[]): Promise<string[]> {
    if (!this.cache || !this.reverseCache) {
      await this.buildCache();
    }
    const names: string[] = [];
    for (const uuid of uuids) {
      const name = this.reverseCache!.get(uuid);
      if (name) {
        names.push(name);
      }
    }
    return names;
  }

  /** Variante síncrona — requiere que el cache ya esté construido. */
  getNamesByUuidsSync(uuids: string[]): string[] {
    if (!this.cache || !this.reverseCache) {
      throw new Error(
        'PermissionLookupService.getNamesByUuidsSync() llamado antes de buildCache()',
      );
    }
    const names: string[] = [];
    for (const uuid of uuids) {
      const name = this.reverseCache.get(uuid);
      if (name) {
        names.push(name);
      }
    }
    return names;
  }

  private key(action: string, resource: string): string {
    return `${action} ${resource}`;
  }
}
