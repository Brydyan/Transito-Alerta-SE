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
exports.CommentsService = exports.MAX_COMMENT_DEPTH = void 0;
exports.sanitizeContent = sanitizeContent;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const comment_entity_1 = require("../../entities/comment.entity");
const incidents_repository_1 = require("../incidents/incidents.repository");
const SCRIPT_TAG_PATTERN = /<script[^>]*>[\s\S]*?<\/script\s*>/gi;
exports.MAX_COMMENT_DEPTH = 2;
function sanitizeContent(raw) {
    const withoutScripts = raw.replace(SCRIPT_TAG_PATTERN, '');
    return withoutScripts
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
let CommentsService = class CommentsService {
    constructor(commentRepo, eventEmitter, incidentsRepository) {
        this.commentRepo = commentRepo;
        this.eventEmitter = eventEmitter;
        this.incidentsRepository = incidentsRepository;
    }
    async create(dto, userId) {
        if (dto.parent_id) {
            await this.assertValidParent(dto.parent_id, dto.incident_id);
        }
        const entity = this.commentRepo.create({
            content: sanitizeContent(dto.content),
            incidentId: dto.incident_id,
            userId,
            parentId: dto.parent_id ?? null,
        });
        const saved = await this.commentRepo.save(entity);
        this.eventEmitter.emit('comment.added', saved);
        return saved;
    }
    async assertValidParent(parentId, incidentId) {
        const parent = await this.commentRepo.findOne({ where: { id: parentId } });
        if (!parent) {
            throw new common_1.BadRequestException(`Parent comment ${parentId} not found`);
        }
        if (parent.incidentId !== incidentId) {
            throw new common_1.BadRequestException('parent_id must belong to the same incident');
        }
        const parentDepth = await this.depthOf(parent);
        if (parentDepth >= exports.MAX_COMMENT_DEPTH) {
            throw new common_1.BadRequestException('Maximum comment depth reached');
        }
    }
    async depthOf(comment) {
        if (!comment.parentId)
            return 0;
        const parent = await this.commentRepo.findOne({ where: { id: comment.parentId } });
        if (!parent || !parent.parentId)
            return 1;
        return 2;
    }
    async findByIncident(incidentId, scope) {
        const incident = await this.incidentsRepository.findOne(incidentId, scope);
        if (!incident) {
            throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
        }
        const comments = await this.commentRepo.find({
            where: { incidentId, deletedAt: (0, typeorm_2.IsNull)() },
            order: { createdAt: 'ASC' },
        });
        const byId = new Map(comments.map((c) => [c.id, c]));
        const depthOf = (c) => {
            if (!c.parentId)
                return 0;
            const parent = byId.get(c.parentId);
            if (!parent || !parent.parentId)
                return 1;
            return 2;
        };
        return comments.map((c) => ({ ...c, depth: depthOf(c) }));
    }
    async delete(commentId, requesterId) {
        const comment = await this.commentRepo.findOne({ where: { id: commentId } });
        if (!comment) {
            throw new common_1.NotFoundException(`Comment ${commentId} not found`);
        }
        if (comment.userId !== requesterId) {
            throw new common_1.ForbiddenException('Only the comment owner may delete it');
        }
        await this.commentRepo.manager.query(`WITH RECURSIVE thread AS (
         SELECT id FROM comments WHERE id = $1
         UNION ALL
         SELECT c.id FROM comments c JOIN thread t ON c.parent_id = t.id
       )
       UPDATE comments SET deleted_at = now()
       WHERE id IN (SELECT id FROM thread) AND deleted_at IS NULL`, [commentId]);
    }
    async findOne(id) {
        const comment = await this.commentRepo.findOne({ where: { id } });
        if (!comment) {
            throw new common_1.NotFoundException(`Comment ${id} not found`);
        }
        return comment;
    }
    async update(id, content, requesterId) {
        const comment = await this.findOne(id);
        if (comment.userId !== requesterId) {
            throw new common_1.ForbiddenException('Only the comment owner may edit it');
        }
        comment.content = sanitizeContent(content);
        return this.commentRepo.save(comment);
    }
};
exports.CommentsService = CommentsService;
exports.CommentsService = CommentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(comment_entity_1.CommentEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        event_emitter_1.EventEmitter2,
        incidents_repository_1.IncidentsRepository])
], CommentsService);
//# sourceMappingURL=comments.service.js.map