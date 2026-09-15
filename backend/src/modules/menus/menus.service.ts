import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../core/core.module';
import { UserEntity } from '../../entities/user.entity';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { MenuEntry } from './menu-map';

/**
 * MenusService — resolves the user's navigation menu from the database.
 *
 * F5 rewrite (D1/D3/D4):
 *   - Reads `menu_options` + `menu_option_roles` instead of MENU_MAP.
 *   - Builds the tree in memory by `parent_id` (D3).
 *   - Caches per role: `menu:v1:role:{roleId}` with TTL 1 hour (D4).
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
  private static readonly CACHE_PREFIX = 'menu:v1:role:';
  private static readonly CACHE_TTL_SECONDS = 3600; // 1 hour

  private readonly logger = new Logger(MenusService.name);

  constructor(
    @InjectRepository(MenuOptionEntity)
    private readonly optionRepo: Repository<MenuOptionEntity>,
    @InjectRepository(MenuOptionRoleEntity)
    private readonly roleAccessRepo: Repository<MenuOptionRoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Resolve the menu for a given user.
   *
   * Flow (design Data Flow):
   *   userId → roleId (from users.role_id) → cache lookup → DB query
   *   → tree build → cache store → response.
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

    // 2. Check cache (D4: menu:v1:role:{roleId})
    const cacheKey = `${MenusService.CACHE_PREFIX}${user.roleId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as MenuEntry[];
      }
    } catch (err) {
      // Cache miss on error — proceed to DB query
      this.logger.warn(`Cache read failed for ${cacheKey}: ${(err as Error).message}`);
    }

    // 3. Query accessible options from DB
    const accessibleOptions = await this.getAccessibleOptions(user.roleId);

    // 4. Build tree (D3) and sort by display_order
    const tree = this.buildTree(accessibleOptions);

    // 5. Store in cache (D4: TTL 1 hour)
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
      const keys = await this.redis.keys(`${MenusService.CACHE_PREFIX}*`);
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
