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
exports.IncidentsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const email_verified_guard_1 = require("../../common/guards/email-verified.guard");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const create_incident_dto_1 = require("./dto/create-incident.dto");
const update_incident_dto_1 = require("./dto/update-incident.dto");
const update_incident_status_dto_1 = require("./dto/update-incident-status.dto");
const stats_query_dto_1 = require("./dto/stats-query.dto");
const weekly_stats_query_dto_1 = require("./dto/weekly-stats-query.dto");
const reveal_incident_dto_1 = require("./dto/reveal-incident.dto");
const reveal_service_1 = require("./reveal.service");
const feed_query_dto_1 = require("./dto/feed-query.dto");
const export_query_dto_1 = require("./dto/export-query.dto");
const incidents_service_1 = require("./incidents.service");
const incident_analytics_service_1 = require("./incident-analytics.service");
const incident_feed_service_1 = require("./incident-feed.service");
const incident_export_service_1 = require("./incident-export.service");
const feed_recovery_service_1 = require("./feed-recovery.service");
const incident_workflow_service_1 = require("./incident-workflow.service");
let IncidentsController = class IncidentsController {
    constructor(incidentsService, analyticsService, feedService, exportService, feedRecoveryService, workflow, revealService) {
        this.incidentsService = incidentsService;
        this.analyticsService = analyticsService;
        this.feedService = feedService;
        this.exportService = exportService;
        this.feedRecoveryService = feedRecoveryService;
        this.workflow = workflow;
        this.revealService = revealService;
    }
    create(dto, req) {
        return this.incidentsService.create(dto, req.user.userId);
    }
    findAll(req, zoneId, status) {
        return this.incidentsService.findAll({ zoneId, status }, req.user.scope, req.user.userId);
    }
    async getStats(query, req) {
        return this.analyticsService.getStats(query, req.user);
    }
    async getWeeklyStats(query, req) {
        return this.analyticsService.getWeeklyStats(query, req.user);
    }
    async getFeed(query, req) {
        const user = req.user;
        if (this.feedService.isStaffRole(user)) {
            return this.feedService.getStaffFeed(query, user);
        }
        return this.feedService.getCitizenFeed(query);
    }
    async exportCsv(query, format = 'csv', req, res) {
        const user = req.user;
        const CAP = 5000;
        const total = await this.exportService.countFiltered(query, user);
        if (total > CAP) {
            res.setHeader('X-Report-Truncated', 'true');
            res.setHeader('X-Report-Original-Total', String(total));
            res.setHeader('X-Report-Exported', String(CAP));
        }
        const { stream, contentType, filename } = await this.exportService.createExportStream(query, user, CAP, format);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        stream.pipe(res);
    }
    getStatuses() {
        return this.incidentsService.getStatuses();
    }
    async rebuildFeed(req) {
        if (req.user.roleName !== 'master') {
            throw new common_1.ForbiddenException('Only master may trigger feed rebuild');
        }
        const rebuilt = await this.feedRecoveryService.rebuildFeed();
        return { rebuilt };
    }
    findOne(id, req) {
        return this.incidentsService.findOne(id, req.user.scope, req.user.userId);
    }
    async updateStatus(id, dto, req) {
        const user = req.user;
        return this.workflow.changeStatus({
            incidentId: id,
            to: dto.status,
            actorId: user.userId,
            actorPermissions: user.permissions ?? [],
            closedReason: dto.closed_reason,
        });
    }
    update(id, dto) {
        return this.incidentsService.update(id, {
            title: dto.title,
            description: dto.description,
            categoryId: dto.category_id,
        });
    }
    delete(id) {
        return this.incidentsService.softDelete(id);
    }
    revealReporter(id, dto, req) {
        return this.revealService.reveal(id, req.user.userId, {
            justification: dto.justification,
            caseRef: dto.case_ref ?? null,
        });
    }
    listReveals(id) {
        return this.revealService.listReveals(id);
    }
};
exports.IncidentsController = IncidentsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(email_verified_guard_1.EmailVerifiedGuard),
    (0, require_permission_decorator_1.RequirePermission)('CREATE'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_incident_dto_1.CreateIncidentDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('zone_id')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'dashboard'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [stats_query_dto_1.StatsQueryDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('weekly-stats'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'dashboard'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [weekly_stats_query_dto_1.WeeklyStatsQueryDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "getWeeklyStats", null);
__decorate([
    (0, common_1.Get)('feed'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feed_query_dto_1.FeedQueryDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Get)(['export', 'exportar']),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'dashboard'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [export_query_dto_1.ExportQueryDto, String, Object, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "exportCsv", null);
__decorate([
    (0, common_1.Get)('statuses'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IncidentsController.prototype, "getStatuses", null);
__decorate([
    (0, common_1.Post)('admin/feed/rebuild'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "rebuildFeed", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('READ'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_incident_status_dto_1.UpdateIncidentStatusDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_incident_dto_1.UpdateIncidentDto]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('DELETE'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/reveal-reporter'),
    (0, require_permission_decorator_1.RequirePermission)('REVEAL'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reveal_incident_dto_1.RevealIncidentDto, Object]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "revealReporter", null);
__decorate([
    (0, common_1.Get)(':id/reveals'),
    (0, require_permission_decorator_1.RequirePermission)('REVEAL'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IncidentsController.prototype, "listReveals", null);
exports.IncidentsController = IncidentsController = __decorate([
    (0, common_1.Controller)('incidents'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [incidents_service_1.IncidentsService,
        incident_analytics_service_1.IncidentAnalyticsService,
        incident_feed_service_1.IncidentFeedService,
        incident_export_service_1.IncidentExportService,
        feed_recovery_service_1.FeedRecoveryService,
        incident_workflow_service_1.IncidentWorkflowService,
        reveal_service_1.RevealService])
], IncidentsController);
//# sourceMappingURL=incidents.controller.js.map