"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIoAdapter = void 0;
const config_1 = require("@nestjs/config");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const ioredis_1 = __importDefault(require("ioredis"));
class RedisIoAdapter extends platform_socket_io_1.IoAdapter {
    constructor(app) {
        super(app);
        this.app = app;
    }
    createIOServer(port, options) {
        const config = this.app.get(config_1.ConfigService);
        const cacheConf = config.get('cache');
        this.pubClient = new ioredis_1.default(cacheConf.redisUrl);
        this.subClient = this.pubClient.duplicate();
        const server = super.createIOServer(port, options);
        server.adapter((0, redis_adapter_1.createAdapter)(this.pubClient, this.subClient));
        return server;
    }
    async close(server) {
        await super.close(server);
        this.pubClient?.disconnect();
        this.subClient?.disconnect();
    }
}
exports.RedisIoAdapter = RedisIoAdapter;
//# sourceMappingURL=redis-io.adapter.js.map