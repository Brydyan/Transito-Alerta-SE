import { OnApplicationBootstrap } from '@nestjs/common';
import type Redis from 'ioredis';
import { SessionsRepository } from './sessions.repository';
export declare class SessionsBootWarmService implements OnApplicationBootstrap {
    private readonly sessionsRepository;
    private readonly redis;
    private readonly logger;
    constructor(sessionsRepository: SessionsRepository, redis: Redis);
    onApplicationBootstrap(): Promise<void>;
}
