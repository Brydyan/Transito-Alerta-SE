import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { RoleEntity } from '../../entities/role.entity';
import { MenusService } from './menus.service';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { SetRoleAccessDto } from './dto/set-role-access.dto';
import { AssignEndpointsDto } from './dto/assign-endpoints.dto';

/**
 * Scope grouping for the role matrix (F5.5.5, Q1).
 * Three blocks: platform, organization, public.
 */
export interface RoleMatrixEntry {
  roleId: string;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
}

export interface RoleMatrix {
  platform: RoleMatrixEntry[];
  organization: RoleMatrixEntry[];
  public: RoleMatrixEntry[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * MenuOptionsService (F5.5) — CRUD, validations, role matrix, endpoint
 * assignment for dynamic menu options.
 *
 * Validations (F5.5.1):
 *   - Cycle in ancestor chain ⇒ 422 (BadRequestException)
 *   - Self-parent ⇒ 422 (BadRequestException)
 *   - Duplicate route ⇒ 409 (ConflictException)
 *   - Delete with children ⇒ 409 (ConflictException)
 *   - can_write without can_read ⇒ 422 (BadRequestException)
 *
 * Design decisions:
 *   D3: Cycle validation walks the ancestor chain before persisting.
 *   D4: Any write invalidates menu:v1:* cache.
 *   D6: Soft delete on menu_options; physical delete on join tables.
 *   D7: menu-map.ts stays as rollback path.
 */
@Injectable()
export class MenuOptionsService {
  /**
   * sc-334 Phase 10 — sub-menu name → API module inference map.
   *
   * Drives the auto-association fallback in `getAssignedEndpoints` when
   * the `menu_option_endpoints` junction has no rows for the selected
   * option. Each key is the exact menu option name; each value is the
   * first path segment under `/api/` (the "module") used to match
   * `api_endpoints.path`.
   *
   * Sub-sub-menus (Crear X / Editar X) inherit their module from the
   * parent's name automatically — no per-sub-sub-menu entry needed.
   *
   * Coverage: the 12 main sub-menus across INCIDENCIAS / GESTIÓN /
   * CATÁLOGOS plus Auditoría de Acceso (admin audit log) and Controles
   * (admin menu-options module). Section roots (Dashboard, INCIDENCIAS,
   * GESTIÓN, CATÁLOGOS) intentionally have NO mapping — they have no
   * associated endpoints.
   */
  private static readonly NAME_TO_API_MODULE: Record<string, string> = {
    // GESTIÓN
    Usuarios: 'users',
    Roles: 'roles',
    Organizaciones: 'organizations',
    Departamentos: 'departments',
    'Auditoría de Acceso': 'audit-logs',
    Controles: 'menu-options',
    // CATÁLOGOS (route `/ubicaciones` maps to geo-zones API)
    Ubicaciones: 'geo-zones',
    Categorías: 'incident-categories',
    // INCIDENCIAS
    'Lista de Incidencias': 'incidents',
    Mapa: 'geo-zones',
    Reportar: 'incidents',
    Inicio: 'incidents',
  };

  constructor(
    @InjectRepository(MenuOptionEntity)
    private readonly optionRepo: Repository<MenuOptionEntity>,
    @InjectRepository(MenuOptionRoleEntity)
    private readonly roleAccessRepo: Repository<MenuOptionRoleEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(MenuOptionEndpointEntity)
    private readonly optionEndpointRepo: Repository<MenuOptionEndpointEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    private readonly menusService: MenusService,
  ) {}

  // ── CRUD ───────────────────────────────────────────────────────────────

  async findAll(): Promise<MenuOptionEntity[]> {
    return this.optionRepo.find({
      where: { deletedAt: IsNull() },
      order: { displayOrder: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MenuOptionEntity> {
    const option = await this.optionRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!option) {
      throw new NotFoundException(`Menu option ${id} not found`);
    }
    return option;
  }

  async create(dto: CreateMenuOptionDto): Promise<MenuOptionEntity> {
    await this.assertRouteUnique(dto.route);
    if (dto.parentId) {
      await this.assertValidParent(dto.parentId, null);
    }

    const option = this.optionRepo.create({
      name: dto.name,
      route: dto.route,
      icon: dto.icon ?? null,
      parentId: dto.parentId ?? null,
      displayOrder: dto.displayOrder,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.optionRepo.save(option);
    await this.menusService.invalidateCache();
    return saved;
  }

  async update(id: string, dto: UpdateMenuOptionDto): Promise<MenuOptionEntity> {
    const option = await this.findOne(id);

    if (dto.route !== undefined && dto.route !== option.route) {
      await this.assertRouteUnique(dto.route, id);
    }

    if (dto.parentId !== undefined && dto.parentId !== option.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A menu option cannot be its own parent');
      }
      if (dto.parentId) {
        await this.assertValidParent(dto.parentId, id);
      }
    }

    if (dto.name !== undefined) option.name = dto.name;
    if (dto.route !== undefined) option.route = dto.route;
    if (dto.icon !== undefined) option.icon = dto.icon;
    if (dto.parentId !== undefined) option.parentId = dto.parentId;
    if (dto.displayOrder !== undefined) option.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) option.isActive = dto.isActive;

    const saved = await this.optionRepo.save(option);
    await this.menusService.invalidateCache();
    return saved;
  }

  async delete(id: string): Promise<void> {
    const option = await this.findOne(id);

    const children = await this.optionRepo.find({
      where: { parentId: id, deletedAt: IsNull() },
    });
    if (children.length > 0) {
      throw new ConflictException(
        `Cannot delete menu option ${id}: it has ${children.length} child(ren). Reassign or delete them first.`,
      );
    }

    option.deletedAt = new Date();
    await this.optionRepo.save(option);
    await this.menusService.invalidateCache();
  }

  // ── Role matrix (F5.5.5) ─────────────────────────────────────────────

  /**
   * Returns the role matrix for a menu option, grouped by scope
   * into three blocks: platform, organization, public.
   *
   * Roles created after the option still appear in their block
   * with can_read=false, can_write=false (not absent).
   * Anonymous user is NOT listed — it is not a roles row (Q5).
   */
  async getRoleMatrix(optionId: string): Promise<RoleMatrix> {
    // Verify the option exists
    await this.findOne(optionId);

    const roles = await this.roleRepo.find({
      where: { deletedAt: IsNull() },
      order: { name: 'ASC' },
    });

    const accessRows = await this.roleAccessRepo.find({
      where: { menuOptionId: optionId },
    });

    const accessMap = new Map<string, MenuOptionRoleEntity>();
    for (const row of accessRows) {
      accessMap.set(row.roleId, row);
    }

    const matrix: RoleMatrix = {
      platform: [],
      organization: [],
      public: [],
    };

    for (const role of roles) {
      const access = accessMap.get(role.id);
      const entry: RoleMatrixEntry = {
        roleId: role.id,
        roleName: role.name,
        canRead: access?.canRead ?? false,
        canWrite: access?.canWrite ?? false,
      };

      const scope = role.scope ?? 'organization';
      if (scope === 'platform') {
        matrix.platform.push(entry);
      } else if (scope === 'public') {
        matrix.public.push(entry);
      } else {
        matrix.organization.push(entry);
      }
    }

    return matrix;
  }

  /**
   * Set access for a specific role on a menu option.
   * Validates can_write without can_read ⇒ 422 (F5.5.1).
   */
  async setRoleAccess(
    optionId: string,
    roleId: string,
    dto: SetRoleAccessDto,
  ): Promise<MenuOptionRoleEntity> {
    if (dto.canWrite && !dto.canRead) {
      throw new BadRequestException(
        'can_write requires can_read: you cannot write to something you cannot see',
      );
    }

    // Verify option and role exist
    await this.findOne(optionId);
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    let access = await this.roleAccessRepo.findOne({
      where: { menuOptionId: optionId, roleId },
    });

    if (access) {
      access.canRead = dto.canRead;
      access.canWrite = dto.canWrite;
    } else {
      access = this.roleAccessRepo.create({
        menuOptionId: optionId,
        roleId,
        canRead: dto.canRead,
        canWrite: dto.canWrite,
      });
    }

    const saved = await this.roleAccessRepo.save(access);
    await this.menusService.invalidateCache();
    return saved;
  }

  // ── Endpoint assignment (F5.5.6) ──────────────────────────────────────

  /**
   * Assign endpoints to a menu option. Idempotent: re-assigning creates
   * no second row. Removes endpoints not in the new list.
   */
  async assignEndpoints(
    optionId: string,
    dto: AssignEndpointsDto,
  ): Promise<MenuOptionEndpointEntity[]> {
    await this.findOne(optionId);

    // Remove existing assignments
    await this.optionEndpointRepo.delete({ menuOptionId: optionId });

    // Create new assignments (idempotent by design — no duplicate check needed
    // since we deleted all first)
    const assignments: MenuOptionEndpointEntity[] = [];
    for (const endpointId of dto.endpointIds) {
      const assignment = this.optionEndpointRepo.create({
        menuOptionId: optionId,
        endpointId,
      });
      const saved = await this.optionEndpointRepo.save(assignment);
      assignments.push(saved);
    }

    return assignments;
  }

  /**
   * Paginated endpoint catalog, filterable by route, method, description,
   * or module (case-insensitive substring on path — design D6).
   */
  async getEndpointCatalog(
    query: {
      page?: number;
      limit?: number;
      route?: string;
      method?: string;
      description?: string;
      module?: string;
    } = {},
  ): Promise<PaginatedResult<ApiEndpointEntity>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.endpointRepo.createQueryBuilder('ep');

    if (query.route) {
      qb.andWhere('ep.path ILIKE :route', { route: `%${query.route}%` });
    }
    if (query.method) {
      qb.andWhere('ep.method = :method', { method: query.method.toUpperCase() });
    }
    if (query.description) {
      qb.andWhere('ep.description ILIKE :desc', { description: `%${query.description}%` });
    }
    if (query.module && query.module.trim().length > 0) {
      // design D6: module is a substring of the route. e.g. module=incidents
      // matches any path that contains "incidents" (case-insensitive).
      qb.andWhere('ep.path ILIKE :module', { module: `%${query.module.trim()}%` });
    }

    qb.orderBy('ep.method', 'ASC')
      .addOrderBy('ep.path', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  // ── Phase 1 (1.1/1.2) — getAssignedEndpoints (design D1) ───────────────

  /**
   * Returns the API endpoints currently assigned to a menu option.
   *
   * Used by the menu-options frontend to hydrate the "Asignados" panel
   * of the endpoint picker when the user selects an option. Returns an
   * empty array when no endpoints are assigned. Throws 404 if the option
   * itself does not exist.
   *
   * Design D1 / spec R1: implemented as a separate endpoint, not as part
   * of `findOne()`, to keep each GET focused (single-responsibility).
   *
   * sc-334 admin-controles-enhancements Phase 10 — auto-association:
   * the `menu_option_endpoints` junction table is empty by default
   * (nobody has manually assigned endpoints yet). To make the admin UI
   * useful out-of-the-box, when the junction is empty for the selected
   * option we fall back to a name → API module inference:
   *
   *   - For sub-menus (no parent_id): lookup own name in
   *     NAME_TO_API_MODULE → return all endpoints under `/api/{module}*`
   *   - For sub-sub-menus (parent_id set): inherit module from parent
   *     name → filter by action prefix:
   *       "Crear X"   → POST   /api/{module}
   *       "Editar X"  → PATCH  /api/{module}/:id
   *       default     → all endpoints in module (list view)
   *
   * Manual assignment via PUT still wins: if the junction table has rows
   * for the selected option, we return those and skip inference entirely.
   * That way the admin can still override the inference with explicit
   * assignments per menu option.
   */
  async getAssignedEndpoints(optionId: string): Promise<ApiEndpointEntity[]> {
    // 404 first (consistent with findOne behavior).
    const option = await this.findOne(optionId);

    // (1) Manual junction — admin override wins if populated.
    const direct = await this.queryAssignedFromJunction(optionId);
    if (direct.length > 0) {
      return direct;
    }

    // (2) Auto-association: derive API module + level from the option's
    // position in the hierarchy. Section headers have no module.
    const inferred = await this.inferApiModule(option);
    if (!inferred) {
      return [];
    }

    return this.queryEndpointsInModule(
      inferred.apiModule,
      option,
      inferred.isLevel3,
    );
  }

  /**
   * Pulls endpoints directly linked via `menu_option_endpoints` (manual
   * assignment path). Returns [] when the junction has no rows for the
   * option — used as a signal to fall back to auto-association.
   */
  private async queryAssignedFromJunction(
    optionId: string,
  ): Promise<ApiEndpointEntity[]> {
    return this.endpointRepo
      .createQueryBuilder('ep')
      .innerJoin(
        'menu_option_endpoints',
        'moe',
        'moe.endpoint_id = ep.id AND moe.menu_option_id = :optionId',
        { optionId },
      )
      .orderBy('ep.method', 'ASC')
      .addOrderBy('ep.path', 'ASC')
      .getMany();
  }

  /**
   * Resolves the API module for a menu option via name-based lookup.
   *
   * Hierarchy:
   *   Level 1 — section headers (Dashboard, INCIDENCIAS, GESTIÓN, …):
   *     no parent → no module mapping → returns null (endpoints []).
   *   Level 2 — sub-menus (Usuarios, Roles, Lista de Incidencias, …):
   *     parent is a section header (no grandparent) → use OWN name.
   *   Level 3 — sub-sub-menus (Crear usuario, Editar rol, …):
   *     parent is a level-2 sub-menu (has grandparent) → use PARENT's
   *     name so the module is inherited.
   *
   * Distinguishing level-2 vs level-3: both have parent_id, so we look
   * up the parent and check if the parent itself has a parent_id. If
   * the parent has no parent (it's a section header), we're looking at
   * a level-2 option → use OWN name. If the parent has its own parent
   * (it's a level-2 sub-menu), we're looking at a level-3 option → use
   * PARENT's name.
   *
   * Returns null when no mapping exists for the resolved name.
   */
  private async inferApiModule(
    option: MenuOptionEntity,
  ): Promise<{ apiModule: string; isLevel3: boolean } | null> {
    // Level 1 — section header, no endpoints.
    if (!option.parentId) {
      return null;
    }

    const parent = await this.optionRepo.findOne({
      where: { id: option.parentId },
    });
    if (!parent) {
      return null;
    }

    // Level 3 — sub-sub-menu (parent has its own parent, i.e. parent is
    // a level-2 sub-menu). Inherit the module from the parent name.
    if (parent.parentId) {
      const apiModule =
        MenuOptionsService.NAME_TO_API_MODULE[parent.name] ?? null;
      return apiModule ? { apiModule, isLevel3: true } : null;
    }

    // Level 2 — sub-menu (parent is a section header with no grandparent).
    // Use OWN name as the module.
    const apiModule =
      MenuOptionsService.NAME_TO_API_MODULE[option.name] ?? null;
    return apiModule ? { apiModule, isLevel3: false } : null;
  }

  /**
   * Queries `api_endpoints` for all rows whose path matches the given
   * module prefix. For sub-sub-menus (level-3 — parent is itself a
   * sub-menu) with a recognized action prefix in their name, the
   * result is narrowed to the specific HTTP method + path pattern
   * for that action. Sub-menus (level-2 — parent is a section header)
   * get all endpoints in their module.
   */
  private async queryEndpointsInModule(
    apiModule: string,
    option: MenuOptionEntity,
    isLevel3: boolean,
  ): Promise<ApiEndpointEntity[]> {
    const pathPrefix = `/api/${apiModule}`;
    const qb = this.endpointRepo
      .createQueryBuilder('ep')
      .orderBy('ep.method', 'ASC')
      .addOrderBy('ep.path', 'ASC');

    if (isLevel3) {
      // Sub-sub-menu: filter by action prefix in the option name.
      const lowerName = option.name.toLowerCase();
      if (lowerName.startsWith('crear ')) {
        qb.where('ep.method = :method AND ep.path = :path', {
          method: 'POST',
          path: pathPrefix,
        });
      } else if (lowerName.startsWith('editar ')) {
        qb.where('ep.method = :method AND ep.path LIKE :pattern', {
          method: 'PATCH',
          pattern: `${pathPrefix}/%`,
        });
      } else if (lowerName.startsWith('ver ')) {
        qb.where('ep.method = :method AND ep.path LIKE :pattern', {
          method: 'GET',
          pattern: `${pathPrefix}%`,
        });
      } else {
        qb.where('ep.path LIKE :pattern', { pattern: `${pathPrefix}%` });
      }
    } else {
      // Level-2 sub-menu: all endpoints in module.
      qb.where('ep.path LIKE :pattern', { pattern: `${pathPrefix}%` });
    }

    return qb.getMany();
  }

  // ── Private validation helpers ─────────────────────────────────────────

  /**
   * Assert route is unique among non-deleted options (F5.5.1).
   * @param excludeId - option ID to exclude (for updates)
   */
  private async assertRouteUnique(route: string, excludeId?: string): Promise<void> {
    const existing = await this.optionRepo.findOne({
      where: { route, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Route '${route}' is already used by another menu option`);
    }
  }

  /**
   * Validate parent: no self-parent, no cycles (F5.5.3, D3).
   * Walks the ancestor chain of the CHILD node upward to detect if the
   * proposed parent is already an ancestor (which would create a cycle).
   */
  private async assertValidParent(parentId: string, childId: string | null): Promise<void> {
    if (childId && parentId === childId) {
      throw new BadRequestException('A menu option cannot be its own parent');
    }

    const parent = await this.optionRepo.findOne({ where: { id: parentId, deletedAt: IsNull() } });
    if (!parent) {
      throw new NotFoundException(`Parent menu option ${parentId} not found`);
    }

    // Walk ancestor chain of the CHILD upward to detect cycles.
    // If we find the proposed parentId in the child's ancestors,
    // setting it would create a cycle.
    if (childId) {
      const visited = new Set<string>([childId]);
      let current = await this.optionRepo.findOne({
        where: { id: childId, deletedAt: IsNull() },
      });

      while (current?.parentId) {
        if (current.parentId === parentId) {
          throw new BadRequestException(
            `Cycle detected: setting parent to ${parentId} would create a cycle in the menu hierarchy`,
          );
        }
        if (visited.has(current.parentId)) {
          throw new BadRequestException(
            `Cycle detected: setting parent to ${parentId} would create a cycle in the menu hierarchy`,
          );
        }
        visited.add(current.parentId);
        current = await this.optionRepo.findOne({
          where: { id: current.parentId, deletedAt: IsNull() },
        });
      }
    }
  }
}
