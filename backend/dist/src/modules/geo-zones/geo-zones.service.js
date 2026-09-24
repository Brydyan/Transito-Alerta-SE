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
exports.GEO_ZONE_LEVELS = exports.GeoZonesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const geofencing_service_1 = require("../geofencing/geofencing.service");
const geo_zone_entity_1 = require("../../entities/geo-zone.entity");
Object.defineProperty(exports, "GEO_ZONE_LEVELS", { enumerable: true, get: function () { return geo_zone_entity_1.GEO_ZONE_LEVELS; } });
const geo_zones_repository_1 = require("./geo-zones.repository");
const REQUIRED_PARENT_LEVEL = {
    provincia: null,
    canton: 'provincia',
    parroquia: 'canton',
    zona: '*',
};
const FORM_DATA_LEVELS = ['cantón', 'parroquia', 'provincia', 'sector'];
let GeoZonesService = class GeoZonesService {
    constructor(repo, geofencing, dataSource) {
        this.repo = repo;
        this.geofencing = geofencing;
        this.dataSource = dataSource;
    }
    async create(dto) {
        const level = dto.level ?? 'zona';
        const parentId = dto.parent_id ?? null;
        await this.assertValidParent(null, parentId, level);
        if (dto.polygon !== undefined) {
            await this.assertValidGeometry(dto.polygon);
        }
        const zone = await this.repo.create({
            name: dto.name,
            parentId,
            level,
            active: dto.active ?? true,
            polygon: dto.polygon ?? null,
            code: dto.code ?? null,
        });
        await this.purgeGeoCaches(zone.id);
        return zone;
    }
    async update(id, dto) {
        const before = await this.findById(id);
        const effectiveLevel = dto.level ?? before.level;
        if (dto.level !== undefined || dto.parent_id !== undefined) {
            await this.assertValidParent(id, dto.parent_id, effectiveLevel);
        }
        if (dto.polygon !== undefined) {
            await this.assertValidGeometry(dto.polygon);
        }
        const updated = await this.repo.update(id, {
            name: dto.name,
            parentIdProvided: dto.parent_id !== undefined,
            parentId: dto.parent_id,
            level: dto.level,
            active: dto.active,
            polygon: dto.polygon,
            codeProvided: dto.code !== undefined,
            code: dto.code,
        });
        if (!updated) {
            throw new common_1.NotFoundException('Zone not found');
        }
        const boundaryChanged = dto.polygon !== undefined;
        const activityChanged = dto.active !== undefined && dto.active !== before.active;
        if (boundaryChanged || activityChanged) {
            await this.purgeGeoCaches(id);
        }
        return updated;
    }
    async delete(id) {
        await this.findById(id);
        const result = await this.repo.deactivate(id);
        if (!result) {
            throw new common_1.NotFoundException('Zone not found');
        }
        if (result.changed) {
            await this.purgeGeoCaches(id);
        }
    }
    async findById(id) {
        const zone = await this.repo.findById(id);
        if (!zone) {
            throw new common_1.NotFoundException('Zone not found');
        }
        return zone;
    }
    list(filters = {}) {
        return this.repo.findAll(filters);
    }
    getTree() {
        return this.repo.getSubtree(null);
    }
    async importShapefile(buffer, query) {
        const shpjs = require('shpjs');
        const nameColumn = query.name_column ?? 'NAME';
        const codeColumn = query.code_column ?? 'CODE';
        const autoParent = query.auto_parent !== false;
        const ab = buffer instanceof Buffer
            ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            : buffer;
        const collection = await shpjs(ab);
        const features = collection.features ?? [];
        const imported = [];
        const skipped = [];
        const errors = [];
        const warnings = [];
        const seenCodes = new Set();
        const ds = this.dataSource;
        if (!ds) {
            throw new Error('DataSource not injected — cannot manage transaction');
        }
        const qr = ds.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            for (let i = 0; i < features.length; i++) {
                const feature = features[i];
                const props = (feature.properties ?? {});
                const rawName = props[nameColumn] ?? props['nombre'] ?? props['NOMBRE'] ?? '';
                const name = String(rawName ?? '').trim();
                const code = props[codeColumn] != null ? String(props[codeColumn]).trim() : null;
                if (!name) {
                    errors.push({ index: i, name: `feature[${i}]`, reason: 'name is required' });
                    continue;
                }
                if (name.length > 255) {
                    errors.push({ index: i, name: name.slice(0, 40), reason: 'name exceeds 255 characters' });
                    continue;
                }
                if (code !== null && code.length > 32) {
                    errors.push({ index: i, name, reason: 'code exceeds 32 characters' });
                    continue;
                }
                if (code !== null) {
                    if (seenCodes.has(code)) {
                        skipped.push({ index: i, name });
                        continue;
                    }
                    const existing = await this.repo.findByCode(code);
                    if (existing) {
                        skipped.push({ index: i, name });
                        continue;
                    }
                    seenCodes.add(code);
                }
                let geometryCheck;
                try {
                    geometryCheck = await this.repo.validateGeometry(feature.geometry);
                }
                catch {
                    errors.push({ index: i, name, reason: 'Invalid GeoJSON geometry' });
                    continue;
                }
                if (!geometryCheck.valid) {
                    errors.push({ index: i, name, reason: `Invalid geometry: ${geometryCheck.reason ?? 'unknown'}` });
                    continue;
                }
                if (geometryCheck.inBounds === false) {
                    errors.push({ index: i, name, reason: 'Geometry outside Ecuador bounds' });
                    continue;
                }
                let parentId = null;
                if (autoParent) {
                    const parentCode = props['parent_code'] != null ? String(props['parent_code']) : null;
                    if (parentCode) {
                        const parent = await this.repo.findByCode(parentCode);
                        if (parent) {
                            parentId = parent.id;
                        }
                    }
                    if (parentId === null) {
                        const parent = await this.repo.findParentBySpatialContainment(feature.geometry);
                        if (parent) {
                            parentId = parent.id;
                        }
                        else {
                            warnings.push(`Zone '${name}' imported without parent (no match found)`);
                        }
                    }
                }
                await this.repo.createInTransaction(qr, {
                    name,
                    parentId,
                    level: query.level,
                    active: true,
                    polygon: feature.geometry,
                    code,
                });
                imported.push(i);
            }
            await qr.commitTransaction();
            await this.purgeGeoCaches('__import__');
        }
        catch (err) {
            await qr.rollbackTransaction();
            throw err;
        }
        finally {
            await qr.release();
        }
        return {
            imported: imported.length,
            skipped: skipped.length,
            errors,
            warnings,
        };
    }
    async getFormData() {
        const parents = await this.repo.getFormData();
        return { levels: FORM_DATA_LEVELS, parents };
    }
    async assertValidParent(zoneId, parentId, level) {
        const required = REQUIRED_PARENT_LEVEL[level];
        if (parentId === null || parentId === undefined) {
            if (required !== null && required !== '*') {
                throw new common_1.BadRequestException(`Invalid parent level: a ${level} must have a ${required} parent`);
            }
            return;
        }
        if (required === null) {
            throw new common_1.BadRequestException('Invalid parent level: a provincia cannot have a parent');
        }
        const parentLevel = await this.repo.findParentLevel(parentId);
        if (parentLevel === null) {
            throw new common_1.BadRequestException('Parent zone not found');
        }
        if (required !== '*' && parentLevel !== required) {
            throw new common_1.BadRequestException(`Invalid parent level: a ${level} must have a ${required} parent`);
        }
        const noCycle = await this.repo.validateNoCycles(zoneId, parentId);
        if (!noCycle) {
            throw new common_1.BadRequestException('Circular reference detected');
        }
    }
    async assertValidGeometry(polygon) {
        let check;
        try {
            check = await this.repo.validateGeometry(polygon);
        }
        catch {
            throw new common_1.BadRequestException('Invalid GeoJSON geometry');
        }
        if (check.geom_type !== 'ST_MultiPolygon') {
            throw new common_1.BadRequestException('polygon must resolve to a Polygon or MultiPolygon');
        }
        if (!check.valid) {
            throw new common_1.BadRequestException(`Invalid geometry: ${check.reason ?? 'unknown reason'}`);
        }
        if (check.empty) {
            throw new common_1.BadRequestException('Geometry is empty');
        }
        if (check.inBounds === false) {
            throw new common_1.BadRequestException('Geometry outside Ecuador bounds — centroid must lie within 500 km of (-78.5, -1.5)');
        }
    }
    async purgeGeoCaches(zoneId) {
        await this.geofencing.purgeZoneCache(zoneId);
        await this.geofencing.purgeZoneCache(geofencing_service_1.ALL_ZONES_TAG);
        await this.geofencing.purgePointCache();
    }
};
exports.GeoZonesService = GeoZonesService;
exports.GeoZonesService = GeoZonesService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [geo_zones_repository_1.GeoZonesRepository,
        geofencing_service_1.GeofencingService,
        typeorm_2.DataSource])
], GeoZonesService);
//# sourceMappingURL=geo-zones.service.js.map