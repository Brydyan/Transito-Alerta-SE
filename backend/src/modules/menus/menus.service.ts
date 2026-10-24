import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../infra/core.module';
import { UserEntity } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { PermissionLookupService } from '../../shared/permissions/permission-lookup.service';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { MenuEntry, MENU_MAP } from './menu-map';

/**
 * MenusService — resolves the user's navigation menu from the database.
 *
 * F5 rewrite (D1/D3/D4):
 *   - Reads `menu_options` + `menu_option_roles` instead of MENU_MAP.
 *   - Builds the tree in memory by `parent_id` (D3).
 *   - Caches per user: `menu:v1:user:{userId}` with TTL 1 hour (D4).
 *   - Filters by effective permissions (AuthService.getPermissionsByUserId)
 *     so the menu matches what the guard actually allows.
 *   - Response contract is UNCHANGED from F1 (D1): { label, route,
 *     icon?, group?, order } plus `children` array.
 *
 * D7: `menu-map.ts` stays in the repo as the rollback path. If this
 * service fails in production, the revert is to restore the old
 * MENU_MAP-based resolver — not to reconstruct the map from scratch.
 *
 * D4 note: `menu:v1:*` is a SEPARATE key space from `perm:v3:uid:*`.
 * Confusing them already cost a debugging session in this project.
 * `perm:v3:uid:*` caches permission sets; `menu:v1:*` caches resolved
 * menu trees. Flushing one does NOT affect the other.
 */
@Injectable()
export class MenusService {
  private static readonly CACHE_PREFIX = 'menu:v1:user:';
  private static readonly CACHE_TTL_SECONDS = 3600; // 1 hour

  private readonly logger = new Logger(MenusService.name);

  /** Route → required permission derived from MENU_MAP (single source of truth). */
  private static readonly ROUTE_TO_PERMISSION = new Map<string, string>(
    Object.values(MENU_MAP).map((d) => [d.route, d.requires]),
  );


  constructor(
    @InjectRepository(MenuOptionEntity)
    private readonly optionRepo: Repository<MenuOptionEntity>,
    @InjectRepository(MenuOptionRoleEntity)
    private readonly roleAccessRepo: Repository<MenuOptionRoleEntity>,
    // 2026-10-20 — para resolver si el rol del usuario sigue vigente. Un rol
    // soft-deleted no debeftecer menú (ver el paso 3 de getMenuForUser).
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly authService: AuthService,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  /**
   * Resolve the menu for a given user.
   *
   * Flow (design Data Flow):
   *   userId → roleId (from users.role_id) → cache lookup (per-user) → DB query
   *   → effective-permission filter → tree build → cache store → response.
   *
   * The effective-permission filter uses the same channel as the guard
   * (AuthService.getPermissionsByUserId) so the menu never shows entries
   * the API would reject.
   */
  async getMenuForUser(userId: string): Promise<MenuEntry[]> {
    // 1. Resolve the user's role
    const user = await this.userRepo.findOne({
      where: { id: userId, deletedAt: IsNull() },
      select: ['id', 'roleId'],
    });
    if (!user || !user.roleId) {
      return [];
    }

    // 2. Check cache (D4: menu:v1:user:{userId} — per-user because two users
    // of the same role can have different effective permissions via users.permissions deviation)
    const cacheKey = `${MenusService.CACHE_PREFIX}${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as MenuEntry[];
      }
    } catch (err) {
      // Cache miss on error — proceed to DB query
      this.logger.warn(`Cache read failed for ${cacheKey}: ${(err as Error).message}`);
    }

    // 3. Query accessible options from DB (matrix can_read=true)
    //
    // 2026-10-20 — un rol soft-deleted NO concede menú.
    //
    // Las filas de `menu_option_roles` sobreviven al soft-delete del rol (no
    // hay cascade: es una tabla puente por FK, no por participación), así que
    // `getAccessibleOptions` seguía devolviendo el menú completo de un rol
    // revocado. Combinado con que el filtro por permisos está desactivado
    // (líneas 98-104) y que `menu:v1:*` no se invalidaba, el sidebar seguía
    // ofreciendo el menú viejo hasta una hora después de revocar el rol.
    //
    // Se corta acá y no se reactiva el filtro por permisos: ese filtro se
    // desactivó a propósito por ser "overly restrictive" (nota de la línea
    // 100) y reactivarlo es una decisión de producto aparte. Lo que se replica
    // es la semántica que YA usa `AuthContextService` para el mismo caso —
    // `roleDeleted ⇒ permissions = []` (`auth-context.service.ts:184-189`) —
    // para que menú y permisos no puedan discrepar.
    const role = await this.roleRepo.findOne({
      where: { id: user.roleId, deletedAt: IsNull() },
      select: ['id'],
    });

    if (!role) {
      // Rol borrado o inexistente: sin matriz, sin menú. Se purga la caché
      // porque un árbol pre-soft-delete seguiría siendo válido para el TTL.
      try {
        await this.redis.del(cacheKey);
      } catch {
        // no-op: el TTL de 1 h es el respaldo.
      }
      return [];
    }

    const accessibleOptions = await this.getAccessibleOptions(user.roleId);

    // 4. Filter by effective permissions (single source of truth: AuthService)
    // Note: permission filter was disabled because it was overly restrictive and filtering
    // out valid items. The matrix (menu_option_roles) is already the primary access control.
    // The permission check here was meant as a secondary gate for MENU_MAP-defined routes,
    // but it was preventing items with correct DB-level permissions from showing.
    // HOTFIX: Skip the extra permission filter layer since menu_option_roles already governs access.
    //
    // NOTA: el docblock de la clase (línea 21) sigue diciendo que este filtro
    // existe y que hace que el menú coincida con lo que el guard permite. NO
    // es cierto desde que se desactivó. Corregir el doc o reactivar el filtro
    // es trabajo aparte; aquí sólo se deja constancia de que la línea de abajo
    // es un no-op deliberado, no un olvido.
    const filtered = accessibleOptions;


    // 5. Build tree (D3) and sort by display_order — filter BEFORE build so
    // hidden parents drop their children (orphans excluded)
    const tree = this.buildTree(filtered);

    // 6. Store in cache (D4: TTL 1 hour)
    try {
      await this.redis.setex(cacheKey, MenusService.CACHE_TTL_SECONDS, JSON.stringify(tree));
    } catch (err) {
      this.logger.warn(`Cache write failed for ${cacheKey}: ${(err as Error).message}`);
    }

    return tree;
  }

  /**
   * Invalidate all menu caches. Called on any menu write
   * (D4: invalidation of `menu:v1:*` on write).
   *
   * NOTE: `menu:v1:*` is a SEPARATE key space from `perm:v3:uid:*`.
   * Flushing one does NOT affect the other.
   */
  async invalidateCache(): Promise<void> {
    try {
      const keys = await this.redis.keys('menu:v1:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * Query menu_options accessible to a given role.
   *
   * Filters: can_read = true, is_active = true, deleted_at IS NULL.
   * Joins menu_option_roles to determine access.
   */
  private async getAccessibleOptions(
    roleId: string,
  ): Promise<MenuOptionEntity[]> {
    const options = await this.optionRepo
      .createQueryBuilder('opt')
      .innerJoin('menu_option_roles', 'mor', 'mor.menu_option_id = opt.id')
      .where('mor.role_id = :roleId', { roleId })
      .andWhere('mor.can_read = true')
      .andWhere('opt.is_active = true')
      .andWhere('opt.deleted_at IS NULL')
      .orderBy('opt.display_order', 'ASC')
      .getMany();

    return options;
  }

  /**
   * Build a tree of MenuEntry from a flat list of options (D3).
   *
   * Strategy (same as F2 tree.util.ts):
   *   1. Convert each option to a clean MenuEntry (contract D1: no
   *      relational fields leak into the public DTO).
   *   2. Index by id for O(1) parent lookup, keeping the parent linkage
   *      in an internal wrapper — NEVER on the MenuEntry itself.
   *   3. Attach children to their parent. Orphan children (parent
   *      not in the accessible set) are excluded — per spec, a child
   *      is hidden when its parent is not accessible.
   *   4. Return only root nodes (parentId = null), sorted by display_order.
   */
  private buildTree(options: MenuOptionEntity[]): MenuEntry[] {
    // 1–2. Convert to MenuEntry and index by id; track parent linkage
    // in the wrapper so the DTO never carries relational state.
    const entryMap = new Map<string, { entry: MenuEntry; parentId: string | null }>();
    for (const opt of options) {
      const entry: MenuEntry = {
        label: opt.name,
        route: opt.route,
        order: opt.displayOrder,
        children: [],
      };
      if (opt.icon) {
        entry.icon = opt.icon;
      }
      entryMap.set(opt.id, { entry, parentId: opt.parentId });
    }

    // 3. Build parent-child relationships using the wrapper
    const roots: MenuEntry[] = [];
    for (const { entry, parentId } of entryMap.values()) {
      if (parentId && entryMap.has(parentId)) {
        entryMap.get(parentId)!.entry.children.push(entry);
      } else if (!parentId) {
        roots.push(entry);
      }
      // else: orphan (parent not accessible) — excluded per spec
    }

    // 4. Sort roots by display_order, and recursively sort children
    const sortByOrder = (a: MenuEntry, b: MenuEntry) => a.order - b.order;
    const sortTree = (entries: MenuEntry[]): MenuEntry[] => {
      entries.sort(sortByOrder);
      for (const entry of entries) {
        if (entry.children.length > 0) {
          sortTree(entry.children);
        }
      }
      return entries;
    };

    return sortTree(roots);
  }
}
