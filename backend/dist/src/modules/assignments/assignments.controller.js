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
exports.AssignmentsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const assign_incident_dto_1 = require("./dto/assign-incident.dto");
const update_assignment_dto_1 = require("./dto/update-assignment.dto");
const assignments_service_1 = require("./assignments.service");
let AssignmentsController = class AssignmentsController {
    constructor(assignmentsService) {
        this.assignmentsService = assignmentsService;
    }
    assign(dto) {
        return this.assignmentsService.assign(dto.incident_id, dto.operator_id, dto.role);
    }
    release(id) {
        return this.assignmentsService.release(id);
    }
    list(incidentId, req) {
        return this.assignmentsService.list(incidentId, req.user.scope);
    }
    update(id, dto) {
        return this.assignmentsService.update(id, dto);
    }
    /**
     * GET /assignments/operator/:operatorId/count
     *
     * Returns active (non-soft-deleted) assignment count for an operator.
     * Used by the assignment modal to display operator workload.
     * Auth: ASSIGN permission required (same guard as other endpoints).
     */
    countByOperator(operatorId) {
        return this.assignmentsService.countByOperator(operatorId);
    }
};
exports.AssignmentsController = AssignmentsController;
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('ASSIGN'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [assign_incident_dto_1.AssignIncidentDto]),
    __metadata("design:returntype", Promise)
], AssignmentsController.prototype, "assign", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('ASSIGN'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AssignmentsController.prototype, "release", null);
__decorate([
    (0, common_1.Get)('incident/:incidentId'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Param)('incidentId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AssignmentsController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_assignment_dto_1.UpdateAssignmentDto]),
    __metadata("design:returntype", Promise)
], AssignmentsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('operator/:operatorId/count'),
    (0, require_permission_decorator_1.RequirePermission)('ASSIGN'),
    __param(0, (0, common_1.Param)('operatorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AssignmentsController.prototype, "countByOperator", null);
exports.AssignmentsController = AssignmentsController = __decorate([
    (0, common_1.Controller)('assignments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [assignments_service_1.AssignmentsService])
], AssignmentsController);
//# sourceMappingURL=assignments.controller.js.map