import { OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Repository } from 'typeorm';
import { ApiEndpointEntity } from '../entities/api-endpoint.entity';
export interface DiscoveredEndpoint {
    method: string;
    path: string;
    source: string;
}
export interface EndpointSyncResult {
    discovered: number;
    inserted: number;
    preserved: number;
    skipped: number;
}
export declare class EndpointDiscoveryService implements OnApplicationBootstrap {
    private readonly discovery;
    private readonly scanner;
    private readonly endpointRepo;
    private readonly logger;
    constructor(discovery: DiscoveryService, scanner: MetadataScanner, endpointRepo: Repository<ApiEndpointEntity>);
    onApplicationBootstrap(): Promise<void>;
    discover(): DiscoveredEndpoint[];
    syncToDatabase(): Promise<EndpointSyncResult>;
    private buildFullPath;
}
