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
var IncidentImagesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentImagesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const incident_image_entity_1 = require("../../entities/incident-image.entity");
const incident_image_storage_service_1 = require("./incident-image-storage.service");
const incidents_repository_1 = require("./incidents.repository");
const permission_guard_1 = require("../../common/guards/permission.guard");
const permission_lookup_service_1 = require("../../common/permissions/permission-lookup.service");
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PUBLIC_SCOPE = { kind: 'global' };
let IncidentImagesService = IncidentImagesService_1 = class IncidentImagesService {
    constructor(imageRepo, storage, incidentsRepository, permissionLookup) {
        this.imageRepo = imageRepo;
        this.storage = storage;
        this.incidentsRepository = incidentsRepository;
        this.permissionLookup = permissionLookup;
        this.logger = new common_1.Logger(IncidentImagesService_1.name);
    }
    async attachToIncident(incidentId, callerId, callerPermissions, files) {
        const incident = await this.incidentsRepository.findOne(incidentId, PUBLIC_SCOPE);
        if (!incident)
            throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
        const isOwner = incident.citizen_id === callerId;
        const canCreate = await (0, permission_guard_1.hasPermission)(callerPermissions, 'CREATE', 'incident-images', this.permissionLookup);
        if (!isOwner && !canCreate) {
            throw new common_1.ForbiddenException('Not authorized to attach images to this incident');
        }
        for (const file of files) {
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                throw new common_1.UnprocessableEntityException(`MIME type "${file.mimetype}" not allowed`);
            }
        }
        const results = [];
        for (const file of files) {
            const { key, url } = await this.storage.upload(incidentId, file);
            const entity = this.imageRepo.create({
                incidentId,
                storageKey: key,
                url,
                mimeType: file.mimetype,
                fileSize: file.size,
            });
            const saved = await this.imageRepo.save(entity);
            results.push({
                id: saved.id,
                url: saved.url,
                mime_type: saved.mimeType,
                file_size: saved.fileSize,
                created_at: saved.createdAt,
            });
        }
        return results;
    }
    async removeFromIncident(incidentId, imageId, callerId, callerPermissions) {
        const image = await this.imageRepo.findOne({ where: { id: imageId } });
        if (!image || image.incidentId !== incidentId) {
            throw new common_1.NotFoundException(`Image ${imageId} not found on incident ${incidentId}`);
        }
        const incident = await this.incidentsRepository.findOne(incidentId, PUBLIC_SCOPE);
        const isOwner = incident?.citizen_id === callerId;
        const canDelete = await (0, permission_guard_1.hasPermission)(callerPermissions, 'DELETE', 'incident-images', this.permissionLookup);
        if (!isOwner && !canDelete) {
            throw new common_1.ForbiddenException('Not authorized to delete this image');
        }
        try {
            await this.storage.delete(image.storageKey);
        }
        catch (err) {
            this.logger.warn('S3 delete failed', {
                key: image.storageKey,
                error: err.message,
            });
        }
        await this.imageRepo.delete({ id: imageId });
    }
};
exports.IncidentImagesService = IncidentImagesService;
exports.IncidentImagesService = IncidentImagesService = IncidentImagesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(incident_image_entity_1.IncidentImageEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        incident_image_storage_service_1.IncidentImageStorageService,
        incidents_repository_1.IncidentsRepository,
        permission_lookup_service_1.PermissionLookupService])
], IncidentImagesService);
//# sourceMappingURL=incident-images.service.js.map