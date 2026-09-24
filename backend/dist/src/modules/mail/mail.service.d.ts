import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { TemplateName } from './templates/mail-templates';
export declare const MAIL_OUTBOX_STREAM_KEY = "mail:outbox";
export declare const MAIL_DEAD_STREAM_KEY = "mail:dead";
export interface OutboundMail {
    to: string;
    subject: string;
    template: TemplateName;
    data: Record<string, unknown>;
}
export declare class MailService {
    private readonly redis;
    private readonly configService;
    private readonly logger;
    constructor(redis: Redis, configService: ConfigService);
    enqueue(msg: OutboundMail): Promise<string>;
    renderTemplate(name: TemplateName, data: Record<string, unknown>): string;
    deliver(to: string, subject: string, template: TemplateName, data: Record<string, unknown>): Promise<void>;
    private deliverViaSmtp;
}
