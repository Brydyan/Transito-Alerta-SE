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
var CommentImagesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentImagesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const comment_entity_1 = require("../../entities/comment.entity");
const comment_image_entity_1 = require("../../entities/comment-image.entity");
const comment_image_storage_service_1 = require("./comment-image-storage.service");
const permission_guard_1 = require("../../common/guards/permission.guard");
const permission_lookup_service_1 = require("../../common/permissions/permission-lookup.service");
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
let CommentImagesService = CommentImagesService_1 = class CommentImagesService {
    constructor(commentRepo, imageRepo, storage, permissionLookup) {
        this.commentRepo = commentRepo;
        this.imageRepo = imageRepo;
        this.storage = storage;
        this.permissionLookup = permissionLookup;
        this.logger = new common_1.Logger(CommentImagesService_1.name);
    }
    async attachToComment(commentId, callerId, callerPermissions, files) {
        const comment = await this.commentRepo.findOne({ where: { id: commentId } });
        if (!comment)
            throw new common_1.NotFoundException(`Comment ${commentId} not found`);
        const isOwner = comment.userId === callerId;
        const canCreate = await (0, permission_guard_1.hasPermission)(callerPermissions, 'CREATE', 'comment-images', this.permissionLookup);
        if (!isOwner && !canCreate) {
            throw new common_1.ForbiddenException('Not authorized to attach images to this comment');
        }
        for (const file of files) {
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                throw new common_1.UnprocessableEntityException(`MIME type "${file.mimetype}" not allowed`);
            }
        }
        const results = [];
        for (const file of files) {
            const { key, url } = await this.storage.upload(commentId, file);
            const entity = this.imageRepo.create({
                commentId,
                storageKey: key,
                url,
                mimeType: file.mimetype,
                fileSize: file.size,
            });
            const saved = await this.imageRepo.save(entity);
            results.push({
                id: saved.id,
                url: saved.url,
                mimeType: saved.mimeType,
                fileSize: saved.fileSize,
                createdAt: saved.createdAt,
            });
        }
        return results;
    }
    async removeFromComment(commentId, imageId, callerId, callerPermissions) {
        const image = await this.imageRepo.findOne({ where: { id: imageId } });
        if (!image || image.commentId !== commentId) {
            throw new common_1.NotFoundException(`Image ${imageId} not found on comment ${commentId}`);
        }
        const comment = await this.commentRepo.findOne({ where: { id: commentId } });
        const isOwner = comment?.userId === callerId;
        const canDelete = await (0, permission_guard_1.hasPermission)(callerPermissions, 'DELETE', 'comment-images', this.permissionLookup);
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
exports.CommentImagesService = CommentImagesService;
exports.CommentImagesService = CommentImagesService = CommentImagesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(comment_entity_1.CommentEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(comment_image_entity_1.CommentImageEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        comment_image_storage_service_1.CommentImageStorageService,
        permission_lookup_service_1.PermissionLookupService])
], CommentImagesService);
//# sourceMappingURL=comment-images.service.js.map