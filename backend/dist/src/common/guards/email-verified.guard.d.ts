import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
export declare class EmailVerifiedGuard implements CanActivate {
    private readonly reflector;
    private readonly userRepo;
    private static readonly STAFF_ROLES;
    constructor(reflector: Reflector, userRepo: Repository<UserEntity>);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
