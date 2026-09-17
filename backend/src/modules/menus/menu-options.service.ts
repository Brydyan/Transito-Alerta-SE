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
   * Paginated endpoint catalog, filterable by route, method, or description.
   */
  async getEndpointCatalog(
    query: { page?: number; limit?: number; route?: string; method?: string; description?: string } = {},
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

    qb.orderBy('ep.method', 'ASC')
      .addOrderBy('ep.path', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
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
