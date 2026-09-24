import type Redis from 'ioredis';
export declare class RevocationCache {
    private readonly redis;
    private readonly logger;
    constructor(redis: Redis);
    isRevoked(sid: string): Promise<boolean>;
    revoke(sid: string, ttlSeconds: number): Promise<void>;
}
