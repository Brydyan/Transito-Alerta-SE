import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { PermissionEntity } from '../../entities/permission.entity';

/**
 * PermissionsService (R7) — read-only catalog of valid resource+action
 * pairs, consumed by admin/menu tooling. PermissionGuard's own
 * authorization decision never queries this table (design D3) — this
 * exists so roles can be composed from a known-valid set instead of free
 * text, and so a newly-introduced resource with no rows here is visibly
 * absent rather than silently assumed to exist.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
  ) {}

  /** T7.2.B2 — soft-deleted catalog rows are excluded from the listing. */
  findAll(): Promise<PermissionEntity[]> {
    return this.permissionRepo.find({ where: { deletedAt: IsNull() } });
  }
}
