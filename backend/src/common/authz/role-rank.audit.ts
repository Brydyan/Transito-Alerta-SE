import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { ROLE_RANK } from './role-rank';

/**
 * Boot-time assertion (T3.2 design D9/D10 "RoleRankAudit"). Rank ∞
 * (unknown role) is a SAFE default — it manages nobody — but silent, so
 * this makes the gap loud: any role seeded by a later migration that
 * `ROLE_RANK` does not know about is logged as an error at startup.
 */
@Injectable()
export class RoleRankAudit implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoleRankAudit.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const roles = await this.roleRepo.find();
    const missing = roles.filter((role) => !(role.name in ROLE_RANK)).map((role) => role.name);

    if (missing.length > 0) {
      this.logger.error(
        `Role(s) missing from ROLE_RANK (resolve to rank ∞ — can manage nobody): ${missing.join(', ')}`,
      );
    }
  }
}
