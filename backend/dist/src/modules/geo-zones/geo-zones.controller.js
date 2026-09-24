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
exports.GeoZonesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const create_geo_zone_dto_1 = require("./dto/create-geo-zone.dto");
const import_geo_zone_query_dto_1 = require("./dto/import-geo-zone-query.dto");
const update_geo_zone_dto_1 = require("./dto/update-geo-zone.dto");
const geo_zones_service_1 = require("./geo-zones.service");
let GeoZonesController = class GeoZonesController {
    constructor(geoZonesService) {
        this.geoZonesService = geoZonesService;
    }
    getTree() {
        return this.geoZonesService.getTree();
    }
    async importShapefile(file, query) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        return this.geoZonesService.importShapefile(file.buffer, query);
    }
    getFormData() {
        return this.geoZonesService.getFormData();
    }
    list(search, parentId, level, includeInactive, code, page, perPage) {
        return this.geoZonesService.list({
            search,
            parentId: parentId === 'null' ? null : parentId,
            level,
            includeInactive: includeInactive === 'true',
            code,
            page: page ? parseInt(page, 10) : undefined,
            perPage: perPage ? parseInt(perPage, 10) : undefined,
        });
    }
    findOne(id) {
        return this.geoZonesService.findById(id);
    }
    create(dto) {
        return this.geoZonesService.create(dto);
    }
    update(id, dto) {
        return this.geoZonesService.update(id, dto);
    }
    remove(id) {
        return this.geoZonesService.delete(id);
    }
};
exports.GeoZonesController = GeoZonesController;
__decorate([
    (0, common_1.Get)('tree'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "getTree", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, require_permission_decorator_1.RequirePermission)('CREATE'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 10_485_760 } })),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, import_geo_zone_query_dto_1.ImportGeoZoneQueryDto]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "importShapefile", null);
__decorate([
    (0, common_1.Get)('form-data'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "getFormData", null);
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Query)('search')),
    __param(1, (0, common_1.Query)('parent_id')),
    __param(2, (0, common_1.Query)('level')),
    __param(3, (0, common_1.Query)('include_inactive')),
    __param(4, (0, common_1.Query)('code')),
    __param(5, (0, common_1.Query)('page')),
    __param(6, (0, common_1.Query)('per_page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('CREATE'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_geo_zone_dto_1.CreateGeoZoneDto]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_geo_zone_dto_1.UpdateGeoZoneDto]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('DELETE'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GeoZonesController.prototype, "remove", null);
exports.GeoZonesController = GeoZonesController = __decorate([
    (0, common_1.Controller)('geo-zones'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [geo_zones_service_1.GeoZonesService])
], GeoZonesController);
//# sourceMappingURL=geo-zones.controller.js.map