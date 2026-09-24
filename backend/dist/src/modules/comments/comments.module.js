"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const comment_entity_1 = require("../../entities/comment.entity");
const comment_image_entity_1 = require("../../entities/comment-image.entity");
const storage_module_1 = require("../../core/storage/storage.module");
const incidents_module_1 = require("../incidents/incidents.module");
const user_entity_1 = require("../../entities/user.entity");
const comments_controller_1 = require("./comments.controller");
const comments_service_1 = require("./comments.service");
const comment_image_storage_service_1 = require("./comment-image-storage.service");
const comment_images_service_1 = require("./comment-images.service");
const comment_images_controller_1 = require("./comment-images.controller");
let CommentsModule = class CommentsModule {
};
exports.CommentsModule = CommentsModule;
exports.CommentsModule = CommentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([comment_entity_1.CommentEntity, comment_image_entity_1.CommentImageEntity, user_entity_1.UserEntity]),
            incidents_module_1.IncidentsModule,
            storage_module_1.StorageModule,
        ],
        controllers: [comments_controller_1.CommentsController, comment_images_controller_1.CommentImagesController],
        providers: [comments_service_1.CommentsService, comment_images_service_1.CommentImagesService, comment_image_storage_service_1.CommentImageStorageService],
        exports: [comments_service_1.CommentsService],
    })
], CommentsModule);
//# sourceMappingURL=comments.module.js.map