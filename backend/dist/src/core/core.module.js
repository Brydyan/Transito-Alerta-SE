"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreModule = exports.SESSION_REDIS_CLIENT = exports.MAIL_EVENTS_BLOCKING_CLIENT = exports.MAIL_BLOCKING_CLIENT = exports.REDIS_BLOCKING_CLIENT = exports.REDIS_CLIENT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const typeorm_1 = require("@nestjs/typeorm");
const cache_manager_1 = require("@nestjs/cache-manager");
const cache_manager_redis_yet_1 = require("cache-manager-redis-yet");
const ioredis_1 = __importDefault(require("ioredis"));
const database_config_1 = __importDefault(require("../config/database.config"));
const auth_config_1 = __importDefault(require("../config/auth.config"));
const cache_config_1 = __importDefault(require("../config/cache.config"));
const mail_config_1 = __importDefault(require("../config/mail.config"));
const storage_config_1 = __importDefault(require("../config/storage.config"));
const permission_entity_1 = require("../entities/permission.entity");
const permission_lookup_service_1 = require("../common/permissions/permission-lookup.service");
exports.REDIS_CLIENT = 'REDIS_CLIENT';
exports.REDIS_BLOCKING_CLIENT = 'REDIS_BLOCKING_CLIENT';
exports.MAIL_BLOCKING_CLIENT = 'MAIL_BLOCKING_CLIENT';
exports.MAIL_EVENTS_BLOCKING_CLIENT = 'MAIL_EVENTS_BLOCKING_CLIENT';
exports.SESSION_REDIS_CLIENT = 'SESSION_REDIS_CLIENT';
let CoreModule = class CoreModule {
};
exports.CoreModule = CoreModule;
exports.CoreModule = CoreModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [database_config_1.default, auth_config_1.default, cache_config_1.default, mail_config_1.default, storage_config_1.default],
                envFilePath: ['.env'],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => config.get('database'),
            }),
            typeorm_1.TypeOrmModule.forFeature([permission_entity_1.PermissionEntity]),
            cache_manager_1.CacheModule.registerAsync({
                isGlobal: true,
                inject: [config_1.ConfigService],
                useFactory: async (config) => {
                    const cacheConf = config.get('cache');
                    const store = await (0, cache_manager_redis_yet_1.redisStore)({
                        url: cacheConf.cacheUrl,
                        ttl: cacheConf.ttlSeconds * 1000,
                    });
                    return { store: () => store };
                },
            }),
            event_emitter_1.EventEmitterModule.forRoot(),
        ],
        providers: [
            {
                provide: exports.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const cacheConf = config.get('cache');
                    return new ioredis_1.default(cacheConf.streamsUrl, {
                        lazyConnect: true,
                        maxRetriesPerRequest: null,
                        enableReadyCheck: true,
                        retryStrategy: (times) => Math.min(times * 200, 5000),
                    });
                },
            },
            {
                provide: exports.REDIS_BLOCKING_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const cacheConf = config.get('cache');
                    return new ioredis_1.default(cacheConf.streamsUrl, {
                        lazyConnect: true,
                        maxRetriesPerRequest: null,
                        enableReadyCheck: true,
                        retryStrategy: (times) => Math.min(times * 200, 5000),
                    });
                },
            },
            {
                provide: exports.MAIL_BLOCKING_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const cacheConf = config.get('cache');
                    return new ioredis_1.default(cacheConf.streamsUrl, {
                        lazyConnect: true,
                        maxRetriesPerRequest: null,
                        enableReadyCheck: true,
                        retryStrategy: (times) => Math.min(times * 200, 5000),
                    });
                },
            },
            {
                provide: exports.MAIL_EVENTS_BLOCKING_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const cacheConf = config.get('cache');
                    return new ioredis_1.default(cacheConf.streamsUrl, {
                        lazyConnect: true,
                        maxRetriesPerRequest: null,
                        enableReadyCheck: true,
                        retryStrategy: (times) => Math.min(times * 200, 5000),
                    });
                },
            },
            {
                provide: exports.SESSION_REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const cacheConf = config.get('cache');
                    return new ioredis_1.default(cacheConf.streamsUrl, {
                        lazyConnect: true,
                        enableOfflineQueue: false,
                        commandTimeout: 50,
                        maxRetriesPerRequest: null,
                        enableReadyCheck: true,
                        retryStrategy: (times) => Math.min(times * 200, 5000),
                    });
                },
            },
            permission_lookup_service_1.PermissionLookupService,
        ],
        exports: [
            config_1.ConfigModule,
            typeorm_1.TypeOrmModule,
            cache_manager_1.CacheModule,
            event_emitter_1.EventEmitterModule,
            exports.REDIS_CLIENT,
            exports.REDIS_BLOCKING_CLIENT,
            exports.MAIL_BLOCKING_CLIENT,
            exports.MAIL_EVENTS_BLOCKING_CLIENT,
            exports.SESSION_REDIS_CLIENT,
            permission_lookup_service_1.PermissionLookupService,
        ],
    })
], CoreModule);
//# sourceMappingURL=core.module.js.map