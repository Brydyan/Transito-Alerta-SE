import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { MailService } from './mail.service';
export declare const MAIL_OUTBOX_CONSUMER_GROUP = "mail";
export declare const RETRY_BACKOFF_MS = 1000;
export declare class MailOutboxConsumer implements OnModuleInit, OnModuleDestroy {
    private readonly redis;
    private readonly mailService;
    private readonly configService;
    private readonly logger;
    readonly consumerName: string;
    private running;
    private sweeping;
    private sweepTimer?;
    constructor(redis: Redis, mailService: MailService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private loop;
    private sleep;
    processResponse(response: [string, [string, string[]][]][]): Promise<void>;
    processEntry(entryId: string, fields: string[]): Promise<void>;
    private deadLetter;
    private decode;
    sweep(): Promise<void>;
    private sweepImpl;
    private deadLetterById;
}
