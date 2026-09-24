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
var FeedRecoveryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedRecoveryService = exports.CITIZEN_FEED_KEY = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const cache_manager_1 = require("@nestjs/cache-manager");
const typeorm_1 = require("typeorm");
exports.CITIZEN_FEED_KEY = 'feed:incidents';
let FeedRecoveryService = FeedRecoveryService_1 = class FeedRecoveryService {
    constructor(dataSource, cache) {
        this.dataSource = dataSource;
        this.cache = cache;
        this.logger = new common_1.Logger(FeedRecoveryService_1.name);
    }
    async rebuildFeed(limit = 200) {
        this.logger.log(`[FeedRecovery] Starting rebuild with limit=${limit}`);
        await this.cache.del(exports.CITIZEN_FEED_KEY);
        const rows = await this.dataSource.query(`SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at, i.resolution_date,
              ST_AsGeoJSON(i.location)::json AS location_geojson,
              ic.name AS category_name, o.name AS org_name, gz.name AS zone_name
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN geo_zones gz ON i.zone_id = gz.id
       WHERE i.deleted_at IS NULL
       ORDER BY i.created_at DESC
       LIMIT $1`, [limit]);
        const items = rows.map((r) => ({
            id: r.id,
            incident_category_id: r.category_id,
            organization_id: r.organization_id,
            user_id: r.citizen_id,
            location_id: r.zone_id,
            title: r.title,
            status: r.status,
            priority: r.priority,
            resolution_date: r.resolution_date ?? null,
            created_at: r.created_at,
            updated_at: r.updated_at,
            geom: r.location_geojson ?? null,
            category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
            organization: r.organization_id ? { id: r.organization_id, name: r.org_name ?? '' } : null,
            user: { id: r.citizen_id },
            location: r.zone_id ? { id: r.zone_id, name: r.zone_name ?? '' } : null,
        }));
        await this.cache.set(exports.CITIZEN_FEED_KEY, items, 3600000);
        this.logger.log(`[FeedRecovery] Rebuilt feed with ${items.length} items`);
        return items.length;
    }
    async scheduledRebuild() {
        this.logger.log('[FeedRecovery] Cron triggered');
        await this.rebuildFeed();
    }
};
exports.FeedRecoveryService = FeedRecoveryService;
__decorate([
    (0, schedule_1.Cron)('0 3 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FeedRecoveryService.prototype, "scheduledRebuild", null);
exports.FeedRecoveryService = FeedRecoveryService = FeedRecoveryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [typeorm_1.DataSource, Object])
], FeedRecoveryService);
//# sourceMappingURL=feed-recovery.service.js.map