import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { EventsGateway } from './events.gateway';
export declare const RETRY_BACKOFF_MS = 1000;
export declare class RealtimeStreamsConsumer implements OnModuleInit, OnModuleDestroy {
    private readonly redis;
    private readonly gateway;
    private readonly logger;
    private readonly consumerName;
    private running;
    constructor(redis: Redis, gateway: EventsGateway);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private loop;
    private sleep;
    processResponse(response: [string, [string, string[]][]][]): void;
}
