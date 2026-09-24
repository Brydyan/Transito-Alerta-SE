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
exports.CommentImageStorageService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const storage_client_interface_1 = require("../../core/storage/storage-client.interface");
let CommentImageStorageService = class CommentImageStorageService {
    constructor(client) {
        this.client = client;
    }
    async upload(commentId, file) {
        const key = `comments/${commentId}/${(0, crypto_1.randomUUID)()}-${file.originalname}`;
        return this.client.upload(key, file.buffer ?? Buffer.alloc(0), file.mimetype);
    }
    getSignedUrl(key) {
        return this.client.getSignedUrl(key);
    }
    delete(key) {
        return this.client.delete(key);
    }
};
exports.CommentImageStorageService = CommentImageStorageService;
exports.CommentImageStorageService = CommentImageStorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(storage_client_interface_1.STORAGE_CLIENT)),
    __metadata("design:paramtypes", [Object])
], CommentImageStorageService);
//# sourceMappingURL=comment-image-storage.service.js.map