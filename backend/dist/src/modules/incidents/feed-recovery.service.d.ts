import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
export declare const CITIZEN_FEED_KEY = "feed:incidents";
export declare class FeedRecoveryService {
    private readonly dataSource;
    private readonly cache;
    private readonly logger;
    constructor(dataSource: DataSource, cache: Cache);
    rebuildFeed(limit?: number): Promise<number>;
    scheduledRebuild(): Promise<void>;
}
