"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Sentry = __importStar(require("@sentry/node"));
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const snake_case_response_interceptor_1 = require("./common/interceptors/snake-case-response.interceptor");
const request_id_logger_1 = require("./common/observability/request-id.logger");
const redis_io_adapter_1 = require("./modules/realtime/redis-io.adapter");
const proxy_trust_1 = require("./common/proxy-trust");
async function bootstrap() {
    if (process.env.SENTRY_DSN) {
        Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV ?? 'development',
            tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        });
    }
    const DEFAULT_LOG_LEVELS = ['error', 'warn', 'log'];
    const logLevels = process.env.LOG_LEVEL
        ? process.env.LOG_LEVEL.split(',')
            .map((l) => l.trim())
            .filter(Boolean)
        : DEFAULT_LOG_LEVELS;
    const logger = new request_id_logger_1.RequestIdLogger();
    logger.setLogLevels(logLevels);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger });
    app.getHttpAdapter().getInstance().set('trust proxy', proxy_trust_1.isTrustedProxyAddress);
    app.useWebSocketAdapter(new redis_io_adapter_1.RedisIoAdapter(app));
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: false,
    }));
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: process.env.CORS_ORIGIN?.split(',') ?? true,
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.useGlobalInterceptors(new snake_case_response_interceptor_1.SnakeCaseResponseInterceptor());
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('Transito Alerta SE — API')
            .setDescription('Backend NestJS — migración GeoReporta')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
    await app.listen(port);
    console.log(`Transito Alerta API listening on :${port}/api`);
}
bootstrap().catch((error) => {
    console.error('Failed to start Transito Alerta API', error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map