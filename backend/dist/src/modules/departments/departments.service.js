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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepartmentsService = void 0;
const common_1 = require("@nestjs/common");
const organizations_repository_1 = require("../organizations/organizations.repository");
const departments_repository_1 = require("./departments.repository");
let DepartmentsService = class DepartmentsService {
    constructor(deptRepo, orgRepo) {
        this.deptRepo = deptRepo;
        this.orgRepo = orgRepo;
    }
    async create(input) {
        const org = await this.orgRepo.findById(input.organizationId);
        if (!org) {
            throw new common_1.BadRequestException(`Organization ${input.organizationId} does not exist`);
        }
        const collision = await this.deptRepo.existsByOrgAndName(input.organizationId, input.name);
        if (collision) {
            throw new common_1.ConflictException(`Department name '${input.name}' already exists in this organization (UNIQUE constraint)`);
        }
        return this.deptRepo.create(input);
    }
    async createWithCategories(input, categoryIds) {
        const created = await this.create(input);
        await this.deptRepo.replaceCategoriesForDept(created.id, categoryIds);
        return created;
    }
    async findById(id) {
        const dept = await this.deptRepo.findByIdActive(id);
        if (!dept) {
            throw new common_1.NotFoundException(`Department ${id} not found or has been deleted`);
        }
        return dept;
    }
    async findByIdWithCategories(id) {
        const dept = await this.findById(id);
        const map = await this.deptRepo.loadCategoryIdsByDeptIds([dept.id]);
        return { department: dept, category_ids: map.get(dept.id) ?? [] };
    }
    async list(filters) {
        return this.deptRepo.list(filters);
    }
    async update(id, patch) {
        const updated = await this.deptRepo.update(id, patch);
        if (!updated) {
            throw new common_1.NotFoundException(`Department ${id} not found or has been deleted`);
        }
        return updated;
    }
    async updateWithCategories(id, patch, categoryIds) {
        const updated = await this.update(id, patch);
        if (categoryIds !== null) {
            await this.deptRepo.replaceCategoriesForDept(updated.id, categoryIds);
        }
        return updated;
    }
    async delete(id) {
        const existing = await this.deptRepo.findByIdActive(id);
        if (!existing) {
            throw new common_1.NotFoundException(`Department ${id} not found or already deleted`);
        }
        await this.deptRepo.orphanIncidents(id);
        const deleted = await this.deptRepo.softDelete(id);
        if (!deleted) {
            throw new common_1.NotFoundException(`Department ${id} not found or already deleted`);
        }
        return deleted;
    }
    async findByUser(userId) {
        return this.deptRepo.findByUser(userId);
    }
    async listIncidentCategoriesForForm() {
        const rows = await this.deptRepo['dataSource'].query(`SELECT id, name, parent_id
           FROM incident_categories
          WHERE deleted_at IS NULL
          ORDER BY parent_id NULLS FIRST, name`);
        return rows;
    }
};
exports.DepartmentsService = DepartmentsService;
exports.DepartmentsService = DepartmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [departments_repository_1.DepartmentsRepository,
        organizations_repository_1.OrganizationsRepository])
], DepartmentsService);
//# sourceMappingURL=departments.service.js.map