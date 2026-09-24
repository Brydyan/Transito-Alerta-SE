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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentsService = exports.ALL_ZONES_TAG = exports.INCIDENTS_STREAM_KEY = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_module_1 = require("../../core/core.module");
const geofencing_service_1 = require("../geofencing/geofencing.service");
Object.defineProperty(exports, "ALL_ZONES_TAG", { enumerable: true, get: function () { return geofencing_service_1.ALL_ZONES_TAG; } });
const organizations_service_1 = require("../organizations/organizations.service");
const scope_sql_1 = require("../../common/authz/scope-sql");
const incident_state_machine_1 = require("./incident-state-machine");
const incidents_repository_1 = require("./incidents.repository");
exports.INCIDENTS_STREAM_KEY = 'incidents:events';
const INCIDENTS_LIST_CACHE_TTL_MS = 30_000;
const PG_CHECK_VIOLATION = '23514';
function isLeafCategoryViolation(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === PG_CHECK_VIOLATION);
}
let IncidentsService = class IncidentsService {
    constructor(incidentsRepository, geofencingService, organizationsService, eventEmitter, redis, cache, dataSource, configService) {
        this.incidentsRepository = incidentsRepository;
        this.geofencingService = geofencingService;
        this.organizationsService = organizationsService;
        this.eventEmitter = eventEmitter;
        this.redis = redis;
        this.cache = cache;
        this.dataSource = dataSource;
        this.configService = configService;
    }
    async create(dto, citizenId) {
        const { zone_id: zoneId } = await this.geofencingService.resolveZone({
            lat: dto.lat,
            lng: dto.lng,
        });
        const orgs = await this.organizationsService.findNotifiedFor(zoneId, null);
        const org = orgs[0] ?? null;
        const isAnonymous = dto.is_anonymous === true;
        const finalCitizenId = isAnonymous
            ? await this.resolveMaskUserId()
            : citizenId;
        const row = isAnonymous
            ? await this.dataSource.transaction(async (manager) => {
                const created = await this.incidentsRepository.create({
                    title: dto.title,
                    description: dto.description ?? null,
                    lat: dto.lat,
                    lng: dto.lng,
                    priority: dto.priority ?? 'medium',
                    citizenId: finalCitizenId,
                    zoneId,
                    geofenceMatched: zoneId !== null,
                    organizationId: org?.id ?? null,
                    isAnonymous: true,
                    categoryId: dto.category_id ?? null,
                }, manager);
                await manager.query(`INSERT INTO incident_reporters (incident_id, user_id) VALUES ($1, $2)`, [created.id, citizenId]);
                return created;
            })
            : await this.incidentsRepository.create({
                title: dto.title,
                description: dto.description ?? null,
                lat: dto.lat,
                lng: dto.lng,
                priority: dto.priority ?? 'medium',
                citizenId: finalCitizenId,
                zoneId,
                geofenceMatched: zoneId !== null,
                organizationId: org?.id ?? null,
                isAnonymous: false,
                categoryId: dto.category_id ?? null,
            });
        await this.purgeListCaches(zoneId);
        await this.publish('incident.created', row);
        return row;
    }
    async resolveMaskUserId() {
        const authConfig = this.configService.get('auth');
        if (!authConfig) {
            throw new Error('AuthConfig not loaded; AUD requires auth config');
        }
        const rows = await this.dataSource.query(`SELECT id FROM users WHERE device_uuid = $1 LIMIT 1`, [authConfig.anonymousDeviceUuid]);
        const id = rows[0]?.id;
        if (!id) {
            throw new Error(`Anonymous mask row not found (device_uuid='${authConfig.anonymousDeviceUuid}'). ` +
                'Migrations 0001 and 0048 must be applied.');
        }
        return id;
    }
    async findAll(filters, scope, actorId) {
        const key = this.listCacheKey(filters.zoneId, filters.status, scope);
        const cached = await this.cache.get(key);
        if (cached) {
            return cached;
        }
        const rows = await this.incidentsRepository.findAll(filters, scope, actorId);
        await this.cache.set(key, rows, INCIDENTS_LIST_CACHE_TTL_MS);
        if (filters.zoneId) {
            await this.geofencingService.tagCacheKey(filters.zoneId, key);
        }
        await this.geofencingService.tagCacheKey(geofencing_service_1.ALL_ZONES_TAG, key);
        return rows;
    }
    async findOne(id, scope, actorId) {
        const row = await this.incidentsRepository.findOne(id, scope, actorId);
        if (!row) {
            throw new common_1.NotFoundException(`Incident ${id} not found`);
        }
        return row;
    }
    async publish(type, data) {
        this.eventEmitter.emit(type, data);
        await this.redis.xadd(exports.INCIDENTS_STREAM_KEY, '*', 'type', type, 'data', JSON.stringify(data));
    }
    listCacheKey(zoneId, status, scope) {
        return `incidents:list:${zoneId ?? 'all'}:${status ?? 'all'}:${(0, scope_sql_1.scopeCacheKey)(scope)}`;
    }
    async purgeListCaches(zoneId) {
        await this.geofencingService.purgeZoneCache(zoneId);
        await this.geofencingService.purgeZoneCache(geofencing_service_1.ALL_ZONES_TAG);
    }
    async update(id, dto) {
        const incident = await this.incidentsRepository.findOne(id, {
            kind: 'public',
            organizationId: null,
        });
        if (!incident) {
            throw new common_1.NotFoundException(`Incident ${id} not found`);
        }
        try {
            return await this.incidentsRepository.update(id, {
                title: dto.title ?? incident.title,
                description: dto.description !== undefined ? dto.description : incident.description,
                categoryId: dto.categoryId !== undefined ? dto.categoryId : incident.category_id,
            });
        }
        catch (error) {
            if (isLeafCategoryViolation(error)) {
                throw new common_1.BadRequestException('INCIDENT_CATEGORY_NOT_LEAF: category must be a leaf category');
            }
            throw error;
        }
    }
    async softDelete(id) {
        const incident = await this.incidentsRepository.findOne(id, { kind: 'global' });
        if (!incident) {
            throw new common_1.NotFoundException(`Incident ${id} not found`);
        }
        await this.incidentsRepository.softDelete(id);
    }
    getStatuses() {
        return incident_state_machine_1.ALLOWED_STATUSES.map((id) => ({ id, label: STATUS_LABELS[id] }));
    }
};
exports.IncidentsService = IncidentsService;
exports.IncidentsService = IncidentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __param(5, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __param(6, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [incidents_repository_1.IncidentsRepository,
        geofencing_service_1.GeofencingService,
        organizations_service_1.OrganizationsService,
        event_emitter_1.EventEmitter2, Function, Object, typeorm_2.DataSource,
        config_1.ConfigService])
], IncidentsService);
const STATUS_LABELS = {
    pending: 'Pendiente',
    in_progress: 'En progreso',
    resolved: 'Resuelto',
    closed: 'Cerrado',
};
//# sourceMappingURL=incidents.service.js.map