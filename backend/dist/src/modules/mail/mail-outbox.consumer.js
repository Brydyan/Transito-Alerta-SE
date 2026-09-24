"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MailOutboxConsumer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailOutboxConsumer = exports.RETRY_BACKOFF_MS = exports.MAIL_OUTBOX_CONSUMER_GROUP = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_module_1 = require("../../core/core.module");
const mail_service_1 = require("./mail.service");
exports.MAIL_OUTBOX_CONSUMER_GROUP = 'mail';
exports.RETRY_BACKOFF_MS = 1000;
let MailOutboxConsumer = MailOutboxConsumer_1 = class MailOutboxConsumer {
    constructor(redis, mailService, configService) {
        this.redis = redis;
        this.mailService = mailService;
        this.configService = configService;
        this.logger = new common_1.Logger(MailOutboxConsumer_1.name);
        this.consumerName = `mail-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
        this.running = false;
        this.sweeping = false;
    }
    async onModuleInit() {
        try {
            await this.redis.xgroup('CREATE', mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, '$', 'MKSTREAM');
        }
        catch (err) {
            if (err.message?.includes('BUSYGROUP')) {
                await this.redis.xgroup('SETID', mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, '$');
            }
            else {
                this.logger.error(`Failed to create mail consumer group: ${err.message}`);
            }
        }
        this.running = true;
        void this.loop();
        const mailConfig = this.configService.get('mail');
        this.sweepTimer = setInterval(() => void this.sweep(), mailConfig.sweepIntervalMs);
    }
    async onModuleDestroy() {
        this.running = false;
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
        }
        await this.redis.quit().catch(() => undefined);
    }
    async loop() {
        while (this.running) {
            try {
                const blockTimeoutMs = this.configService.get('MAIL_XREADGROUP_BLOCK_MS') ?? 5000;
                const response = await this.redis.xreadgroup('GROUP', exports.MAIL_OUTBOX_CONSUMER_GROUP, this.consumerName, 'COUNT', 10, 'BLOCK', blockTimeoutMs, 'STREAMS', mail_service_1.MAIL_OUTBOX_STREAM_KEY, '>');
                if (response) {
                    const entries = response;
                    const entryCount = entries[0]?.[1]?.length || 0;
                    this.logger.debug(`[loop] XREADGROUP returned ${entryCount} entries`);
                    await this.processResponse(entries);
                }
            }
            catch (err) {
                if (!this.running) {
                    break;
                }
                this.logger.error(`Mail outbox consumer loop error: ${err.message}`);
                await this.sleep(exports.RETRY_BACKOFF_MS);
            }
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async processResponse(response) {
        for (const [, entries] of response) {
            this.logger.debug(`[processResponse] Processing ${entries.length} entries from XREADGROUP`);
            for (const [entryId, fields] of entries) {
                this.logger.debug(`[processResponse] Calling processEntry for ${entryId}`);
                await this.processEntry(entryId, fields);
            }
        }
    }
    async processEntry(entryId, fields) {
        const map = this.decode(fields);
        let data;
        try {
            data = JSON.parse(map.data ?? '');
        }
        catch {
            this.logger.error(`[processEntry] ${entryId} JSON parse failed, moving to dead:letter`);
            await this.deadLetter(entryId, fields);
            return;
        }
        try {
            this.logger.debug(`[processEntry] ${entryId} attempting deliver(to=${map.to})`);
            await this.mailService.deliver(map.to, map.subject, map.template, data);
            this.logger.debug(`[processEntry] ${entryId} SUCCESS, ACKing`);
            await this.redis.xack(mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, entryId);
        }
        catch (err) {
            if (err.message?.startsWith('Unknown mail template')) {
                this.logger.error(`[processEntry] ${entryId} unknown template, moving to dead:letter`);
                await this.deadLetter(entryId, fields);
                return;
            }
            this.logger.error(`[processEntry] ${entryId} FAILED: ${err.message}`);
        }
    }
    async deadLetter(entryId, fields) {
        this.logger.error(`[deadLetter] Entry ${entryId} moved to ${mail_service_1.MAIL_DEAD_STREAM_KEY} (unretryable - data defect)`);
        await this.redis.xadd(mail_service_1.MAIL_DEAD_STREAM_KEY, 'MAXLEN', '~', '1000', '*', ...fields);
        await this.redis.xack(mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, entryId);
    }
    decode(fields) {
        const map = {};
        for (let i = 0; i < fields.length; i += 2) {
            map[fields[i]] = fields[i + 1];
        }
        return map;
    }
    async sweep() {
        if (this.sweeping)
            return;
        this.sweeping = true;
        try {
            await this.sweepImpl();
        }
        finally {
            this.sweeping = false;
        }
    }
    async sweepImpl() {
        const mailConfig = this.configService.get('mail');
        let pending;
        try {
            pending = (await this.redis.xpending(mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, 'IDLE', mailConfig.claimIdleMs, '-', '+', 10));
        }
        catch (err) {
            if (this.running) {
                this.logger.error(`Sweep XPENDING failed: ${err.message}`);
            }
            return;
        }
        if (!pending || pending.length === 0) {
            this.logger.debug(`[sweep] No pending entries (idle > ${mailConfig.claimIdleMs}ms)`);
            return;
        }
        this.logger.debug(`[sweep] Found ${pending.length} pending entries`);
        for (const [entryId, , , deliveryCount] of pending) {
            this.logger.debug(`[sweep] Entry ${entryId}: deliveryCount=${deliveryCount}, maxAttempts=${mailConfig.maxAttempts}`);
            if (deliveryCount >= mailConfig.maxAttempts) {
                this.logger.warn(`[sweep] Entry ${entryId} exhausted (deliveryCount ${deliveryCount} >= ${mailConfig.maxAttempts})`);
                try {
                    await this.deadLetterById(entryId);
                }
                catch (err) {
                    this.logger.error(`Sweep deadLetterById failed for ${entryId}: ${err.message}`);
                }
                continue;
            }
            try {
                this.logger.debug(`[sweep] Claiming ${entryId} (idle > ${mailConfig.claimIdleMs}ms) for retry`);
                const claimed = (await this.redis.xclaim(mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, this.consumerName, mailConfig.claimIdleMs, entryId));
                if (claimed && claimed.length > 0) {
                    const [, fields] = claimed[0];
                    this.logger.debug(`[sweep] Claimed successfully, calling processEntry`);
                    await this.processEntry(entryId, fields);
                }
            }
            catch (err) {
                this.logger.error(`Sweep XCLAIM failed for ${entryId}: ${err.message}`);
            }
        }
    }
    async deadLetterById(entryId) {
        this.logger.debug(`[deadLetterById] Processing ${entryId} for dead letter`);
        const range = (await this.redis.xrange(mail_service_1.MAIL_OUTBOX_STREAM_KEY, entryId, entryId));
        if (range.length === 0) {
            this.logger.warn(`[deadLetterById] ${entryId} not found in stream (already removed?)`);
            return;
        }
        const [, fields] = range[0];
        this.logger.error(`[deadLetterById] ${entryId} exhausted retries, moving to ${mail_service_1.MAIL_DEAD_STREAM_KEY}`);
        try {
            await this.redis.xadd(mail_service_1.MAIL_DEAD_STREAM_KEY, '*', ...fields);
        }
        catch (err) {
            this.logger.error(`[deadLetterById] XADD failed for ${entryId}: ${err.message}`);
            return;
        }
        try {
            const delResult = await this.redis.xdel(mail_service_1.MAIL_OUTBOX_STREAM_KEY, entryId);
            this.logger.debug(`[deadLetterById] XDEL returned ${delResult} for ${entryId}`);
        }
        catch (err) {
            this.logger.error(`[deadLetterById] XDEL failed for ${entryId}: ${err.message}`);
        }
        try {
            const ackResult = await this.redis.xack(mail_service_1.MAIL_OUTBOX_STREAM_KEY, exports.MAIL_OUTBOX_CONSUMER_GROUP, entryId);
            this.logger.debug(`[deadLetterById] XACK returned ${ackResult} for ${entryId}`);
        }
        catch (err) {
            const errMsg = err.message;
            if (errMsg?.includes('Connection is closed')) {
                return;
            }
            if (errMsg?.includes('NOGROUP')) {
                if (!this.running)
                    return;
                throw err;
            }
            this.logger.warn(`[deadLetterById] XACK threw for ${entryId}: ${errMsg}`);
        }
    }
};
exports.MailOutboxConsumer = MailOutboxConsumer;
exports.MailOutboxConsumer = MailOutboxConsumer = MailOutboxConsumer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.MAIL_BLOCKING_CLIENT)),
    __metadata("design:paramtypes", [Function, mail_service_1.MailService,
        config_1.ConfigService])
], MailOutboxConsumer);
//# sourceMappingURL=mail-outbox.consumer.js.map