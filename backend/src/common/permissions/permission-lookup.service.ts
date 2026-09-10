import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { PermissionEntity } from '../../entities/permission.entity';

/**
 * PermissionLookupService — singleton (`providedIn: 'root'`) que
 * mantiene un índice in-memory de `"ACTION resource" -> uuid`
 * construido a partir del catálogo de `permissions`.
 *
 * F6 fix (post-0051): las `users.permissions` ahora se almacenan
 * como UUIDs (migration `0051_roles_permissions_uuid_format.sql`
 * y `0049_admin_user_permissions.sql` ya normalizaron). El
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
  private readonly logger = new Logger(PermissionLookupService.name);
  private cache: Map<string, string> | null = null;

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
    for (const row of rows) {
      map.set(this.key(row.action, row.resource), row.id);
    }
    this.cache = map;
    this.logger.log(`Catalog index rebuilt: ${map.size} permisos activos`);
  }

  /** Invalida el cache. La próxima lookup lo reconstruye. */
  invalidate(): void {
    this.cache = null;
  }

  private key(action: string, resource: string): string {
    return `${action} ${resource}`;
  }
}
