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
var IncidentMailListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentMailListener = exports.RETRY_BACKOFF_MS = exports.INCIDENT_MAIL_CONSUMER_GROUP = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_module_1 = require("../../core/core.module");
const user_entity_1 = require("../../entities/user.entity");
const incidents_service_1 = require("../incidents/incidents.service");
const stream_event_util_1 = require("../realtime/stream-event.util");
const mail_service_1 = require("./mail.service");
exports.INCIDENT_MAIL_CONSUMER_GROUP = 'mail';
exports.RETRY_BACKOFF_MS = 1000;
const ADMIN_LIST_TTL_MS = 60_000;
let IncidentMailListener = IncidentMailListener_1 = class IncidentMailListener {
    constructor(redis, mailService, userRepo, dataSource) {
        this.redis = redis;
        this.mailService = mailService;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(IncidentMailListener_1.name);
        this.consumerName = `mail-events-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
        this.running = false;
        this.adminCache = null;
    }
    async onModuleInit() {
        try {
            await this.redis.xgroup('CREATE', incidents_service_1.INCIDENTS_STREAM_KEY, exports.INCIDENT_MAIL_CONSUMER_GROUP, '$', 'MKSTREAM');
        }
        catch (err) {
            if (!err.message?.includes('BUSYGROUP')) {
                this.logger.error(`Failed to create mail-events consumer group: ${err.message}`);
            }
        }
        this.running = true;
        void this.loop();
    }
    async onModuleDestroy() {
        this.running = false;
        await this.redis.quit().catch(() => undefined);
    }
    async loop() {
        while (this.running) {
            try {
                const response = await this.redis.xreadgroup('GROUP', exports.INCIDENT_MAIL_CONSUMER_GROUP, this.consumerName, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', incidents_service_1.INCIDENTS_STREAM_KEY, '>');
                if (response) {
                    await this.processResponse(response);
                }
            }
            catch (err) {
                if (!this.running) {
                    break;
                }
                this.logger.error(`Mail-events listener loop error: ${err.message}`);
                await this.sleep(exports.RETRY_BACKOFF_MS);
            }
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async processResponse(response) {
        for (const [, entries] of response) {
            for (const [entryId, fields] of entries) {
                const event = (0, stream_event_util_1.decodeStreamEntry)(fields);
                if (event) {
                    await this.route(event.type, event.data);
                }
                await this.redis.xack(incidents_service_1.INCIDENTS_STREAM_KEY, exports.INCIDENT_MAIL_CONSUMER_GROUP, entryId);
            }
        }
    }
    async route(type, data) {
        switch (type) {
            case 'incident.created':
                await this.handleIncidentCreated(data);
                break;
            case 'incident.assigned':
                await this.handleIncidentAssigned(data);
                break;
            case 'incident.status_changed':
                await this.handleStatusChanged(data);
                break;
            case 'comment.created':
                await this.handleCommentCreated(data);
                break;
            default:
                break;
        }
    }
    async handleIncidentCreated(data) {
        const reporterId = data.citizen_id;
        const mailData = { title: data.title, description: data.description };
        await this.enqueueToUsers([reporterId].filter((id) => Boolean(id)), 'incident.created', mailData);
        await this.enqueueToEmails(await this.getAdminEmails(), 'incident.created', mailData);
    }
    async handleIncidentAssigned(data) {
        const assigneeId = data.operatorId;
        if (!assigneeId) {
            return;
        }
        await this.enqueueToUsers([assigneeId], 'incident.assigned', { title: data.title ?? data.incidentId });
    }
    async handleStatusChanged(data) {
        const reporterId = data.citizen_id;
        const assigneeId = data.assigned_to;
        const recipientIds = [reporterId, assigneeId].filter((id) => Boolean(id));
        await this.enqueueToUsers(recipientIds, 'incident.status_changed', {
            title: data.title,
            status: data.status,
        });
    }
    async handleCommentCreated(data) {
        const reporterId = data.reporter_id;
        const priorCommenterIds = data.prior_commenter_ids ?? [];
        const recipientIds = [reporterId, ...priorCommenterIds].filter((id) => Boolean(id));
        await this.enqueueToUsers(recipientIds, 'comment.created', { content: data.content });
    }
    async enqueueToUsers(userIds, template, data) {
        const uniqueIds = [...new Set(userIds)];
        for (const userId of uniqueIds) {
            const user = await this.userRepo.findOne({ where: { id: userId } });
            if (!user || !user.email) {
                this.logger.debug(`Skipping mail for user ${userId}: no email on file`);
                continue;
            }
            await this.mailService.enqueue({
                to: user.email,
                subject: this.subjectFor(template, data),
                template,
                data,
            });
        }
    }
    async enqueueToEmails(emails, template, data) {
        for (const email of [...new Set(emails)]) {
            await this.mailService.enqueue({ to: email, subject: this.subjectFor(template, data), template, data });
        }
    }
    subjectFor(template, data) {
        const title = typeof data.title === 'string' ? data.title : '';
        switch (template) {
            case 'incident.created':
                return `New incident reported: ${title}`;
            case 'incident.assigned':
                return `Incident assigned to you: ${title}`;
            case 'incident.status_changed':
                return `Incident status changed: ${title}`;
            case 'comment.created':
                return 'New comment on your incident';
            default:
                return 'Transito Alerta SE notification';
        }
    }
    async getAdminEmails() {
        const now = Date.now();
        if (this.adminCache && this.adminCache.expiresAt > now) {
            return this.adminCache.emails;
        }
        const rows = await this.dataSource.query(`SELECT u.id, u.email FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.name = 'admin' AND u.is_active = true`);
        const emails = rows.map((row) => row.email).filter((email) => Boolean(email));
        this.adminCache = { emails, expiresAt: now + ADMIN_LIST_TTL_MS };
        return emails;
    }
};
exports.IncidentMailListener = IncidentMailListener;
exports.IncidentMailListener = IncidentMailListener = IncidentMailListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.MAIL_EVENTS_BLOCKING_CLIENT)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(3, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [Function, mail_service_1.MailService,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], IncidentMailListener);
//# sourceMappingURL=incident-mail.listener.js.map