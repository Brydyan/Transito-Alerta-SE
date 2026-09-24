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
var RealtimeStreamsConsumer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeStreamsConsumer = exports.RETRY_BACKOFF_MS = void 0;
const common_1 = require("@nestjs/common");
const core_module_1 = require("../../core/core.module");
const incidents_service_1 = require("../incidents/incidents.service");
const events_gateway_1 = require("./events.gateway");
const stream_event_util_1 = require("./stream-event.util");
const CONSUMER_GROUP = 'realtime';
exports.RETRY_BACKOFF_MS = 1000;
let RealtimeStreamsConsumer = RealtimeStreamsConsumer_1 = class RealtimeStreamsConsumer {
    constructor(redis, gateway) {
        this.redis = redis;
        this.gateway = gateway;
        this.logger = new common_1.Logger(RealtimeStreamsConsumer_1.name);
        this.consumerName = `consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
        this.running = false;
    }
    async onModuleInit() {
        try {
            await this.redis.xgroup('CREATE', incidents_service_1.INCIDENTS_STREAM_KEY, CONSUMER_GROUP, '$', 'MKSTREAM');
        }
        catch (err) {
            if (!err.message?.includes('BUSYGROUP')) {
                this.logger.error(`Failed to create consumer group: ${err.message}`);
            }
        }
        this.running = true;
        void this.loop();
    }
    async onModuleDestroy() {
        this.running = false;
        await this.redis.quit().catch(() => undefined);
    }
    async loop() {
        while (this.running) {
            try {
                const response = await this.redis.xreadgroup('GROUP', CONSUMER_GROUP, this.consumerName, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', incidents_service_1.INCIDENTS_STREAM_KEY, '>');
                if (response) {
                    this.processResponse(response);
                }
            }
            catch (err) {
                if (!this.running) {
                    break;
                }
                this.logger.error(`Streams consumer loop error: ${err.message}`);
                await this.sleep(exports.RETRY_BACKOFF_MS);
            }
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    processResponse(response) {
        for (const [, entries] of response) {
            for (const [entryId, fields] of entries) {
                const event = (0, stream_event_util_1.decodeStreamEntry)(fields);
                if (event) {
                    this.gateway.broadcast(event.type, event.data);
                }
                void this.redis.xack(incidents_service_1.INCIDENTS_STREAM_KEY, CONSUMER_GROUP, entryId);
            }
        }
    }
};
exports.RealtimeStreamsConsumer = RealtimeStreamsConsumer;
exports.RealtimeStreamsConsumer = RealtimeStreamsConsumer = RealtimeStreamsConsumer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.REDIS_BLOCKING_CLIENT)),
    __metadata("design:paramtypes", [Function, events_gateway_1.EventsGateway])
], RealtimeStreamsConsumer);
//# sourceMappingURL=streams.consumer.js.map