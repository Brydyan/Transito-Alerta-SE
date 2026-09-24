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
var EndpointDiscoveryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndpointDiscoveryService = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("@nestjs/common/constants");
const request_method_enum_1 = require("@nestjs/common/enums/request-method.enum");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const api_endpoint_entity_1 = require("../entities/api-endpoint.entity");
const SKIP_METHODS = new Set([
    request_method_enum_1.RequestMethod.ALL,
    request_method_enum_1.RequestMethod.OPTIONS,
    request_method_enum_1.RequestMethod.HEAD,
    request_method_enum_1.RequestMethod.SEARCH,
]);
const METHOD_NAMES = {
    [request_method_enum_1.RequestMethod.GET]: 'GET',
    [request_method_enum_1.RequestMethod.POST]: 'POST',
    [request_method_enum_1.RequestMethod.PUT]: 'PUT',
    [request_method_enum_1.RequestMethod.DELETE]: 'DELETE',
    [request_method_enum_1.RequestMethod.PATCH]: 'PATCH',
};
let EndpointDiscoveryService = EndpointDiscoveryService_1 = class EndpointDiscoveryService {
    constructor(discovery, scanner, endpointRepo) {
        this.discovery = discovery;
        this.scanner = scanner;
        this.endpointRepo = endpointRepo;
        this.logger = new common_1.Logger(EndpointDiscoveryService_1.name);
    }
    async onApplicationBootstrap() {
        try {
            const result = await this.syncToDatabase();
            this.logger.log(`Endpoint discovery: ${result.discovered} discovered, ${result.inserted} inserted, ${result.preserved} preserved`);
        }
        catch (err) {
            this.logger.error(`Endpoint discovery sync failed (catalog stays as-is, can be re-run via scripts/sync-endpoints.ts): ${err.message}`, err.stack);
        }
    }
    discover() {
        const endpoints = [];
        const wrappers = this.discovery.getControllers();
        for (const wrapper of wrappers) {
            const { instance, metatype } = wrapper;
            if (!instance || !metatype)
                continue;
            const controllerPath = Reflect.getMetadata(constants_1.PATH_METADATA, metatype) ?? '';
            const controllerName = metatype.name;
            this.scanner.scanFromPrototype(instance, Object.getPrototypeOf(instance), (methodKey) => {
                const methodRef = instance[methodKey];
                if (typeof methodRef !== 'function')
                    return;
                const methodEnum = Reflect.getMetadata(constants_1.METHOD_METADATA, methodRef);
                if (methodEnum === undefined)
                    return;
                if (SKIP_METHODS.has(methodEnum))
                    return;
                const rawMethodPath = Reflect.getMetadata(constants_1.PATH_METADATA, methodRef);
                const methodPath = typeof rawMethodPath === 'string' ? rawMethodPath : '';
                const fullPath = this.buildFullPath(controllerPath, methodPath);
                endpoints.push({
                    method: METHOD_NAMES[methodEnum],
                    path: fullPath,
                    source: `${controllerName}.${String(methodKey)}`,
                });
            });
        }
        return endpoints;
    }
    async syncToDatabase() {
        const discovered = this.discover();
        const existingRows = await this.endpointRepo.find({
            select: ['id', 'method', 'path'],
        });
        const existingKeys = new Set(existingRows.map((e) => `${e.method}|${e.path}`));
        let inserted = 0;
        let preserved = 0;
        let skipped = 0;
        for (const ep of discovered) {
            const key = `${ep.method}|${ep.path}`;
            if (existingKeys.has(key)) {
                preserved++;
                continue;
            }
            try {
                await this.endpointRepo.insert({
                    method: ep.method,
                    path: ep.path,
                    description: ep.source,
                });
                inserted++;
            }
            catch (err) {
                this.logger.warn(`Skipped duplicate insert for ${ep.method} ${ep.path}: ${err.message}`);
                skipped++;
            }
        }
        return { discovered: discovered.length, inserted, preserved, skipped };
    }
    buildFullPath(controllerPath, methodPath) {
        const cleanMethod = methodPath.replace(/^\/+|\/+$/g, '');
        const parts = ['api', controllerPath, cleanMethod].filter(Boolean);
        return '/' + parts.join('/');
    }
};
exports.EndpointDiscoveryService = EndpointDiscoveryService;
exports.EndpointDiscoveryService = EndpointDiscoveryService = EndpointDiscoveryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(api_endpoint_entity_1.ApiEndpointEntity)),
    __metadata("design:paramtypes", [core_1.DiscoveryService,
        core_1.MetadataScanner,
        typeorm_2.Repository])
], EndpointDiscoveryService);
//# sourceMappingURL=endpoint-discovery.service.js.map