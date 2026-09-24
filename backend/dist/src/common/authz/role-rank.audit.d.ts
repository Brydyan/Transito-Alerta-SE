import { OnApplicationBootstrap } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../entities/role.entity';
export declare class RoleRankAudit implements OnApplicationBootstrap {
    private readonly roleRepo;
    private readonly logger;
    constructor(roleRepo: Repository<RoleEntity>);
    onApplicationBootstrap(): Promise<void>;
}
