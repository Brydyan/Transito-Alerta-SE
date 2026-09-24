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
exports.IncidentCategoriesService = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const incident_category_entity_1 = require("../../entities/incident-category.entity");
const incident_categories_repository_1 = require("./incident-categories.repository");
exports.DEFAULT_PAGE_SIZE = 15;
exports.MAX_PAGE_SIZE = 100;
let IncidentCategoriesService = class IncidentCategoriesService {
    constructor(categoryRepo, categoriesRepository) {
        this.categoryRepo = categoryRepo;
        this.categoriesRepository = categoriesRepository;
    }
    async create(dto) {
        const parentId = dto.parent_id ?? null;
        await this.assertValidParent(null, parentId);
        const priority = parentId ? dto.priority : null;
        if (parentId && !priority) {
            throw new common_1.BadRequestException('Sub-categories must have a priority');
        }
        const entity = this.categoryRepo.create({
            name: dto.name,
            parentId,
            description: dto.description ?? null,
            priority,
        });
        return this.categoryRepo.save(entity);
    }
    async update(id, dto) {
        const existing = await this.findById(id);
        if (dto.parent_id !== undefined) {
            await this.assertValidParent(id, dto.parent_id);
            existing.parentId = dto.parent_id;
        }
        if (dto.name !== undefined) {
            existing.name = dto.name;
        }
        if (dto.description !== undefined) {
            existing.description = dto.description;
        }
        if (dto.priority !== undefined) {
            const wouldBeSub = existing.parentId !== null;
            if (wouldBeSub && !dto.priority) {
                throw new common_1.BadRequestException('Sub-categories must have a priority');
            }
            existing.priority = wouldBeSub ? dto.priority : null;
        }
        return this.categoryRepo.save(existing);
    }
    async delete(id) {
        const category = await this.findById(id);
        category.deletedAt = new Date();
        await this.categoryRepo.save(category);
    }
    async findById(id) {
        const category = await this.categoryRepo.findOne({ where: { id } });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async list(filters = {}) {
        const perPage = Math.min(filters.perPage ?? exports.DEFAULT_PAGE_SIZE, exports.MAX_PAGE_SIZE);
        const page = Math.max(filters.page ?? 1, 1);
        const skip = (page - 1) * perPage;
        const qb = this.categoryRepo
            .createQueryBuilder('c')
            .orderBy('c.name', 'ASC')
            .andWhere('c.deleted_at IS NULL');
        if (filters.search) {
            qb.andWhere('c.name ILIKE :search', { search: `%${filters.search}%` });
        }
        if (filters.parentId === null) {
            qb.andWhere('c.parent_id IS NULL');
        }
        else if (filters.parentId !== undefined) {
            qb.andWhere('c.parent_id = :parentId', { parentId: filters.parentId });
        }
        qb.skip(skip).take(perPage);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
    }
    getTree() {
        return this.categoriesRepository.getSubtree(null);
    }
    async assertValidParent(categoryId, parentId) {
        if (parentId === null || parentId === undefined) {
            return;
        }
        const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
        if (!parent) {
            throw new common_1.BadRequestException('Parent category not found');
        }
        const isValid = await this.categoriesRepository.validateNoCycles(categoryId, parentId);
        if (!isValid) {
            throw new common_1.BadRequestException('Circular reference detected');
        }
    }
};
exports.IncidentCategoriesService = IncidentCategoriesService;
exports.IncidentCategoriesService = IncidentCategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(incident_category_entity_1.IncidentCategoryEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        incident_categories_repository_1.IncidentCategoriesRepository])
], IncidentCategoriesService);
//# sourceMappingURL=incident-categories.service.js.map