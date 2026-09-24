import type Redis from 'ioredis';
export interface BufferedTokenPair {
    access_token: string;
    refresh_token: string;
}
export declare class GraceBuffer {
    private readonly redis;
    private readonly logger;
    constructor(redis: Redis);
    set(sid: string, retiringTokenHash: string, pair: BufferedTokenPair, ttlSeconds: number, previousTokenHash: string | null): Promise<void>;
    get(sid: string, presentedTokenHash: string): Promise<BufferedTokenPair | null>;
    clear(sid: string, tokenHash: string): Promise<void>;
}
